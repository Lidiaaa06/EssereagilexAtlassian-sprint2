import { eseguiDecanter } from './decanter';
import { pulisciAudit } from './audit';

// Manutenzione giornaliera: UNICO scheduled trigger (interval: day) che orchestra
// i lavori che maturano nel tempo, invece di avere un modulo scheduledTrigger per
// feature. Open Points id-63: "scheduled trigger = infrastruttura condivisa,
// progettata una volta sola" (rollover stagioni, countdown, trigger a tempo,
// rotazione Audit Log).
//
// Oggi esegue:
//   1) Decanter — scansione dei work item fermi (trigger a tempo).
//   2) Pulizia Audit Log — retention 45 giorni, a batch.
// Domani si aggiungeranno rollover stagioni e notifiche countdown, come nuovi job.
//
// Ogni job è isolato in try/catch: se uno fallisce, gli altri girano lo stesso.

const job = async (nome, fn) => {
  try {
    const esito = await fn();
    console.log(`[manutenzione] ${nome}: ok`, JSON.stringify(esito || {}));
    return { nome, ok: true, esito };
  } catch (e) {
    console.log(`[manutenzione] ${nome}: ERRORE ${e?.message || e}`);
    return { nome, ok: false, errore: String(e?.message || e) };
  }
};

export const handler = async () => {
  console.log('[manutenzione] avvio giornaliero');
  const risultati = [];
  risultati.push(await job('decanter', eseguiDecanter));
  risultati.push(await job('pulizia-audit', pulisciAudit));
  console.log('[manutenzione] fine giornaliero');
  return { ok: true, risultati };
};
