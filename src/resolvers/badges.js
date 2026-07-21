import { kvs } from '@forge/kvs';

export const BADGES = [
  { key: 'underdog', emoji: '🐶', name: 'Underdog', description: 'Assegnato per una grande rimonta in classifica.' },
  { key: 'teamwork', emoji: '🐜', name: 'Teamwork', description: 'Assegnato per un eccellente lavoro di squadra.' },
  { key: 'helper', emoji: '🫂', name: 'Helper', description: 'Assegnato per aver aiutato i colleghi nelle loro task.' },
  { key: 'highly-rated-employee', emoji: '⭐', name: 'Highly Rated Employee', description: 'Assegnato per aver ricevuto valutazioni molto positive dagli utenti.' },
  { key: 'architetto', emoji: '👷‍♀️', name: 'Architetto', description: 'Assegnato per aver risolto ticket senza aggiungere complessità.' },
  { key: 'classifica', emoji: '🥇', name: 'Classifica', description: 'Assegnato per essere arrivato primo in classifica.' },
  { key: 'streak', emoji: '🔥', name: 'Streak', description: 'Assegnato per aver chiuso ticket correttamente per 10 giorni di fila.' },
];

export const getUserBadges = async (accountId) => {
  const badges = await kvs.get(`badges-${accountId}`);
  return badges || [];
};

export const assignBadge = async (accountId, badgeKey) => {
  const current = await getUserBadges(accountId);
  if (!current.includes(badgeKey)) {
    await kvs.set(`badges-${accountId}`, [...current, badgeKey]);
  }
  return await getUserBadges(accountId);
};

export const removeBadge = async (accountId, badgeKey) => {
  const current = await getUserBadges(accountId);
  await kvs.set(`badges-${accountId}`, current.filter(b => b !== badgeKey));
  return await getUserBadges(accountId);
};