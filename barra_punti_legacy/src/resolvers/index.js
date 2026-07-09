import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
const resolver = new Resolver();

const POINTS_PER_TASK = 3;
const TASK_ISSUE_TYPE_NAMES = [
  'task', 'attività', 'attivita', 'story',
  'subtask', 'sub-task', 'sottotask', 'sotto-task',
  'incident', 'service request'
];

// Stati che NON contano anche se sono verdi (categoria Done). Dai workflow:
//  - Incident:        CANCELED
//  - Service Request: CLOSED INCOMPLETED, CLOSED SKIPPED
const EXCLUDED_STATUS_NAMES = [
  'canceled', 'cancelled',
  'closed incompleted', 'closed incomplete',
  'closed skipped'
];

// Stati che contano come completamento, riconosciuti PER NOME (fallback quando
// statusCategory non arriva nel payload). Dai workflow:
//  - Standard:        DONE
//  - Incident:        RESOLVED
//  - Service Request: CLOSED COMPLETED
const COMPLETED_STATUS_NAMES = [
  'done',
  'resolved',
  'closed completed'
];

// ---------- Gestione stagioni (invariata) ----------

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
  return season.start.toISOString().slice(0, 10);
}

function isTaskIssueType(issuetypeName) {
  return TASK_ISSUE_TYPE_NAMES.includes((issuetypeName || '').toLowerCase());
}

// ---------- Storage: progresso della stagione corrente (copia privata a questa app) ----------

async function getSeasonProgress(accountId, seasonKeyStr) {
  const key = `season-progress-${accountId}-${seasonKeyStr}`;
  try {
    const result = await kvs.get(key);
    return result || { points: 0, completedIssueKeys: [] };
  } catch (err) {
    return { points: 0, completedIssueKeys: [] };
  }
}

async function saveSeasonProgress(accountId, seasonKeyStr, progress) {
  const key = `season-progress-${accountId}-${seasonKeyStr}`;
  await kvs.set(key, progress);
}

// ---------- Storage: stato legacy (totale a vita + ultima stagione gia' sommata) ----------

async function getLegacyState(accountId) {
  const key = `legacy-state-${accountId}`;
  try {
    const result = await kvs.get(key);
    return result || { totalPoints: 0, lastRolledSeasonKey: null };
  } catch (err) {
    return { totalPoints: 0, lastRolledSeasonKey: null };
  }
}

async function saveLegacyState(accountId, state) {
  const key = `legacy-state-${accountId}`;
  await kvs.set(key, state);
}

async function ensureRollover(accountId, currentSeasonKeyStr) {
  const state = await getLegacyState(accountId);

  if (state.lastRolledSeasonKey === null) {
    state.lastRolledSeasonKey = currentSeasonKeyStr;
    await saveLegacyState(accountId, state);
    return state;
  }

  if (state.lastRolledSeasonKey !== currentSeasonKeyStr) {
    const prevProgress = await getSeasonProgress(accountId, state.lastRolledSeasonKey);
    state.totalPoints += prevProgress.points;
    state.lastRolledSeasonKey = currentSeasonKeyStr;
    await saveLegacyState(accountId, state);
  }

  return state;
}

// ---------- Webhook: chiamato ad ogni modifica di issue ----------

export async function issueUpdatedHandler(event) {
  try {
    console.log('[DIAG] ===== issueUpdatedHandler START =====');

    const issue = event?.issue;
    const changelog = event?.changelog;

    console.log('[DIAG] issue.key            =', issue?.key);
    console.log('[DIAG] issuetype (payload)  =', issue?.fields?.issuetype?.name);
    console.log('[DIAG] status.name (payload)=', issue?.fields?.status?.name);
    console.log('[DIAG] statusCategory       =', JSON.stringify(issue?.fields?.status?.statusCategory));
    console.log('[DIAG] changelog.items      =', JSON.stringify(changelog?.items));

    if (!issue || !changelog) { console.log('[DIAG] STOP: issue o changelog mancante'); return; }

    const statusChanged = changelog.items?.some(item => item.field === 'status');
    if (!statusChanged) { console.log('[DIAG] STOP: non e\' un cambio di stato'); return; }

    const issuetypeName = issue.fields?.issuetype?.name;
    if (!isTaskIssueType(issuetypeName)) {
      console.log(`[DIAG] STOP: issuetype "${issuetypeName}" non in whitelist`); return;
    }

    const assigneeAccountId = issue.fields?.assignee?.accountId;
    if (!assigneeAccountId) { console.log('[DIAG] STOP: nessun assegnatario'); return; }

    // Nome dello stato: il campo issue.fields.status.name e' LOCALIZZATO (es. "Annullato",
    // "Risolta"), mentre changelog toString e' in inglese canonico ("Canceled", "Resolved")
    // e coincide con le nostre liste. Confrontiamo entrambi per robustezza.
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
    // Completata = NON esclusa E (categoria Done OPPURE nome noto di completamento).
    const isNowDone = !isExcludedStatus && (isDoneByCategory || isDoneByName);

    console.log(`[DIAG] changelogName="${changelogStatusName}" fieldName="${fieldStatusName}" cat="${currentStatusCategory}" excluded=${isExcludedStatus} doneByCat=${isDoneByCategory} doneByName=${isDoneByName} -> isNowDone=${isNowDone}`);

    const season = getSeasonWindow(new Date());
    const currentKey = seasonKey(season);
    console.log(`[DIAG] season.isActive=${season.isActive} seasonKey=${currentKey}`);

    await ensureRollover(assigneeAccountId, currentKey);

    if (!season.isActive) { console.log('[DIAG] STOP: fuori stagione'); return; }

    const progress = await getSeasonProgress(assigneeAccountId, currentKey);
    const alreadyCounted = progress.completedIssueKeys.includes(issue.key);
    console.log(`[DIAG] alreadyCounted=${alreadyCounted} puntiPrima=${progress.points}`);

    if (isNowDone && !alreadyCounted) {
      progress.points += POINTS_PER_TASK;
      progress.completedIssueKeys.push(issue.key);
      await saveSeasonProgress(assigneeAccountId, currentKey, progress);
      console.log(`[DIAG] +${POINTS_PER_TASK} -> ${progress.points}`);
    } else if (!isNowDone && alreadyCounted) {
      progress.points = Math.max(0, progress.points - POINTS_PER_TASK);
      progress.completedIssueKeys = progress.completedIssueKeys.filter(k => k !== issue.key);
      await saveSeasonProgress(assigneeAccountId, currentKey, progress);
      console.log(`[DIAG] -${POINTS_PER_TASK} (riapertura/annullamento) -> ${progress.points}`);
    } else {
      console.log('[DIAG] nessuna variazione punti');
    }

    console.log('[DIAG] ===== issueUpdatedHandler END =====');
  } catch (err) {
    console.error('[DIAG] Errore in issueUpdatedHandler:', err.message, err.stack);
  }
}

// ---------- Resolver per il frontend ----------

resolver.define('getLegacyPointsData', async (req) => {
  const accountId = req.context.accountId;
  const season = getSeasonWindow();
  const currentKey = seasonKey(season);

  const state = await ensureRollover(accountId, currentKey);

  return {
    points: state.totalPoints,
    pointsPerTask: POINTS_PER_TASK,
    completedCount: Math.round(state.totalPoints / POINTS_PER_TASK)
  };
});

export const handler = resolver.getDefinitions();