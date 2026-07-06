import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();

const POINTS_PER_TASK = 3;
const TASK_ISSUE_TYPE_NAMES = [
  'task',
  'attività',
  'attivita',
  'story',
  'subtask',
  'sub-task',
  'sottotask',
  'sotto-task',
  'sottoattività',
  'sottoattivita'
];

function formatJiraDate(date) {
  return date.toISOString().slice(0, 10);
}

function getSeasonWindow(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const startMonth = month % 2 === 0 ? month : month - 1;

  const start = new Date(year, startMonth, 1, 0, 0, 0, 0);

  const end = new Date(year, startMonth + 2, 0, 0, 0, 0, 0);
  end.setDate(end.getDate() - 2);

  const nextStart = new Date(year, startMonth + 2, 1, 0, 0, 0, 0);

  return {
    name: 'Stagione corrente',
    start,
    end,
    nextStart,
    isActive: now >= start && now < end
  };
}

function isTaskIssue(issue) {
  const issueTypeName = issue?.fields?.issuetype?.name?.toLowerCase();
  return TASK_ISSUE_TYPE_NAMES.includes(issueTypeName);
}

async function countCompletedTasksForCurrentUser(season) {
  const jql = [
    'assignee = currentUser()',
    'AND statusCategory = Done',
    `AND statusCategoryChangedDate >= "${formatJiraDate(season.start)}"`,
    `AND statusCategoryChangedDate < "${formatJiraDate(season.nextStart)}"`
  ].join(' ');

  const response = await api.asUser().requestJira(
    route`/rest/api/3/search/jql`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jql,
        maxResults: 100,
        fields: ['issuetype']
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Errore ricerca Jira: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const issues = data.issues || [];

  return issues.filter(isTaskIssue).length;
}

resolver.define('getSeasonPointsData', async () => {
  const season = getSeasonWindow();

  const completedTasks = season.isActive
    ? await countCompletedTasksForCurrentUser(season)
    : 0;

  const points = completedTasks * POINTS_PER_TASK;
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