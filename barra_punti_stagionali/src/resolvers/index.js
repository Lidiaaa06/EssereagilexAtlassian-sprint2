import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
import api, { route } from '@forge/api';
const resolver = new Resolver();

const POINTS_PER_TASK = 3;
const TASK_ISSUE_TYPE_NAMES = [
  'task', 'attività', 'attivita', 'story',
  'subtask', 'sub-task', 'sottotask', 'sotto-task',
  'incident', 'service request'
];

const EXCLUDED_STATUS_NAMES = [
  'canceled', 'cancelled',
  'closed incompleted', 'closed incomplete',
  'closed skipped'
];

const COMPLETED_STATUS_NAMES = [
  'done',
  'resolved',
  'closed completed'
];

// ---------- Gestione stagioni ----------

function getSeasonWindow(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const startMonth = month % 2 === 0 ? month : month - 1;

  const start = new Date(year, startMonth, 1, 0, 0, 0, 0);

  const end = new Date(year, startMonth + 2, 0, 0, 0, 0, 0);
  end.setDate(end.getDate() - 2);

  const activeUntil = new Date(end);
  activeUntil.setDate(activeUntil.getDate() + 1);

  const nextStart = new Date(year, startMonth + 2, 1, 0, 0, 0, 0);

  return {
    name: 'Stagione corrente',
    start,
    end,
    nextStart,
    isActive: now >= start && now < activeUntil
  };
}

function seasonKey(season) {
  return season.start.toISOString().slice(0, 10); // es. "2026-07-01"
}

// ---------- Storage punti: struttura dati per utente+stagione ----------
// Chiave: progress-<accountId>-<seasonKey>
// Valore: { points, completedIssueKeys: string[] }

async function getProgress(accountId, season) {
  const key = `progress-${accountId}-${seasonKey(season)}`;
  try {
    const result = await kvs.get(key);
    return result || { points: 0, completedIssueKeys: [] };
  } catch (err) {
    console.log('KVS.get errore (atteso per chiave nuova):', err.message);
    return { points: 0, completedIssueKeys: [] };
  }
}

async function saveProgress(accountId, season, progress) {
  const key = `progress-${accountId}-${seasonKey(season)}-test`;
  await kvs.set(key, progress);
}

function isTaskIssueType(issuetypeName) {
  return TASK_ISSUE_TYPE_NAMES.includes((issuetypeName || '').toLowerCase());
}

// ======================================================================
// ========================  GOLDEN TICKET  =============================
// ======================================================================

const GT_MAX = 3;
const GT_THRESHOLD = 1000;

function gtKey(accountId, season) {
  return `gt-${accountId}-${seasonKey(season)}`;
}

async function loadGtRecord(accountId, season) {
  try {
    const result = await kvs.get(gtKey(accountId, season));
    if (result) return result;
  } catch (err) {
    console.log('GT KVS.get (atteso per chiave nuova):', err.message);
  }
  return {
    balance: 0,
    grants: { monthly1: false, monthly2: false, earned: false },
    pendingNotice: false,
    ledger: []
  };
}

async function saveGtRecord(accountId, season, rec) {
  await kvs.set(gtKey(accountId, season), rec);
}

// Idempotente: ogni grant scatta una volta sola per stagione grazie al flag.
// Quando scatta il grant EARNED alziamo pendingNotice per il popup.
function applyGrant(rec, which) {
  if (rec.grants[which]) return rec;
  rec.grants[which] = true;
  if (rec.balance < GT_MAX) {
    rec.balance += 1;
    rec.ledger.push({
      type: which === 'earned' ? 'EARNED_POINTS' : 'GRANT_MONTHLY',
      which,
      delta: 1,
      ts: Date.now()
    });
    if (which === 'earned') rec.pendingNotice = true;
  }
  return rec;
}

// Materializza i grant dovuti: mese 1 all'inizio stagione, mese 2 al 1° del 2° mese,
// earned se i punti stagionali dell'operatore hanno raggiunto la soglia.
async function reconcileGt(accountId) {
  const season = getSeasonWindow();
  const secondMonthStart = new Date(
    season.start.getFullYear(), season.start.getMonth() + 1, 1, 0, 0, 0, 0
  );
  const points = (await getProgress(accountId, season)).points;

  let rec = await loadGtRecord(accountId, season);
  const now = Date.now();

  if (now >= season.start.getTime()) rec = applyGrant(rec, 'monthly1');
  if (now >= secondMonthStart.getTime()) rec = applyGrant(rec, 'monthly2');
  if (points >= GT_THRESHOLD) rec = applyGrant(rec, 'earned');

  await saveGtRecord(accountId, season, rec);
  return { season, rec };
}

// Grant reattivo: chiamato dal trigger punti quando l'operatore supera i 1000.
// Idempotente e threshold-guarded: sicuro da chiamare ad ogni assegnazione.
async function grantEarnedTicket(accountId, knownPoints) {
  const season = getSeasonWindow();
  const points =
    typeof knownPoints === 'number'
      ? knownPoints
      : (await getProgress(accountId, season)).points;
  if (points < GT_THRESHOLD) return { granted: false };

  let rec = await loadGtRecord(accountId, season);
  const alreadyHad = rec.grants.earned;
  rec = applyGrant(rec, 'earned');
  await saveGtRecord(accountId, season, rec);
  return { granted: !alreadyHad && rec.grants.earned, balance: rec.balance };
}

const adf = (text) => ({
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
});

async function escalate(issueKey) {
  await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ update: { labels: [{ add: 'golden-ticket' }] } })
  });
  await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: adf('Golden ticket usato: richiesta di supporto al supervisore, senza penalita.')
    })
  });
}

resolver.define('gtGetState', async ({ context }) => {
  const accountId = context.accountId;
  const { rec } = await reconcileGt(accountId);
  return {
    balance: rec.balance,
    grants: rec.grants,
    pendingNotice: !!rec.pendingNotice
  };
});

resolver.define('gtDismiss', async ({ context }) => {
  const accountId = context.accountId;
  const season = getSeasonWindow();
  const rec = await loadGtRecord(accountId, season);
  if (rec.pendingNotice) {
    rec.pendingNotice = false;
    await saveGtRecord(accountId, season, rec);
  }
  return { ok: true };
});

resolver.define('gtRedeem', async ({ context }) => {
  const accountId = context.accountId;
  const issueKey = context.extension?.issue?.key; // dal context, non dal client
  if (!issueKey) return { ok: false, reason: 'no_issue' };

  const { season, rec } = await reconcileGt(accountId);
  if (rec.balance <= 0) return { ok: false, reason: 'no_tickets', balance: 0 };

  rec.balance -= 1;
  rec.ledger.push({ type: 'REDEEM', delta: -1, ts: Date.now(), issueKey });
  await saveGtRecord(accountId, season, rec);

  await escalate(issueKey);
  return { ok: true, balance: rec.balance };
});

// ---------- Webhook: chiamato ad ogni modifica di issue ----------

export async function issueUpdatedHandler(event) {
  console.log('##### TRIGGER INVOCATO #####', new Date().toISOString());
  try {
    const issue = event.issue;
    const changelog = event.changelog;

    if (!issue || !changelog) {
      console.log('STOP: issue o changelog mancanti');
      return;
    }

    const statusChanged = changelog.items?.some(item => item.field === 'status');
    if (!statusChanged) {
      console.log('STOP: lo status non è cambiato in questa modifica');
      return;
    }

    const issuetypeName = issue.fields?.issuetype?.name;
    if (!isTaskIssueType(issuetypeName)) {
      console.log('STOP: issue type non in whitelist');
      return;
    }

    const assigneeAccountId = issue.fields?.assignee?.accountId;
    if (!assigneeAccountId) {
      console.log('STOP: nessun assegnatario');
      return;
    }

    const statusItem = changelog.items?.find(item => item.field === 'status');
    const changelogStatusName = (statusItem?.toString || '').toLowerCase();
    const fieldStatusName = (issue.fields?.status?.name || '').toLowerCase();
    const currentStatusCategory = issue.fields?.status?.statusCategory?.key;

    const isExcludedStatus =
      EXCLUDED_STATUS_NAMES.includes(changelogStatusName) ||
      EXCLUDED_STATUS_NAMES.includes(fieldStatusName);
    const isDoneByCategory = currentStatusCategory === 'done';
    const isDoneByName =
      COMPLETED_STATUS_NAMES.includes(changelogStatusName) ||
      COMPLETED_STATUS_NAMES.includes(fieldStatusName);
    const isNowDone = !isExcludedStatus && (isDoneByCategory || isDoneByName);

    const season = getSeasonWindow(new Date());
    if (!season.isActive) {
      console.log('STOP: stagione non attiva');
      return;
    }

    const progress = await getProgress(assigneeAccountId, season);
    const alreadyCounted = progress.completedIssueKeys.includes(issue.key);

    if (isNowDone && !alreadyCounted) {
      progress.points += POINTS_PER_TASK;
      progress.completedIssueKeys.push(issue.key);
      await saveProgress(assigneeAccountId, season, progress);
      console.log('PUNTI ASSEGNATI, nuovo totale:', progress.points);

      // >>> GOLDEN TICKET: grant reattivo appena si superano i 1000 punti <
      await grantEarnedTicket(assigneeAccountId, progress.points);
    } else if (!isNowDone && alreadyCounted) {
      progress.points = Math.max(0, progress.points - POINTS_PER_TASK);
      progress.completedIssueKeys = progress.completedIssueKeys.filter(k => k !== issue.key);
      await saveProgress(assigneeAccountId, season, progress);
      console.log('PUNTI RIMOSSI (riapertura), nuovo totale:', progress.points);
    } else {
      console.log('NESSUNA AZIONE: condizioni non soddisfatte');
    }
  } catch (err) {
    console.error('ERRORE in issueUpdatedHandler:', err.message, err.stack);
  }
}

// ---------- Resolver per il frontend gadget: legge solo lo storage ----------

resolver.define('getSeasonPointsData', async (req) => {
  const accountId = req.context.accountId;
  const season = getSeasonWindow();

  const progress = season.isActive
    ? await getProgress(accountId, season)
    : { points: 0, completedIssueKeys: [] };

  const points = progress.points;
  const nextMilestone = Math.max(30, Math.ceil((points + 1) / 30) * 30);

  return {
    seasonName: season.name,
    points,
    pointsPerTask: POINTS_PER_TASK,
    nextMilestone,
    isActive: season.isActive,
    seasonStartIso: season.start.toISOString(),
    seasonEndIso: season.end.toISOString(),
    nextSeasonStartIso: season.nextStart.toISOString()
  };
});

export const handler = resolver.getDefinitions();