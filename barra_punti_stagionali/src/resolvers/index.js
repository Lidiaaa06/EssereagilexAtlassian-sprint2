import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
const resolver = new Resolver();
// Nota: rimosso "import api from '@forge/api'" perche' non usato e causa crash al load
// ("Cannot read properties of undefined (reading 'fetch')").

const POINTS_PER_TASK = 3;
const TASK_ISSUE_TYPE_NAMES = [
  'task', 'attività', 'attivita', 'story',
  'subtask', 'sub-task', 'sottotask', 'sotto-task',
  'incident', 'service request'
];

// Stati che NON contano anche se verdi (categoria Done): CANCELED, CLOSED INCOMPLETED, CLOSED SKIPPED
const EXCLUDED_STATUS_NAMES = [
  'canceled', 'cancelled',
  'closed incompleted', 'closed incomplete',
  'closed skipped'
];

// Stati che contano come completamento, riconosciuti PER NOME (fallback se statusCategory
// non arriva): Standard DONE, Incident RESOLVED, Service Request CLOSED COMPLETED
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

// ---------- Storage: struttura dati per utente+stagione ----------
// Chiave: progress-<accountId>-<seasonKey>
// Valore: { points, completedIssueKeys: string[] }

async function getProgress(accountId, season) {
  const key = `progress-${accountId}-${seasonKey(season)}`;
  try {
    const result = await kvs.get(key);
    return result || { points: 0, completedIssueKeys: [] };
  } catch (err) {
    // kvs.get lancia un errore se la chiave non esiste ancora
    console.log('KVS.get errore (atteso per chiave nuova):', err.message);
    return { points: 0, completedIssueKeys: [] };
  }
}

async function saveProgress(accountId, season, progress) {
  const key = `progress-${accountId}-${seasonKey(season)}`;
  await kvs.set(key, progress);
}

function isTaskIssueType(issuetypeName) {
  return TASK_ISSUE_TYPE_NAMES.includes((issuetypeName || '').toLowerCase());
}

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
    console.log('statusChanged:', statusChanged, 'changelog.items:', JSON.stringify(changelog.items));
    if (!statusChanged) {
      console.log('STOP: lo status non è cambiato in questa modifica');
      return;
    }

    const issuetypeName = issue.fields?.issuetype?.name;
    console.log('issuetypeName:', issuetypeName);
    if (!isTaskIssueType(issuetypeName)) {
      console.log('STOP: issue type non in whitelist');
      return;
    }

    const assigneeAccountId = issue.fields?.assignee?.accountId;
    console.log('assigneeAccountId:', assigneeAccountId);
    if (!assigneeAccountId) {
      console.log('STOP: nessun assegnatario');
      return;
    }

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

    console.log(`stato: changelogName="${changelogStatusName}" fieldName="${fieldStatusName}" cat="${currentStatusCategory}" excluded=${isExcludedStatus} doneByCat=${isDoneByCategory} doneByName=${isDoneByName} -> isNowDone=${isNowDone}`);

    const season = getSeasonWindow(new Date());
    console.log('season.isActive:', season.isActive);
    if (!season.isActive) {
      console.log('STOP: stagione non attiva');
      return;
    }

    const progress = await getProgress(assigneeAccountId, season);
    const alreadyCounted = progress.completedIssueKeys.includes(issue.key);
    console.log('progress attuale:', JSON.stringify(progress), 'alreadyCounted:', alreadyCounted, 'isNowDone:', isNowDone);

    if (isNowDone && !alreadyCounted) {
      progress.points += POINTS_PER_TASK;
      progress.completedIssueKeys.push(issue.key);
      await saveProgress(assigneeAccountId, season, progress);
      console.log('PUNTI ASSEGNATI, nuovo totale:', progress.points);
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

// ---------- Resolver per il frontend: legge solo lo storage ----------

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