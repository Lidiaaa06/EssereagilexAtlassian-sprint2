import Resolver from '@forge/resolver';
import { kvs, WhereConditions } from '@forge/kvs';

const resolver = new Resolver();

// --- Funzioni di supporto ---
// [Inserisci qui le tue funzioni: getSeasonWindow, getProgress, saveProgress, getAllSeasonEntries, etc.]

// --- Trigger ---
export async function issueUpdatedHandler(event) {
  console.log('##### TRIGGER INVOCATO #####');
  // ... tua logica ...
}

// --- Resolver ---
resolver.define('getLegacyPointsData', async (req) => {
  const accountId = req.context.accountId;
  const allEntries = await getAllSeasonEntries(accountId);

  let legacyPoints = 0;
  let completedCount = 0;

  for (const entry of allEntries) {
    legacyPoints += (entry.value?.points || 0);
    completedCount += (entry.value?.completedIssueKeys || []).length;
  }

  return { points: legacyPoints, pointsPerTask: 3, completedCount };
});

export const handler = resolver.getDefinitions();