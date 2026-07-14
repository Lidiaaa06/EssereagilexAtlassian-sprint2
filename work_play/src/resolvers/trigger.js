import { aggiungiPunti, controllaStagione, getPuntiPerTicket } from './stagione';
import { registraInProgress, pulisciInProgress, controllaChiusura, aggiungiSegnalazione } from './antifarming';
import { kvs } from '@forge/kvs';

const TEAM = [
    { nome: "Roberto", accountId: "712020:a4ccdea1-0bb3-408f-9623-93c19691d980" },
    { nome: "Alessandro", accountId: "712020:48b975fc-daa2-4bc8-92dd-f8bf751a454a" },
    { nome: "Ludovica", accountId: "712020:c82776d1-c22b-4b85-ae3c-0110c541520f" },
    { nome: "Matthia", accountId: "712020:68180304-900d-4cbe-ad8e-73695ad5b96d" },
    { nome: "Lidia", accountId: "712020:5930294d-413c-434a-ae40-db82633bff30" },
];

// Stati che contano come COMPLETAMENTO riuscito → assegnano punti.
// Coprono i 3 workflow: standard (DONE), incident (RESOLVED), service request (CLOSED COMPLETED).
// I nomi vanno in minuscolo, perché li confrontiamo con statoAttuale già lowercased.
// NON incluse volutamente: 'canceled', 'closed skipped', 'closed incompleted'
// (terminali ma non successi → nessun punto). Sposta qui se decidi il contrario.
const STATI_COMPLETAMENTO = new Set([
    'done',
    'resolved',
    'closed completed',
]);

// Stati "in lavorazione": avviano il timer antifarming, nessun punto.
// ON HOLD e PENDING restano fuori: sono pause, non lavorazione attiva.
const STATI_IN_LAVORAZIONE = new Set([
    'in progress',
]);

export const handler = async (event, context) => {
    const stato = await controllaStagione(TEAM);

    if (stato === 'pausa') {
        console.log('Stagione in pausa - nessun punto assegnato');
        return;
    }

    const issue = event.issue;
    const changelog = event.changelog;

    const assigneeId = issue?.fields?.assignee?.accountId;
    if (!assigneeId) {
        console.log('Nessun assignee trovato');
        return;
    }

    const membroTeam = TEAM.find(m => m.accountId === assigneeId);
    if (!membroTeam) {
        console.log('Assignee non nel team');
        return;
    }

    const statusChange = changelog?.items?.find(item => item.field === 'status');
    if (!statusChange) {
        console.log('Nessun cambio di status');
        return;
    }

    const statoPreced = statusChange.fromString?.toLowerCase();
    const statoAttuale = statusChange.toString?.toLowerCase();

    console.log(`Ticket ${issue.key}: ${statoPreced} → ${statoAttuale} (assignee: ${membroTeam.nome})`);

    // Un solo posto dove si decide "è un completamento?", valido per tutti e 3 i workflow.
    const eraCompletato = STATI_COMPLETAMENTO.has(statoPreced);
    const oraCompletato = STATI_COMPLETAMENTO.has(statoAttuale);

    // Entrato in un completamento (DONE / RESOLVED / CLOSED COMPLETED) da uno stato
    // NON completato → controllo antifarming + punti + incrementa contatore.
    // La guardia !eraCompletato evita il doppio conteggio se si passa da un verde
    // all'altro (es. RESOLVED → CLOSED COMPLETED): là non si ri-assegnano punti.
    if (oraCompletato && !eraCompletato) {
        // Il controllo NON blocca i punti: segnala e basta (scelta di design).
        const { flags, secondiInProgress } = await controllaChiusura(issue.key, statoPreced);

        if (flags.length > 0) {
            await aggiungiSegnalazione({
                issueKey: issue.key,
                accountId: assigneeId,
                nome: membroTeam.nome,
                flags,
                secondiInProgress,
            });
        }

        const punti = await getPuntiPerTicket();
        await aggiungiPunti(assigneeId, punti);
        const ticketAttuali = await kvs.get(`ticket-stagione-${assigneeId}`) || 0;
        await kvs.set(`ticket-stagione-${assigneeId}`, ticketAttuali + 1);
        console.log(`+${punti} punti a ${membroTeam.nome} (ticket stagione: ${ticketAttuali + 1})`);
        return;
    }

    // Uscito da un completamento verso uno stato NON completato → riapertura:
    // -punti + decrementa contatore. Cattura anche i casi "verde → annullato/saltato"
    // (RESOLVED → CANCELED, CLOSED COMPLETED → CLOSED SKIPPED): il punto va tolto.
    // ATTENZIONE all'ordine: sta PRIMA del ramo In Progress, altrimenti una riapertura
    // verso In Progress salterebbe la sottrazione.
    if (eraCompletato && !oraCompletato) {
        const punti = await getPuntiPerTicket();
        await aggiungiPunti(assigneeId, -punti);
        const ticketAttuali = await kvs.get(`ticket-stagione-${assigneeId}`) || 0;
        await kvs.set(`ticket-stagione-${assigneeId}`, Math.max(0, ticketAttuali - 1));
        console.log(`-${punti} punti a ${membroTeam.nome} (ticket stagione: ${Math.max(0, ticketAttuali - 1)})`);

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