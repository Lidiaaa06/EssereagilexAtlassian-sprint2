import Resolver from '@forge/resolver';
import api, { route, storage } from '@forge/api';
import { getCurrentSeason, getSeasonalPoints } from './integrations';

const MAX = 3;
const THRESHOLD = 1000;

const key = (seasonId, accountId) => `gt:${seasonId}:${accountId}`;

async function loadRecord(seasonId, accountId) {
  const existing = await storage.get(key(seasonId, accountId));
  return (
    existing ?? {
      accountId,
      seasonId,
      balance: 0,
      grants: { monthly1: false, monthly2: false, earned: false },
      pendingNotice: false,
      ledger: [],
    }
  );
}

// Idempotente: ogni grant scatta al massimo una volta per stagione grazie al flag.
// Quando scatta il grant EARNED alziamo pendingNotice, cosi l'operatore riceve
// il popup la prossima volta che monta una superficie Forge.
function applyGrant(rec, which) {
  if (rec.grants[which]) return rec;
  rec.grants[which] = true;
  if (rec.balance < MAX) {
    rec.balance += 1;
    rec.ledger.push({
      type: which === 'earned' ? 'EARNED_POINTS' : 'GRANT_MONTHLY',
      which,
      delta: 1,
      ts: Date.now(),
    });
    if (which === 'earned') rec.pendingNotice = true;
  }
  return rec;
}

// I grant mensili restano reconcile-on-access; il grant earned e reattivo
// (vedi grantEarnedTicket), ma lo ricontrolliamo anche qui come rete di sicurezza.
async function reconcile(accountId) {
  const season = await getCurrentSeason(); // { id, startMs, secondGrantMs, endMs }
  const points = await getSeasonalPoints(accountId, season.id);
  let rec = await loadRecord(season.id, accountId);
  const now = Date.now();

  if (now >= season.startMs) rec = applyGrant(rec, 'monthly1');
  if (now >= season.secondGrantMs) rec = applyGrant(rec, 'monthly2');
  if (points >= THRESHOLD) rec = applyGrant(rec, 'earned');

  await storage.set(key(season.id, accountId), rec);
  return { season, rec };
}

// ── Grant earned reattivo ────────────────────────────────────────────────
// Chiamalo dal plugin punti subito dopo aver aggiornato il totale dell'operatore
// (o da un consumer Forge Events). Idempotente: sicuro da chiamare a ogni
// variazione di punti; agisce una volta sola, la prima volta che total >= 1000.
export async function grantEarnedTicket(accountId, knownPoints) {
  const season = await getCurrentSeason();
  const points =
    typeof knownPoints === 'number'
      ? knownPoints
      : await getSeasonalPoints(accountId, season.id);
  if (points < THRESHOLD) return { granted: false };

  let rec = await loadRecord(season.id, accountId);
  const alreadyHad = rec.grants.earned;
  rec = applyGrant(rec, 'earned');
  await storage.set(key(season.id, accountId), rec);
  return { granted: !alreadyHad && rec.grants.earned, balance: rec.balance };
}

const adf = (text) => ({
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

async function escalate(issueKey) {
  await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ update: { labels: [{ add: 'golden-ticket' }] } }),
  });
  await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: adf('Golden ticket usato: richiesta di supporto al supervisore, senza penalita.'),
    }),
  });
  // TODO: qui puoi aggiungere assegnazione/notifica al supervisore.
}

const resolver = new Resolver();

resolver.define('getState', async ({ context }) => {
  const accountId = context.accountId;
  const { season, rec } = await reconcile(accountId);
  return {
    balance: rec.balance,
    grants: rec.grants,
    seasonId: season.id,
    pendingNotice: !!rec.pendingNotice,
  };
});

resolver.define('dismissNotice', async ({ context }) => {
  const accountId = context.accountId;
  const season = await getCurrentSeason();
  const rec = await loadRecord(season.id, accountId);
  if (rec.pendingNotice) {
    rec.pendingNotice = false;
    await storage.set(key(season.id, accountId), rec);
  }
  return { ok: true };
});

resolver.define('redeem', async ({ context }) => {
  const accountId = context.accountId;
  const issueKey = context.extension?.issue?.key; // ci fidiamo del context, non del client
  if (!issueKey) return { ok: false, reason: 'no_issue' };

  const { season, rec } = await reconcile(accountId);
  if (rec.balance <= 0) return { ok: false, reason: 'no_tickets', balance: 0 };

  rec.balance -= 1;
  rec.ledger.push({ type: 'REDEEM', delta: -1, ts: Date.now(), issueKey });
  await storage.set(key(season.id, accountId), rec);

  await escalate(issueKey);
  return { ok: true, balance: rec.balance };
});

export const handler = resolver.getDefinitions();