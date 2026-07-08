import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
const resolver = new Resolver();

const POINTS_PER_TASK = 3;
const TASK_ISSUE_TYPE_NAMES = [
  'task', 'attività', 'attivita', 'story',
  'subtask', 'sub-task', 'sottotask', 'sotto-task'
];

// ---------- Storage: punti legacy, mai azzerati ----------
// Chiave: legacy-<accountId>
// Valore: { points, completedIssueKeys: string[] }

async function getLegacyProgress(accountId) {
  const key = `legacy-${accountId}`;
  try {
    const result = await kvs.get(key);
    return result || { points: 0, completedIssueKeys: [] };
  } catch (err) {
    console.log('KVS.get errore (atteso per chiave nuova):', err.message);
    return { points: 0, completedIssueKeys: [] };
  }
}

async function saveLegacyProgress(accountId, progress) {
  const key = `legacy-${accountId}`;
  await kvs.set(key, progress);
}

function isTaskIssueType(issuetypeName) {
  return TASK_ISSUE_TYPE_NAMES.includes((issuetypeName || '').toLowerCase());
}

// ---------- Webhook: chiamato ad ogni modifica di issue ----------

export async function issueUpdatedHandler(event) {
  console.log('##### TRIGGER LEGACY INVOCATO #####', new Date().toISOString());
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

    const currentStatusCategory = issue.fields?.status?.statusCategory?.key;
    console.log('currentStatusCategory:', currentStatusCategory);
    const isNowDone = currentStatusCategory === 'done';

    const legacy = await getLegacyProgress(assigneeAccountId);
    const alreadyCounted = legacy.completedIssueKeys.includes(issue.key);
    console.log('legacy attuale:', JSON.stringify(legacy), 'alreadyCounted:', alreadyCounted, 'isNowDone:', isNowDone);

    if (isNowDone && !alreadyCounted) {
      legacy.points += POINTS_PER_TASK;
      legacy.completedIssueKeys.push(issue.key);
      await saveLegacyProgress(assigneeAccountId, legacy);
      console.log('PUNTI LEGACY ASSEGNATI, nuovo totale:', legacy.points);
    } else if (!isNowDone && alreadyCounted) {
      legacy.points = Math.max(0, legacy.points - POINTS_PER_TASK);
      legacy.completedIssueKeys = legacy.completedIssueKeys.filter(k => k !== issue.key);
      await saveLegacyProgress(assigneeAccountId, legacy);
      console.log('PUNTI LEGACY RIMOSSI (riapertura), nuovo totale:', legacy.points);
    } else {
      console.log('NESSUNA AZIONE: condizioni non soddisfatte');
    }
  } catch (err) {
    console.error('ERRORE in issueUpdatedHandler:', err.message, err.stack);
  }
}

// ---------- Resolver per il frontend: legge solo lo storage ----------

resolver.define('getLegacyPointsData', async (req) => {
  const accountId = req.context.accountId;
  const legacy = await getLegacyProgress(accountId);

  return {
    points: legacy.points,
    pointsPerTask: POINTS_PER_TASK,
    completedCount: legacy.completedIssueKeys.length
  };
});

export const handler = resolver.getDefinitions();