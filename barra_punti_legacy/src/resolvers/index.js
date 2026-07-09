import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
const resolver = new Resolver();

const POINTS_PER_TASK = 3;
const TASK_ISSUE_TYPE_NAMES = [
  'task', 'attività', 'attivita', 'story',
  'subtask', 'sub-task', 'sottotask', 'sotto-task'
];
const EXCLUDED_STATUS_NAMES = [
  'canceled', 'cancelled',
  'closed incompleted', 'closed incomplete',
  'closed skipped'
];

// ---------- Gestione stagioni (copia identica alla logica stagionale) ----------

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

// ---------- Storage: progresso della stagione corrente (copia interna, privata a questa app) ----------
// Chiave: season-progress-<accountId>-<seasonKey>
// Valore: { points, completedIssueKeys: string[] }

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

// ---------- Storage: stato legacy (totale a vita + ultima stagione già sommata) ----------
// Chiave: legacy-state-<accountId>
// Valore: { totalPoints, lastRolledSeasonKey }

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

// Controlla se la stagione è cambiata rispetto all'ultima registrata;
// se sì, somma i punti della stagione appena conclusa nel totale legacy (una sola volta).
async function ensureRollover(accountId, currentSeasonKeyStr) {
  const state = await getLegacyState(accountId);

  if (state.lastRolledSeasonKey === null) {
    // Prima volta in assoluto che vediamo questo utente: nessuna stagione precedente da sommare.
    state.lastRolledSeasonKey = currentSeasonKeyStr;
    await saveLegacyState(accountId, state);
    return state;
  }

  if (state.lastRolledSeasonKey !== currentSeasonKeyStr) {
    // La stagione è cambiata: somma il totale della stagione precedente nel legacy.
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
    const issue = event.issue;
    const changelog = event.changelog;

    if (!issue || !changelog) return;

    const statusChanged = changelog.items?.some(item => item.field === 'status');
    if (!statusChanged) return;

    const issuetypeName = issue.fields?.issuetype?.name;
    if (!isTaskIssueType(issuetypeName)) return;

    const assigneeAccountId = issue.fields?.assignee?.accountId;
    if (!assigneeAccountId) return;

    const currentStatusCategory = issue.fields?.status?.statusCategory?.key;
    const currentStatusName = (issue.fields?.status?.name || '').toLowerCase();
    const isExcludedStatus = EXCLUDED_STATUS_NAMES.includes(currentStatusName);
    const isNowDone = currentStatusCategory === 'done' && !isExcludedStatus;

    const season = getSeasonWindow(new Date());
    const currentKey = seasonKey(season);

    // Verifica sempre se serve un rollover di stagione, prima di registrare il punteggio.
    await ensureRollover(assigneeAccountId, currentKey);

    if (!season.isActive) return; // fuori stagione: nessun punto stagionale da tracciare

    const progress = await getSeasonProgress(assigneeAccountId, currentKey);
    const alreadyCounted = progress.completedIssueKeys.includes(issue.key);

    if (isNowDone && !alreadyCounted) {
      progress.points += POINTS_PER_TASK;
      progress.completedIssueKeys.push(issue.key);
      await saveSeasonProgress(assigneeAccountId, currentKey, progress);
    } else if (!isNowDone && alreadyCounted) {
      progress.points = Math.max(0, progress.points - POINTS_PER_TASK);
      progress.completedIssueKeys = progress.completedIssueKeys.filter(k => k !== issue.key);
      await saveSeasonProgress(assigneeAccountId, currentKey, progress);
    }
  } catch (err) {
    console.error('Errore in issueUpdatedHandler:', err.message, err.stack);
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
    pointsPerTask: POINTS_PER_TASK
  };
});

export const handler = resolver.getDefinitions();