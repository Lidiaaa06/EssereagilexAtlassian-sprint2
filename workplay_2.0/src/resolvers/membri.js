import { kvs } from '@forge/kvs';

// Modello dei membri del team, salvato in KVS.
//
// Sostituisce l'array TEAM hardcoded in index.js e trigger.js. La forma di ogni
// membro resta identica a quella usata finora — { nome, accountId } — così il
// resto del codice, quando passerà da TEAM a getMembri(), non vedrà differenza.
//
// Su un'installazione nuova (marketplace) la lista parte VUOTA: sarà un
// amministratore Jira ad aggiungere i membri dal pannello admin. Ogni funzione
// qui dentro deve quindi reggere il caso "nessun membro" senza rompersi.

// Chiave KVS unica per l'elenco dei membri di questa installazione.
const CHIAVE = 'membri';

// Restituisce l'elenco dei membri. Array vuoto se non ne è stato aggiunto nessuno.
// È il rimpiazzo diretto di TEAM: stessa forma [{ nome, accountId }, ...].
export const getMembri = async () => {
  return await kvs.get(CHIAVE) || [];
};

// Controlla se un accountId fa parte del team.
// Sostituisce i vari TEAM.find(m => m.accountId === id) sparsi nel codice.
export const isMembro = async (accountId) => {
  const membri = await getMembri();
  return membri.some((m) => m.accountId === accountId);
};

// Restituisce il singolo membro (o undefined). Utile dove serve il nome.
export const getMembro = async (accountId) => {
  const membri = await getMembri();
  return membri.find((m) => m.accountId === accountId);
};

// Aggiunge un membro. Idempotente: se l'accountId c'è già non fa nulla e non
// duplica. Restituisce sempre l'elenco aggiornato.
export const aggiungiMembro = async (accountId, nome) => {
  const membri = await getMembri();

  if (membri.some((m) => m.accountId === accountId)) {
    return membri; // già presente: nessun cambiamento
  }

  const aggiornati = [...membri, { accountId, nome }];
  await kvs.set(CHIAVE, aggiornati);
  return aggiornati;
};

// Rimuove un membro dal team. Non tocca i suoi punti né gli altri dati KVS:
// la rimozione dall'elenco e la cancellazione dello storico sono due cose diverse.
export const rimuoviMembro = async (accountId) => {
  const membri = await getMembri();
  const aggiornati = membri.filter((m) => m.accountId !== accountId);
  await kvs.set(CHIAVE, aggiornati);
  return aggiornati;
};

// Migrazione una-tantum dall'array TEAM hardcoded.
//
// Sulla TUA installazione esistente ci sono già cinque membri con punti e storia,
// ma la chiave 'membri' è ancora vuota. Questa funzione la popola UNA VOLTA SOLA
// a partire dall'array legacy, così i dati esistenti restano collegati.
//
// È idempotente per costruzione: al secondo avvio 'membri' non è più vuota,
// quindi la condizione è falsa e non tocca nulla. Su un'installazione NUOVA del
// marketplace, teamLegacy arriva vuoto e anche qui non succede niente: la lista
// resta vuota finché un admin non aggiunge qualcuno a mano.
export const seedMembriSeVuoto = async (teamLegacy) => {
  const membri = await kvs.get(CHIAVE);

  // Già popolata (anche con array vuoto scritto di proposito) → non seedare.
  // Usiamo "null/undefined" come unico segnale di "mai inizializzata".
  if (membri) return membri;

  if (!teamLegacy || teamLegacy.length === 0) {
    return []; // installazione nuova: niente da migrare
  }

  // Normalizziamo alla forma { accountId, nome } nell'ordine del modello.
  const iniziali = teamLegacy.map((m) => ({ accountId: m.accountId, nome: m.nome }));
  await kvs.set(CHIAVE, iniziali);
  console.log(`[membri] seed iniziale: ${iniziali.length} membri migrati da TEAM legacy`);
  return iniziali;
};