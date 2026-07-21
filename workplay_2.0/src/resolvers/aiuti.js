import { kvs } from '@forge/kvs';
import { getMembri, getMembro } from './membri';
import { applicaCambioPosizione } from './classifica';
import { getCategoria } from './catalogo-sfide';

// Valore configurabile dall'admin (Settings → Challenges → Feedback).
// Il 10 resta come ripiego: se il catalogo non fosse leggibile, la classifica
// aiuti deve continuare a funzionare invece di azzerarsi.
const PUNTI_PER_AIUTO_DEFAULT = 10;

const getPuntiPerAiuto = async () => {
  const categoria = await getCategoria('feedback');
  return categoria?.puntiDefault ?? PUNTI_PER_AIUTO_DEFAULT;
};
const MAX_DESCRIZIONE = 500;

// Registra un aiuto: il segnalatore attesta che un collega lo ha aiutato su un
// ticket. Contatore SEPARATO dai punti stagione (scelta di design): NON tocca
// punti-stagione, classifica principale, badge o antifarming.
export const segnalaAiuto = async (segnalatoreId, collegaId, collegaNome, issueKey, descrizione) => {
  // Non puoi segnalare te stesso.
  if (segnalatoreId === collegaId) {
    return { errore: 'Non puoi segnalare te stesso' };
  }

  // Il collega dev'essere un membro del team.
  const membro = await getMembro(collegaId);
  if (!membro) {
    return { errore: 'Il collega selezionato non è un membro del team' };
  }

  // Anti-doppione: lo stesso segnalatore non può accreditare lo stesso collega
  // due volte sullo stesso ticket. Log per-issue in KVS.
  const chiaveLog = `aiuti-log-${issueKey}`;
  const log = await kvs.get(chiaveLog) || [];
  if (log.some((v) => v.segnalatoreId === segnalatoreId && v.collegaId === collegaId)) {
    return { errore: 'Hai già segnalato questo collega su questo ticket' };
  }

  // Incrementa il contatore aiuti del collega.
  const chiaveAiuti = `aiuti-${collegaId}`;
  const attuali = await kvs.get(chiaveAiuti) || 0;
  await kvs.set(chiaveAiuti, attuali + 1);

  // Registra la voce nel log dell'issue: nome autorevole del collega (da getMembro,
  // non dal client) + descrizione facoltativa (trim + cap di lunghezza).
  const desc = (descrizione || '').trim().slice(0, MAX_DESCRIZIONE);
  await kvs.set(chiaveLog, [
    ...log,
    { segnalatoreId, collegaId, collegaNome: membro.nome, descrizione: desc, data: Date.now() },
  ]);

  return { successo: true, numeroAiuti: attuali + 1 };
};

// Numero di aiuti ricevuti da un membro (default 0, mai null → vincolo KVS).
export const getNumeroAiuti = async (accountId) => {
  return await kvs.get(`aiuti-${accountId}`) || 0;
};

// Elenco degli aiuti segnalati su una specifica issue, per il pannello.
// Ordinato dal più recente. Regge le voci vecchie senza nome/descrizione.
export const getAiutiTicket = async (issueKey) => {
  const log = await kvs.get(`aiuti-log-${issueKey}`) || [];
  return log
    .map((v) => ({
      collegaNome: v.collegaNome || 'Sconosciuto',
      descrizione: v.descrizione || '',
      data: v.data || 0,
    }))
    .sort((a, b) => (b.data || 0) - (a.data || 0));
};

// Eventi di aiuto su una issue in forma RICCA per il pannello Activity: include
// gli accountId (collega che ha ricevuto → avatar; segnalatore → "Da …"), oltre
// a descrizione e data. Diverso da getAiutiTicket (che è la lista sintetica del
// pannello valutazione e resta invariato per non toccarne i chiamanti).
export const getEventiAiutoTicket = async (issueKey) => {
  const log = await kvs.get(`aiuti-log-${issueKey}`) || [];
  return log
    .map((v) => ({
      collegaId: v.collegaId || null,
      collegaNome: v.collegaNome || 'Sconosciuto',
      segnalatoreId: v.segnalatoreId || null,
      descrizione: v.descrizione || '',
      data: v.data || 0,
    }))
    .sort((a, b) => (b.data || 0) - (a.data || 0));
};

// Classifica aiuti: punti-aiuto = valore configurato × numero di aiuti.
// Ordinata per numero di aiuti decrescente.
export const getClassificaAiuto = async () => {
  const membri = await getMembri();
  // Letto una volta sola: dentro il map sarebbe una lettura KVS per membro.
  const puntiPerAiuto = await getPuntiPerAiuto();

  const classifica = await Promise.all(
    membri.map(async (m) => {
      const numeroAiuti = await getNumeroAiuti(m.accountId);
      return {
        accountId: m.accountId,
        nome: m.nome,
        numeroAiuti,
        punti: numeroAiuti * puntiPerAiuto,
      };
    })
  );
  classifica.sort((a, b) => b.numeroAiuti - a.numeroAiuti);
  // Colonna "Cambio": snapshot giornaliero SEPARATO da quello della classifica punti.
  return await applicaCambioPosizione(classifica, 'classifica-aiuto-snapshot');
};
