import { kvs, WhereConditions } from '@forge/kvs';

// Audit Log — cronologia compatta di ciò che accade nell'app (Open Points id-64/65/66).
//
// Tre famiglie di eventi (campo `y`): 'trigger' | 'config' | 'tl'.
// Ogni entry è una coppia KVS con CHIAVE ORDINABILE PER DATA:
//   audit:<ISO-8601 UTC>:<rand4>   es. audit:2026-07-20T21:15:32.412Z:x7k2
// La regex chiave KVS ammette `:` `.` `-` (verificata sui doc), quindi l'ISO va bene.
//
// Vincoli (dal prompt / CLAUDE.md), rispettati qui:
//   • Valori MINIMI: solo chiavi e numeri, mai oggetti Jira/utente interi.
//   • Niente `null` in KVS: si omettono i campi vuoti (KVS accetta oggetti vuoti, non null).
//   • Retention 45 giorni: pulizia in `pulisciAudit`, chiamata dallo scheduled trigger.
//   • FAIL-SAFE: `logAudit` non lancia MAI — se il log fallisce, l'azione principale
//     (punti, config) va comunque a buon fine.

const PREFISSO = 'audit:';
const GIORNO_MS = 24 * 60 * 60 * 1000;
const RETENTION_GIORNI = 45;

// Quante entry al massimo raccogliamo in una lettura, per non sforare i limiti
// di runtime/costi su finestre molto ampie. Oltre, la UI invita a restringere le date.
const MAX_RACCOLTA = 3000;
// Quante delete al massimo per esecuzione della pulizia (batch): se non finisce,
// riprende il giorno dopo (le vecchie restano in testa, quindi riparte da lì).
const MAX_DELETE_PER_RUN = 500;

// Rimuove i campi undefined/null/'' — così in KVS non finiscono valori nulli e le
// entry restano compatte.
const compatta = (obj) => {
  const out = {};
  Object.keys(obj || {}).forEach((k) => {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  });
  return out;
};

// Suffisso casuale a 4 caratteri per disambiguare due eventi nello stesso ms.
// Math.random va bene qui (funzione FaaS normale, non uno script di orchestrazione).
const rand4 = () => Math.random().toString(36).slice(2).padEnd(4, '0').slice(0, 4);

// Prefisso comune di due stringhe ISO: restringe la scansione KVS alla finestra
// (es. se from/to sono nello stesso mese → 'audit:2026-07-').
const prefissoComune = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return a.slice(0, i);
};

// ------------------------------------------------------------------ scrittura

// Registra un evento. `y` tipo, `a` autore (accountId o 'system'), `s` developer
// interessato (opzionale), `d` dettaglio { r?, i?, p?, x? }, `o` esito.
// NON lancia mai: il logging non deve rompere il flusso principale.
export const logAudit = async ({ y, a, s, d, o } = {}) => {
  try {
    const t = new Date().toISOString();
    const chiave = `${PREFISSO}${t}:${rand4()}`;
    const valore = compatta({ t, y, a: a || 'system', s, o: o || 'ok' });
    valore.d = compatta(d);
    await kvs.set(chiave, valore);
  } catch (e) {
    // Solo log: l'azione a monte (punti/config) è già andata a buon fine.
    console.log(`[audit] entry non scritta (${e?.message || e}) — flusso principale non toccato`);
  }
};

// ------------------------------------------------------------------- lettura

// Restituisce una pagina di ≤50 entry nella finestra [from, to], filtrate per
// tipo e developer, ORDINATE dalla più recente. `cursor` = offset numerico (stringa).
//
// Perché offset e non cursor KVS: la simple KVS pagina solo in avanti per chiave
// crescente (più vecchie prima) e non ha ordinamento discendente; per mostrare le
// più recenti in cima raccogliamo la finestra (limitata dalle date + retention) e
// la ordiniamo qui. Ai volumi previsti è semplice e corretto; se un domani il log
// crescesse molto, si passa a chiavi con timestamp invertito + cursor KVS.
export const getAuditLog = async ({ from, to, type, developer, cursor } = {}) => {
  const prefix = PREFISSO + prefissoComune(from || '', to || '');

  const raccolte = [];
  let kvsCursor;
  let troncato = false;

  do {
    let q = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(100);
    if (kvsCursor) q = q.cursor(kvsCursor);
    const page = await q.getMany();

    for (const r of page.results) {
      const v = r.value;
      if (!v || !v.t) continue;
      if (from && v.t < from) continue;
      if (to && v.t > to) continue;
      if (type && type !== 'all' && v.y !== type) continue;
      if (developer && v.s !== developer && v.a !== developer) continue;
      raccolte.push(v);
      if (raccolte.length >= MAX_RACCOLTA) { troncato = true; break; }
    }

    kvsCursor = troncato ? undefined : page.nextCursor;
  } while (kvsCursor);

  raccolte.sort((x, y2) => (x.t < y2.t ? 1 : x.t > y2.t ? -1 : 0)); // più recenti prima

  const offset = Number.parseInt(cursor, 10) || 0;
  const entries = raccolte.slice(offset, offset + 50);
  const nextCursor = offset + 50 < raccolte.length ? String(offset + 50) : undefined;

  return { entries, nextCursor, totale: raccolte.length, troncato };
};

// Tutti gli eventi audit che riguardano UNA specifica issue (campo d.i), dal più
// recente. Serve al pannello "WorkPlay" nell'Activity della issue: così i trigger
// che l'hanno coinvolta si vedono anche dalla history, non solo dall'Audit Log.
//
// Niente finestra date qui: per una singola issue vogliamo TUTTA la sua storia
// (entro i 45 giorni di retention). Scansione dell'intero prefisso, filtro per issue.
export const getEventiIssue = async (issueKey) => {
  if (!issueKey) return [];

  const raccolte = [];
  let kvsCursor;

  do {
    let q = kvs.query().where('key', WhereConditions.beginsWith(PREFISSO)).limit(100);
    if (kvsCursor) q = q.cursor(kvsCursor);
    const page = await q.getMany();

    for (const r of page.results) {
      const v = r.value;
      if (v?.d?.i === issueKey) raccolte.push(v);
      if (raccolte.length >= MAX_RACCOLTA) break;
    }

    kvsCursor = raccolte.length >= MAX_RACCOLTA ? undefined : page.nextCursor;
  } while (kvsCursor);

  raccolte.sort((x, y2) => (x.t < y2.t ? 1 : x.t > y2.t ? -1 : 0)); // più recenti prima
  return raccolte;
};

// ------------------------------------------------------------------- pulizia

// Elimina le entry più vecchie di RETENTION_GIORNI, a batch. Le chiavi sono
// ISO-ascendenti, quindi le più vecchie stanno in testa: appena ne incontriamo
// una più recente del cutoff possiamo fermarci (tutte le successive sono nuove).
export const pulisciAudit = async () => {
  const cutoff = new Date(Date.now() - RETENTION_GIORNI * GIORNO_MS).toISOString();

  let eliminate = 0;
  let kvsCursor;

  do {
    let q = kvs.query().where('key', WhereConditions.beginsWith(PREFISSO)).limit(100);
    if (kvsCursor) q = q.cursor(kvsCursor);
    const page = await q.getMany();

    for (const r of page.results) {
      const t = r.value?.t;
      // Entry senza timestamp: non so datarla, la salto (non ne creiamo, ma per sicurezza).
      if (!t) continue;
      // Raggiunte le entry recenti: da qui in poi sono tutte dentro la retention.
      if (t >= cutoff) {
        console.log(`[audit] pulizia: ${eliminate} entry rimosse (finito, raggiunto il cutoff)`);
        return { eliminate, completato: true };
      }
      await kvs.delete(r.key);
      eliminate += 1;
      if (eliminate >= MAX_DELETE_PER_RUN) {
        console.log(`[audit] pulizia: ${eliminate} entry rimosse (batch pieno, riprende domani)`);
        return { eliminate, completato: false };
      }
    }

    kvsCursor = page.nextCursor;
  } while (kvsCursor);

  console.log(`[audit] pulizia: ${eliminate} entry rimosse (finito, log scandito tutto)`);
  return { eliminate, completato: true };
};
