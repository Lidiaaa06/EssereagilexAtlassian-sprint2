import { aggiungiPunti, controllaStagione, getPuntiPerTicket } from './stagione';
import { registraInProgress, pulisciInProgress, controllaChiusura, aggiungiSegnalazione } from './antifarming';
import { seedMembriSeVuoto } from './membri';
import { trovaRegola } from './regole-workflow';
import { logAudit } from './audit';
import { kvs } from '@forge/kvs';

// Array legacy: NON è più la fonte di verità del team. Serve solo come sorgente
// per il seed una-tantum su questa installazione esistente. Su un'installazione
// nuova questo seed non produce effetti perché 'membri' verrà popolata dall'admin.
const TEAM_LEGACY = [
  { nome: "Roberto", accountId: "712020:a4ccdea1-0bb3-408f-9623-93c19691d980" },
  { nome: "Alessandro", accountId: "712020:48b975fc-daa2-4bc8-92dd-f8bf751a454a" },
  { nome: "Ludovica", accountId: "712020:c82776d1-c22b-4b85-ae3c-0110c541520f" },
  { nome: "Matthia", accountId: "712020:68180304-900d-4cbe-ad8e-73695ad5b96d" },
  { nome: "Lidia", accountId: "712020:5930294d-413c-434a-ae40-db82633bff30" },
];

// Il COMPLETAMENTO non è più una lista hardcoded: dipende dalle regole di
// monitoraggio (scheda admin Workflow). Uno stato conta come completamento in un
// progetto SE e solo se c'è una regola per (progetto, stato). Vedi
// regole-workflow.js. Senza regole → nessun completamento → nessun punto.

// Stati "in lavorazione": avviano il timer antifarming, nessun punto. Restano
// hardcoded per nome — l'antifarming non è coperto dal mockup Workflow, che
// riguarda solo l'assegnazione punti al completamento. ON HOLD e PENDING fuori:
// sono pause, non lavorazione attiva.
const STATI_IN_LAVORAZIONE = new Set([
  'in progress',
]);

export const handler = async (event, context) => {
  // Migrazione una-tantum: popola 'membri' dai dati legacy se non esiste ancora.
  await seedMembriSeVuoto(TEAM_LEGACY);

  const stato = await controllaStagione();

  if (stato === 'pausa') {
    console.log('Stagione in pausa - nessun punto assegnato');
    return;
  }

  const issue = event.issue;
  const changelog = event.changelog;

  // I punti vanno all'ASSEGNATARIO del work item, chiunque sia. Nessun gate
  // "membro del team" (scelta 20/07): se il ticket non ha assegnatario, i punti
  // non vanno a nessuno — ed è corretto così.
  const assigneeId = issue?.fields?.assignee?.accountId;
  if (!assigneeId) {
    console.log('Nessun assignee trovato');
    return;
  }
  const assigneeNome = issue?.fields?.assignee?.displayName || assigneeId;

  const statusChange = changelog?.items?.find(item => item.field === 'status');
  if (!statusChange) {
    console.log('Nessun cambio di status');
    return;
  }

  // Nomi (per antifarming/log) e ID (per il match con le regole).
  const statoPreced = statusChange.fromString?.toLowerCase();
  const statoAttuale = statusChange.toString?.toLowerCase();
  const statoPrecedId = statusChange.from;
  const statoAttualeId = statusChange.to;

  // Progetto e issue type del work item: chiavi per trovare la regola giusta.
  // L'issue type è lo stesso prima e dopo il cambio di stato (non cambia con la
  // transizione), quindi vale per entrambi i controlli.
  const progettoKey = issue?.fields?.project?.key;
  const issueTypeId = issue?.fields?.issuetype?.id;

  console.log(`Ticket ${issue.key} (${progettoKey}/${issueTypeId}): ${statoPreced} → ${statoAttuale} (assignee: ${assigneeNome})`);

  // "È un completamento?" ora lo decidono le REGOLE, per progetto, issue type e
  // stato. Senza una regola che copre (progetto, issue type, stato) → non è un
  // completamento. Regole legacy senza issue type valgono per qualsiasi tipo.
  const eraCompletato = progettoKey
    ? Boolean(await trovaRegola(progettoKey, issueTypeId, statoPrecedId))
    : false;
  const oraCompletato = progettoKey
    ? Boolean(await trovaRegola(progettoKey, issueTypeId, statoAttualeId))
    : false;

  // Entrato in un completamento (DONE / RESOLVED / CLOSED COMPLETED) da uno stato
  // NON completato → antifarming + punti + incrementa contatore.
  // La guardia !eraCompletato evita il doppio conteggio se si passa da un verde
  // all'altro (es. RESOLVED → CLOSED COMPLETED): là non si ri-assegnano punti.
  if (oraCompletato && !eraCompletato) {
    // Il controllo NON blocca i punti: segnala e basta (scelta di design).
    const { flags, secondiInProgress } = await controllaChiusura(issue.key, statoPreced);

    if (flags.length > 0) {
      await aggiungiSegnalazione({
        issueKey: issue.key,
        accountId: assigneeId,
        nome: assigneeNome,
        flags,
        secondiInProgress,
      });
    }

    const punti = await getPuntiPerTicket();
    await aggiungiPunti(assigneeId, punti);
    const ticketAttuali = await kvs.get(`ticket-stagione-${assigneeId}`) || 0;
    await kvs.set(`ticket-stagione-${assigneeId}`, ticketAttuali + 1);
    console.log(`+${punti} punti a ${assigneeNome} (ticket stagione: ${ticketAttuali + 1})`);

    // Audit: assegnazione punti (fail-safe, non blocca nulla). Campi arricchiti
    // per il pannello Activity: k = tipo evento, st = stato di arrivo, pr =
    // "KEY — Nome progetto", f = flag antifarming (per messaggi leggibili).
    await logAudit({
      y: 'trigger',
      s: assigneeId,
      d: {
        i: issue.key,
        p: punti,
        k: 'completato',
        st: statusChange.toString || statoAttuale,
        pr: `${progettoKey} — ${issue?.fields?.project?.name || progettoKey}`,
        f: flags,
        x: flags.length ? `+${punti} · segnalato: ${flags.join(', ')}` : `+${punti}`,
      },
      o: 'ok',
    });
    return;
  }

  // Uscito da un completamento verso uno stato NON completato → riapertura:
  // -punti + decrementa contatore. Cattura anche "verde → annullato/saltato"
  // (RESOLVED → CANCELED, CLOSED COMPLETED → CLOSED SKIPPED): il punto va tolto.
  // ATTENZIONE all'ordine: sta PRIMA del ramo In Progress, altrimenti una riapertura
  // verso In Progress salterebbe la sottrazione.
  if (eraCompletato && !oraCompletato) {
    const punti = await getPuntiPerTicket();
    await aggiungiPunti(assigneeId, -punti);
    const ticketAttuali = await kvs.get(`ticket-stagione-${assigneeId}`) || 0;
    await kvs.set(`ticket-stagione-${assigneeId}`, Math.max(0, ticketAttuali - 1));
    console.log(`-${punti} punti a ${assigneeNome} (ticket stagione: ${Math.max(0, ticketAttuali - 1)})`);

    // Audit: riapertura → punti tolti (fail-safe). Campi arricchiti come sopra.
    await logAudit({
      y: 'trigger',
      s: assigneeId,
      d: {
        i: issue.key,
        p: -punti,
        k: 'riapertura',
        st: statusChange.toString || statoAttuale,
        pr: `${progettoKey} — ${issue?.fields?.project?.name || progettoKey}`,
        x: 'riapertura',
      },
      o: 'ok',
    });

    // Se la riapertura porta il ticket in lavorazione, il timer riparte da adesso.
    if (STATI_IN_LAVORAZIONE.has(statoAttuale)) {
      await registraInProgress(issue.key);
    } else {
      await pulisciInProgress(issue.key);
    }
    return;
  }

  // Entrato in lavorazione (non da un completamento, gestito sopra) → avvia il timer.
  if (STATI_IN_LAVORAZIONE.has(statoAttuale)) {
    await registraInProgress(issue.key);
    return;
  }

  // Uscito dalla lavorazione verso uno stato non completato (es. ON HOLD, PENDING,
  // di nuovo OPEN) → il timer non ha più senso, lo azzeriamo.
  if (STATI_IN_LAVORAZIONE.has(statoPreced)) {
    await pulisciInProgress(issue.key);
    return;
  }
};