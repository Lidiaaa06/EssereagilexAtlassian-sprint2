import { kvs } from '@forge/kvs';
import api, { route } from '@forge/api';
import { getNumeroStagione } from './stagione';

const SOGLIA_DEFAULT = 100;
const MAX_DEFAULT = 3;
const PARTENZA_DEFAULT = 1;

// Chiave record per (stagione, operatore). Legarla al NUMERO di stagione reale
// fa sì che i golden ticket si azzerino da soli a ogni nuova stagione: cambia il
// numero → cambia la chiave → record fresco.
const chiaveRecord = (numeroStagione, accountId) => `golden-ticket-${numeroStagione}-${accountId}`;

// Soglia dei punti per il golden ticket "guadagnato", configurabile dal
// supervisore (come i punti-per-ticket). Uso ?? così un eventuale 0 resta 0.
export const getSogliaGoldenTicket = async () => {
  return await kvs.get('config-soglia-golden-ticket') ?? SOGLIA_DEFAULT;
};

export const setSogliaGoldenTicket = async (n) => {
  const val = Number(n);
  if (!Number.isFinite(val)) throw new Error('Valore non valido');
  await kvs.set('config-soglia-golden-ticket', val);
  return val;
};

// Numero massimo di golden ticket accumulabili in una stagione. Configurabile.
export const getMaxGoldenTicket = async () => {
  return await kvs.get('config-gt-max') ?? MAX_DEFAULT;
};

export const setMaxGoldenTicket = async (n) => {
  const val = Number(n);
  if (!Number.isFinite(val) || val < 1) throw new Error('Il massimo deve essere almeno 1');
  await kvs.set('config-gt-max', val);
  return val;
};

// Ticket di partenza a inizio stagione (importo del grant monthly1). Configurabile.
export const getPartenzaGoldenTicket = async () => {
  return await kvs.get('config-gt-partenza') ?? PARTENZA_DEFAULT;
};

export const setPartenzaGoldenTicket = async (n) => {
  const val = Number(n);
  if (!Number.isFinite(val) || val < 0) throw new Error('I ticket di partenza non possono essere negativi');
  await kvs.set('config-gt-partenza', val);
  return val;
};

// Record vuoto: nessun null (vincolo KVS), grants tutti false, ledger vuoto.
const recordVuoto = (numeroStagione, accountId) => ({
  accountId,
  numeroStagione,
  balance: 0,
  grants: { monthly1: false, monthly2: false, earned: false },
  pendingNotice: false,
  ledger: [],
});

const loadRecord = async (numeroStagione, accountId) => {
  return (await kvs.get(chiaveRecord(numeroStagione, accountId)))
    ?? recordVuoto(numeroStagione, accountId);
};

// Idempotente: ogni grant scatta al massimo una volta per stagione (flag).
// Quando scatta EARNED alziamo pendingNotice, così il pannello mostra il banner
// "guadagnato" una volta sola.
const applyGrant = (rec, which, amount, max) => {
  if (rec.grants[which]) return rec;
  rec.grants[which] = true;
  const nuovoBalance = Math.min(max, rec.balance + amount);
  const delta = nuovoBalance - rec.balance;
  if (delta > 0) {
    rec.balance = nuovoBalance;
    rec.ledger.push({
      type: which === 'earned' ? 'EARNED_POINTS' : 'GRANT_MONTHLY',
      which,
      delta,
      ts: Date.now(),
    });
    if (which === 'earned') rec.pendingNotice = true;
  }
  return rec;
};

// Inizio del 2° mese della stagione REALE, ricavato dal timestamp di inizio in KVS.
const inizioSecondoMese = (inizioStagioneMs) => {
  const d = new Date(inizioStagioneMs);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0).getTime();
};

// Riconcilia i grant per l'operatore usando stagione e punti REALI.
// puntiTotali è passato dal chiamante (stesso totale della classifica), così
// questo modulo non deve conoscere sfide/valutazioni.
export const reconcileGoldenTicket = async (accountId, puntiTotali) => {
  const numeroStagione = await getNumeroStagione();
  const inizioStagione = await kvs.get('stagione-inizio');
  const soglia = await getSogliaGoldenTicket();
  const max = await getMaxGoldenTicket();
  const partenza = await getPartenzaGoldenTicket();
  let rec = await loadRecord(numeroStagione, accountId);
  const now = Date.now();

  if (inizioStagione) {
    if (now >= inizioStagione) rec = applyGrant(rec, 'monthly1', partenza, max);
    if (now >= inizioSecondoMese(inizioStagione)) rec = applyGrant(rec, 'monthly2', 1, max);
  }
  if (puntiTotali >= soglia) rec = applyGrant(rec, 'earned', 1, max);

  await kvs.set(chiaveRecord(numeroStagione, accountId), rec);
  return { numeroStagione, rec, soglia };
};

// Azzera il flag di notifica dopo che il pannello ha mostrato il banner.
export const dismissGoldenTicketNotice = async (accountId) => {
  const numeroStagione = await getNumeroStagione();
  const rec = await loadRecord(numeroStagione, accountId);
  if (rec.pendingNotice) {
    rec.pendingNotice = false;
    await kvs.set(chiaveRecord(numeroStagione, accountId), rec);
  }
  return { ok: true };
};

// Registro globale dei golden ticket usati, per la vista supervisore nell'admin.
// È la notifica AFFIDABILE: interna all'app, non dipende dagli schermi di Jira.
const CHIAVE_USATI = 'golden-ticket-usati';
const MAX_USATI = 200; // cap per non far crescere la lista all'infinito

const appendUsato = async (voce) => {
  const lista = await kvs.get(CHIAVE_USATI) || [];
  await kvs.set(CHIAVE_USATI, [voce, ...lista].slice(0, MAX_USATI));
};

export const getGoldenTicketUsati = async () => {
  return await kvs.get(CHIAVE_USATI) || [];
};

// Corpo commento in formato ADF (Atlassian Document Format).
const adf = (text) => ({
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

// Segnala l'issue su Jira: label 'golden-ticket' + commento (come app).
// BEST-EFFORT: la label dipende dallo schema di modifica del progetto (se "Labels"
// non è sull'Edit screen, Jira risponde 400). Logghiamo i fallimenti senza bloccare
// il redeem: la fonte di verità è il registro interno (appendUsato) + il commento.
const escalate = async (issueKey) => {
  try {
    const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update: { labels: [{ add: 'golden-ticket' }] } }),
    });
    if (!res.ok) {
      console.log(`[golden-ticket] label non applicata su ${issueKey} (HTTP ${res.status}): ${await res.text()}`);
    }
  } catch (e) {
    console.log(`[golden-ticket] errore label su ${issueKey}: ${e.message}`);
  }

  try {
    const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: adf('Golden ticket usato: richiesta di supporto al supervisore, senza penalità.'),
      }),
    });
    if (!res.ok) {
      console.log(`[golden-ticket] commento non aggiunto su ${issueKey} (HTTP ${res.status}): ${await res.text()}`);
    }
  } catch (e) {
    console.log(`[golden-ticket] errore commento su ${issueKey}: ${e.message}`);
  }
};

// Usa un golden ticket sull'issue: scala il saldo, registra l'uso e segnala l'issue.
export const redeemGoldenTicket = async (accountId, nome, issueKey, puntiTotali) => {
  if (!issueKey) return { ok: false, reason: 'no_issue' };

  const { numeroStagione, rec } = await reconcileGoldenTicket(accountId, puntiTotali);
  if (rec.balance <= 0) return { ok: false, reason: 'no_tickets', balance: 0 };

  // Consuma il ticket e registra l'uso: fonte di verità interna, sempre affidabile.
  rec.balance -= 1;
  rec.ledger.push({ type: 'REDEEM', delta: -1, ts: Date.now(), issueKey });
  await kvs.set(chiaveRecord(numeroStagione, accountId), rec);
  await appendUsato({ issueKey, accountId, nome, numeroStagione, ts: Date.now() });

  // Notifiche su Jira: best-effort, non bloccano il redeem.
  await escalate(issueKey);

  return { ok: true, balance: rec.balance };
};
