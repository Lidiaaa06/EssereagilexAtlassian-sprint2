import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { getRegoleFamiglia, statiDi } from './regole-workflow';
import { aggiungiSegnalazione, FLAG_DECANTER } from './antifarming';
import { logAudit } from './audit';
import { formattaDurata } from './durata';

// Motore dei trigger a TEMPO (famiglia 'tempo'). A differenza dei trigger a
// evento (trigger.js), qui non c'è un evento Jira: la condizione "fermo da troppo
// tempo" matura nel silenzio. Questo modulo è chiamato da uno scheduled trigger
// Forge (vedi manifest.yml → scheduledTrigger) che gira periodicamente.
//
// Oggi c'è un solo trigger a tempo: Work Item Decanter. Per ogni regola di
// famiglia 'tempo' scandisce i work item fermi negli stati sorvegliati oltre la
// soglia di giorni e, senza togliere punti:
//   1) mette una segnalazione nella coda del Team Leader (stessa coda anti-farming);
//   2) commenta il work item avvisando l'assegnatario (best-effort, come app).
//
// NIENTE malus (scelta 20/07): il sistema segnala, l'umano decide.

const GIORNO_MS = 24 * 60 * 60 * 1000;
const MINUTO_MS = 60 * 1000;

// Quante issue al massimo scandiamo per (regola, stato). Se una regola supera
// questo tetto lo scriviamo nei log: mai troncare in silenzio.
const MAX_PER_STATO = 200;

// Dedup: per ogni (issue, stato) memorizziamo l'istante di ingresso già
// segnalato. Se al giro dopo l'issue è ancora lì con lo STESSO ingresso non
// ri-segnaliamo; se è rientrata (ingresso diverso) sì. Evita lo spam notturno.
const chiaveDedup = (issueKey, statoId) => `decanter-${issueKey}-${statoId}`;

// Momento in cui il work item è entrato NELLO stato corrente: il timestamp
// dell'ultima transizione di status verso `statoId` nel changelog. Se l'issue è
// stata creata direttamente in quello stato (nessuna transizione), usiamo la
// data di creazione.
const entrataInStato = (issue, statoId) => {
  let entrata = null;
  const histories = issue.changelog?.histories || [];
  histories.forEach((h) => {
    (h.items || []).forEach((it) => {
      if (it.field === 'status' && String(it.to) === String(statoId)) {
        const t = Date.parse(h.created);
        if (!Number.isNaN(t) && (entrata === null || t > entrata)) entrata = t;
      }
    });
  });
  if (entrata === null) {
    const creata = Date.parse(issue.fields?.created);
    entrata = Number.isNaN(creata) ? null : creata;
  }
  return entrata;
};

// Commento in formato ADF (come golden-ticket.js). Durate già formattate leggibili.
const corpoCommento = (statoNome, durata, soglia) => ({
  version: 1,
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `⏳ Promemoria WorkPlay: questo work item è nello stato «${statoNome}» da ${durata}, oltre il tempo medio previsto di ${soglia}. Se sei bloccato, parlane con il tuo Team Leader.`,
        },
      ],
    },
  ],
});

// Commenta il work item (best-effort: un errore non deve fermare la scansione).
const commentaIssue = async (issueKey, statoNome, durata, soglia) => {
  try {
    const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: corpoCommento(statoNome, durata, soglia) }),
    });
    if (!res.ok) {
      console.log(`[decanter] commento non aggiunto su ${issueKey} (HTTP ${res.status})`);
    }
  } catch (e) {
    console.log(`[decanter] errore commento su ${issueKey}: ${e.message}`);
  }
};

// Issue attualmente in (progetto, issue type, stato), col changelog per misurare
// il tempo-in-stato. Paginazione con tetto di sicurezza MAX_PER_STATO.
//
// Usa `/rest/api/3/search/jql` (POST): il vecchio `/rest/api/3/search` è stato
// DISMESSO da Atlassian (rispondeva HTTP 410). Cambia la paginazione: non più
// startAt/total ma `nextPageToken` (e `isLast`). Se il changelog non arriva,
// `entrataInStato` ripiega sulla data di creazione, quindi la scansione regge
// comunque.
const cercaIssue = async (progettoKey, issueTypeId, statoId) => {
  const jql = `project = "${progettoKey}" AND issuetype = ${issueTypeId} AND status = ${statoId} ORDER BY created ASC`;
  const trovate = [];
  let nextPageToken;

  while (trovate.length < MAX_PER_STATO) {
    const body = {
      jql,
      maxResults: 50,
      fields: ['assignee', 'summary', 'created', 'status'],
      expand: 'changelog',
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const res = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.log(`[decanter] ricerca fallita per ${progettoKey}/${issueTypeId}/${statoId} (HTTP ${res.status})`);
      break;
    }
    const dati = await res.json();
    const pagina = dati.issues || [];
    trovate.push(...pagina);
    nextPageToken = dati.nextPageToken;
    if (!nextPageToken || dati.isLast) break;
  }

  if (trovate.length >= MAX_PER_STATO) {
    console.log(`[decanter] ATTENZIONE: tetto ${MAX_PER_STATO} raggiunto per ${progettoKey}/${issueTypeId}/${statoId}: alcune issue potrebbero non essere scansionate.`);
  }
  return trovate;
};

// Esegue una passata completa. Esportata a parte dal handler così è richiamabile
// anche da un resolver admin ("esegui ora") per testare senza aspettare lo
// schedule. Restituisce un riepilogo.
export const eseguiDecanter = async () => {
  const regole = await getRegoleFamiglia('tempo');
  if (regole.length === 0) {
    console.log('[decanter] nessuna regola a tempo: niente da fare.');
    return { ok: true, regole: 0, scansionati: 0, decantati: 0 };
  }

  const ora = Date.now();
  let scansionati = 0;
  let decantati = 0;

  for (const regola of regole) {
    // Soglia in MINUTI: nuova forma (sogliaMinuti) o fallback legacy (sogliaGiorni × 1440).
    const sogliaMin = Number.isFinite(regola.sogliaMinuti)
      ? regola.sogliaMinuti
      : (Number(regola.sogliaGiorni) || 0) * 1440;
    if (!(sogliaMin >= 1)) continue;
    if (!regola.issueTypeId) continue;

    for (const stato of statiDi(regola)) {
      const issues = await cercaIssue(regola.progettoKey, regola.issueTypeId, stato.id);

      for (const issue of issues) {
        scansionati += 1;

        const assignee = issue.fields?.assignee;
        if (!assignee?.accountId) continue; // nessuno da avvisare
        // NESSUN gate "membro del team" (coerente con trigger.js, scelta 20/07):
        // il Decanter segnala per QUALSIASI assegnatario, non solo per chi è nella
        // vecchia lista `membri`. Il nome viene direttamente dall'assegnatario Jira.
        const assigneeNome = assignee.displayName || assignee.accountId;

        const entrata = entrataInStato(issue, stato.id);
        if (entrata === null) continue;

        const minutiFermo = Math.floor((ora - entrata) / MINUTO_MS);
        if (minutiFermo < sogliaMin) continue; // non ancora "decantato"

        // Durate leggibili per commento/segnalazione/audit (es. "2g 3h").
        const durataLeg = formattaDurata(minutiFermo);
        const sogliaLeg = formattaDurata(sogliaMin);

        // È la PRIMA volta che segnaliamo questo ingresso nello stato?
        const chiave = chiaveDedup(issue.key, stato.id);
        const primaVolta = (await kvs.get(chiave)) !== entrata;

        // Le AZIONI esterne (segnalazione al Team Leader + commento sull'issue) si
        // rifanno ad ogni scansione SOLO se la regola ha ripetiOgniGiro attivo;
        // altrimenti una volta sola per "soggiorno" nello stato (anti-spam).
        if (regola.ripetiOgniGiro || primaVolta) {
          await aggiungiSegnalazione({
            issueKey: issue.key,
            accountId: assignee.accountId,
            nome: assigneeNome,
            flags: [FLAG_DECANTER],
            dettaglio: `Fermo in «${stato.nome}» da ${durataLeg} (previsti ${sogliaLeg}).`,
          });
          await commentaIssue(issue.key, stato.nome, durataLeg, sogliaLeg);
        }
        await kvs.set(chiave, entrata);

        // Audit: SEMPRE, ad ogni scansione (giornaliera o forzata). È lo storico
        // "tracciato ogni volta" richiesto: il pannello Activity/Dashboard e il
        // conteggio riflettono ogni rilevamento, anche quando le azioni non si ripetono.
        await logAudit({
          y: 'trigger',
          s: assignee.accountId,
          d: { i: issue.key, k: 'decanter', st: stato.nome, gi: minutiFermo, so: sogliaMin },
          o: 'ok',
        });

        decantati += 1;
        console.log(`[decanter] ${issue.key} rilevato fermo: ${durataLeg} in «${stato.nome}» (soglia ${sogliaLeg}) → ${assigneeNome}${(regola.ripetiOgniGiro || primaVolta) ? ' (segnalato)' : ' (solo tracciato)'}`);
      }
    }
  }

  // Ultima esecuzione per ogni regola a tempo scansionata (colonna admin "Ultima").
  for (const r of regole) {
    try { await kvs.set(`decanter-lastrun-${r.id}`, ora); } catch (e) { /* non critico */ }
  }

  console.log(`[decanter] fatto: ${regole.length} regole, ${scansionati} issue scansionate, ${decantati} decantate.`);
  return { ok: true, regole: regole.length, scansionati, decantati };
};

// Timestamp (ms) dell'ultima esecuzione del Decanter per una regola, o null se
// non è mai stato eseguito. Serve alla colonna "Ultima" della scheda Workflow.
export const getUltimaEsecuzioneDecanter = async (ruleId) => {
  const t = await kvs.get(`decanter-lastrun-${ruleId}`);
  return typeof t === 'number' ? t : null;
};

// Nota: non c'è più un handler scheduled qui. Il Decanter è ora un job orchestrato
// dallo scheduled trigger unico di manutenzione.js (che chiama `eseguiDecanter`).
// `eseguiDecanter` resta esportato anche per il resolver admin "esegui ora".
