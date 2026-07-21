import { kvs } from '@forge/kvs';
import { getMembri } from './membri';

// Inizializza i ruoli se non esistono.
// Non riceve più TEAM: legge i membri da membri.js (opzione A del refactor).
const inizializzaRuoli = async () => {
  const ruoli = await kvs.get('ruoli');
  if (ruoli) return ruoli;

  const membri = await getMembri();

  // A team vuoto non c'è nulla da inizializzare: restituiamo una mappa vuota
  // SENZA scriverla, così quando i membri verranno aggiunti l'init riparte.
  if (membri.length === 0) return {};

  // Regola provvisoria (verrà sostituita in tappa 3 dal bootstrap admin-Jira):
  // il primo membro dell'elenco diventa supervisore, gli altri operatori.
  // Non c'è più nessun accountId hardcoded: funziona su qualsiasi installazione.
  const ruoliIniziali = {};
  membri.forEach((membro, index) => {
    ruoliIniziali[membro.accountId] = index === 0 ? 'supervisore' : 'operatore';
  });
  await kvs.set('ruoli', ruoliIniziali);
  return ruoliIniziali;
};

// Leggi il ruolo di un utente
export const getRuolo = async (accountId) => {
  const ruoli = await inizializzaRuoli();
  return ruoli[accountId] || 'operatore';
};

// Controlla se un utente è supervisore
export const isSupervisore = async (accountId) => {
  const ruolo = await getRuolo(accountId);
  return ruolo === 'supervisore';
};

// Conta quanti supervisori ci sono attualmente nella mappa ruoli
const contaSupervisori = (ruoli) => {
  return Object.values(ruoli).filter(r => r === 'supervisore').length;
};

// Assegna un ruolo a un utente (solo supervisore può farlo)
export const assegnaRuolo = async (accountIdRichiedente, accountIdTarget, nuovoRuolo) => {
  const richiedente = await isSupervisore(accountIdRichiedente);
  if (!richiedente) return { errore: 'Non hai i permessi per assegnare ruoli' };

  // Accetta solo i due ruoli previsti, per evitare di scrivere valori sporchi in KVS
  if (nuovoRuolo !== 'supervisore' && nuovoRuolo !== 'operatore') {
    return { errore: 'Ruolo non valido' };
  }

  // inizializzaRuoli invece di kvs.get diretto: garantisce che la mappa esista
  const ruoli = await inizializzaRuoli();

  // GUARDRAIL ANTI-LOCKOUT
  // Se stiamo declassando un supervisore a operatore e lui è l'ultimo rimasto,
  // blocchiamo: senza supervisori nessuno potrebbe più assegnare ruoli e
  // l'unico recupero sarebbe da terminale con `forge storage`.
  const staDeclassando =
    ruoli[accountIdTarget] === 'supervisore' && nuovoRuolo === 'operatore';

  if (staDeclassando && contaSupervisori(ruoli) <= 1) {
    return { errore: 'Non puoi rimuovere l\'ultimo supervisore. Nominane un altro prima.' };
  }

  ruoli[accountIdTarget] = nuovoRuolo;
  await kvs.set('ruoli', ruoli);
  return { successo: true, ruoli };
};

// Leggi tutti i ruoli
export const getRuoli = async () => {
  return await inizializzaRuoli();
};