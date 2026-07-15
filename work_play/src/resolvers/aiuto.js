import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
import { isSupervisore } from './ruoli';

// Resolver dedicato alla funzione "Segnala Aiuto".
// Tutti i dati stanno in KVS, SEPARATI dagli XP/stagione di work_play:
//   - 'aiuto-dati'     -> { config:{puntiPerAiuto}, punti:{accountId:n}, storico:[...] }
//   - 'aiuto-snapshot' -> { data, posizioni }  (per la colonna "Cambio")

const resolver = new Resolver();

const TEAM = [
  { nome: 'Roberto', accountId: '712020:a4ccdea1-0bb3-408f-9623-93c19691d980' },
  { nome: 'Alessandro', accountId: '712020:48b975fc-daa2-4bc8-92dd-f8bf751a454a' },
  { nome: 'Ludovica', accountId: '712020:c82776d1-c22b-4b85-ae3c-0110c541520f' },
  { nome: 'Matthia', accountId: '712020:68180304-900d-4cbe-ad8e-73695ad5b96d' },
  { nome: 'Lidia', accountId: '712020:5930294d-413c-434a-ae40-db82633bff30' },
];

const PUNTI_DEFAULT = 10;

const nomeDaAccountId = (accountId) =>
  TEAM.find((m) => m.accountId === accountId)?.nome || 'Sconosciuto';

// Legge il blob dati normalizzando i default (così non esplode al primo avvio).
const getDati = async () => {
  const d = await kvs.get('aiuto-dati');
  return {
    config: { puntiPerAiuto: d?.config?.puntiPerAiuto ?? PUNTI_DEFAULT },
    punti: d?.punti || {},
    storico: Array.isArray(d?.storico) ? d.storico : [],
  };
};

// --- Snapshot posizioni per la colonna "Cambio" ---------------------------
const dataOdierna = () => {
  const oggi = new Date();
  return `${oggi.getFullYear()}-${oggi.getMonth() + 1}-${oggi.getDate()}`;
};

const applicaCambioPosizione = async (classificaOrdinata) => {
  const snapshot = await kvs.get('aiuto-snapshot');

  const posizioniOggi = {};
  classificaOrdinata.forEach((u, i) => {
    posizioniOggi[u.accountId] = i + 1;
  });

  const risultato = classificaOrdinata.map((utente, index) => {
    const posizioneAttuale = index + 1;
    const posizionePrecedente = snapshot?.posizioni?.[utente.accountId];
    if (!posizionePrecedente) {
      return { ...utente, cambioPosizione: 0 };
    }
    return { ...utente, cambioPosizione: posizionePrecedente - posizioneAttuale };
  });

  const oggi = dataOdierna();
  if (!snapshot || snapshot.data !== oggi) {
    await kvs.set('aiuto-snapshot', { data: oggi, posizioni: posizioniOggi });
  }

  return risultato;
};

// --- Config punti (leggibile da tutti, modificabile solo dal supervisore) --
resolver.define('getConfigAiuto', async (req) => {
  const dati = await getDati();
  const accountId = req.context.accountId;
  const sup = await isSupervisore(accountId, TEAM);
  return { puntiPerAiuto: dati.config.puntiPerAiuto, isSupervisore: sup };
});

resolver.define('setConfigAiuto', async (req) => {
  const accountId = req.context.accountId;
  if (!(await isSupervisore(accountId, TEAM))) {
    return { errore: 'Non hai i permessi per modificare i punti aiuto.' };
  }
  const val = Number(req.payload.puntiPerAiuto);
  if (!Number.isFinite(val) || val < 0) {
    return { errore: 'Valore non valido: inserisci un numero >= 0.' };
  }
  const dati = await getDati();
  dati.config.puntiPerAiuto = val;
  await kvs.set('aiuto-dati', dati);
  return { successo: true, puntiPerAiuto: val };
});

// --- Segnalazione aiuto ----------------------------------------------------
resolver.define('segnalaAiuto', async (req) => {
  const { collegaId, collegaNome, issueKey, descrizione } = req.payload;
  const segnalatoDa = req.context.accountId;

  const dati = await getDati();
  const incremento = Number(dati.config.puntiPerAiuto) || 0;

  dati.punti[collegaId] = (dati.punti[collegaId] || 0) + incremento;
  dati.storico.push({
    collegaId,
    collegaNome: collegaNome || nomeDaAccountId(collegaId),
    descrizione: (descrizione || '').trim(),
    segnalatoDa,
    segnalatoDaNome: nomeDaAccountId(segnalatoDa),
    issueKey: issueKey || null,
    data: Date.now(),
  });

  await kvs.set('aiuto-dati', dati);
  return { success: true, nuoviPunti: dati.punti[collegaId], incremento };
});

// --- Aiuti segnalati su un ticket specifico --------------------------------
resolver.define('getAiutiTicket', async (req) => {
  const { issueKey } = req.payload;
  const dati = await getDati();
  return dati.storico
    .filter((a) => a.issueKey === issueKey)
    .map((a) => ({
      collegaNome: a.collegaNome,
      descrizione: a.descrizione || '',
      segnalatoDaNome: a.segnalatoDaNome,
      data: a.data || 0,
    }))
    .sort((a, b) => (b.data || 0) - (a.data || 0));
});

// --- Classifica aiuto ------------------------------------------------------
resolver.define('getClassificaAiuto', async () => {
  const dati = await getDati();

  const conteggi = {};
  dati.storico.forEach((a) => {
    conteggi[a.collegaId] = (conteggi[a.collegaId] || 0) + 1;
  });

  const classifica = TEAM.map((m) => ({
    nome: m.nome,
    accountId: m.accountId,
    punti: dati.punti[m.accountId] || 0,
    numeroAiuti: conteggi[m.accountId] || 0,
  }));

  const ordinata = classifica.sort((a, b) => b.punti - a.punti);
  return applicaCambioPosizione(ordinata);
});

export const handler = resolver.getDefinitions();