import { kvs } from '@forge/kvs';
import { getPuntiBonus } from './sfide';
import { getCatalogo } from './catalogo-sfide';
import { getStagioni } from './catalogo-stagioni';
import { getMembri } from './membri';

// Motore stagioni. Da 19/07 (3ª parte) i confini NON sono più calcolati a 2
// mesi da un timestamp: vengono dal CALENDARIO (catalogo-stagioni.js). La
// stagione corrente è quella che contiene "ora"; la migrazione dei punti in
// legacy scatta quando quella stagione finisce, cioè quando diventa "conclusa".
//
// Vecchie funzioni calcolaFineStagione / calcolaInizioProssimaStagione RIMOSSE:
// la logica "quando siamo" ora interroga il calendario.

const GIORNO = 24 * 60 * 60 * 1000;

// -------------------------------------------------------- lettura dal calendario

// La stagione che contiene "ora" (o null se siamo in pausa / fuori calendario).
const getStagioneCorrente = async (ora = Date.now()) => {
  const stagioni = await getStagioni();
  return stagioni.find((s) => ora >= s.inizioMs && ora <= s.fineMs) || null;
};

// La prossima stagione che inizierà dopo "ora" (o null se non ce ne sono più).
// getStagioni() torna già ordinato per inizio, quindi la prima che trova è quella.
const getProssimaStagione = async (ora = Date.now()) => {
  const stagioni = await getStagioni();
  return stagioni.find((s) => s.inizioMs > ora) || null;
};

export const getStatoStagione = async () => {
  const corrente = await getStagioneCorrente();
  if (corrente) return 'attiva';
  // Nessuna stagione contiene "ora": se ce n'è una futura siamo in pausa,
  // altrimenti il calendario è finito.
  const prossima = await getProssimaStagione();
  return prossima ? 'pausa' : 'scaduta';
};

const calcolaBadge = (points) => {
  if (points >= 1000) return { name: 'Ticket Destroyer', emoji: '👹' };
  if (points >= 600) return { name: 'Farmer', emoji: '👨‍🌾' };
  if (points >= 300) return { name: 'Master', emoji: '👨‍🏫' };
  if (points >= 150) return { name: 'Legend', emoji: '🐐' };
  if (points >= 100) return { name: 'Champion', emoji: '🏆' };
  if (points >= 60) return { name: 'Expert', emoji: '🥇' };
  if (points >= 30) return { name: 'Intermediate', emoji: '🥈' };
  return { name: 'Rookie', emoji: '🥉' };
};

// ----------------------------------------------- inizializzazione anti-wipe

// Al PRIMO avvio col nuovo motore, segna come "già migrate" tutte le stagioni
// già concluse a quel momento. Senza, il primo controllaStagione troverebbe la
// stagione appena conclusa (es. 2° trimestre) come "da migrare" e azzererebbe i
// punti di tutti retroattivamente. Con questo marcatore, la migrazione scatterà
// solo quando la stagione ATTUALE finirà per davvero.
const inizializzaMarcatoreMigrazione = async () => {
  if (await kvs.get('migrazione-inizializzata')) return;

  const ora = Date.now();
  const stagioni = await getStagioni();
  const concluse = stagioni.filter((s) => s.fineMs <= ora).map((s) => s.fineMs);
  const marcatore = concluse.length > 0 ? Math.max(...concluse) : 0;

  await kvs.set('stagione-migrata-fino-a', marcatore);
  await kvs.set('migrazione-inizializzata', true);
  console.log(`[stagione] marcatore migrazione inizializzato a ${new Date(marcatore).toISOString()}`);
};

// -------------------------------------------------------------- il rollover

// Chiamata a ogni getUserStats e dal trigger. Migra i punti in legacy quando una
// stagione è appena diventata "conclusa" e non l'abbiamo ancora migrata.
export const controllaStagione = async () => {
  await inizializzaMarcatoreMigrazione();

  const ora = Date.now();
  const stagioni = await getStagioni();
  const migrataFinoA = await kvs.get('stagione-migrata-fino-a') || 0;

  // La stagione conclusa PIÙ RECENTE non ancora migrata. Se per un lungo
  // silenzio dell'app se ne fossero concluse due, migriamo una volta sola (i
  // punti accumulati confluiscono insieme) e avanziamo il marcatore all'ultima.
  const daMigrare = stagioni
    .filter((s) => s.fineMs <= ora && s.fineMs > migrataFinoA)
    .sort((a, b) => b.fineMs - a.fineMs)[0];

  if (!daMigrare) return await getStatoStagioneTestuale();

  const numeroStagione = await kvs.get('stagione-numero') || 1;
  const membri = await getMembri();
  const catalogoSfide = await getCatalogo();

  const classificaFinale = await Promise.all(
    membri.map(async (membro) => {
      const puntiTicket = await kvs.get(`punti-stagione-${membro.accountId}`) || 0;
      const ticket = await kvs.get(`ticket-stagione-${membro.accountId}`) || 0;

      const sfideUtente = await kvs.get(`sfide-${membro.accountId}`) || [];
      const puntiSfide = sfideUtente
        .filter((s) => s.completata)
        .reduce((acc, s) => {
          const sfida = catalogoSfide.find((sf) => sf.key === s.key);
          const bonus = s.descrizione ? getPuntiBonus(s.tipo) : 0;
          return acc + (sfida ? sfida.punti + bonus : 0);
        }, 0);

      const puntiValutazioneRaw = await kvs.get(`punti-valutazione-${membro.accountId}`) || 0;
      const puntiValutazione = puntiValutazioneRaw / 10;
      const puntiTotali = puntiTicket + puntiSfide + puntiValutazione;

      return { accountId: membro.accountId, nome: membro.nome, puntiTotali, ticket };
    })
  );
  classificaFinale.sort((a, b) => b.puntiTotali - a.puntiTotali);

  for (let i = 0; i < classificaFinale.length; i++) {
    const membro = classificaFinale[i];
    const puntiLegacy = await kvs.get(`punti-legacy-${membro.accountId}`) || 0;
    const badge = calcolaBadge(membro.puntiTotali);

    await kvs.set(`riepilogo-${membro.accountId}`, {
      numeroStagione,
      nomeStagione: daMigrare.nome,
      ticketChiusi: membro.ticket,
      puntiGuadagnati: membro.puntiTotali,
      badge,
      posizione: i + 1,
      totalePartecipanti: membri.length,
    });

    await kvs.set(`punti-legacy-${membro.accountId}`, puntiLegacy + membro.puntiTotali);
    await kvs.set(`punti-stagione-${membro.accountId}`, 0);
    await kvs.set(`ticket-stagione-${membro.accountId}`, 0);
    await kvs.set(`sfide-${membro.accountId}`, []);
    await kvs.set(`punti-valutazione-${membro.accountId}`, 0);
  }

  // Avanza il marcatore e incrementa il numero. Il calendario NON viene toccato:
  // la prossima stagione esiste già, non va ricreata (a differenza del vecchio
  // motore che generava una nuova finestra di 2 mesi).
  await kvs.set('stagione-migrata-fino-a', daMigrare.fineMs);
  await kvs.set('stagione-numero', numeroStagione + 1);
  return 'nuova';
};

export const resettaPuntiUtente = async (accountId) => {
  const puntiStagione = await kvs.get(`punti-stagione-${accountId}`) || 0;
  const puntiLegacy = await kvs.get(`punti-legacy-${accountId}`) || 0;
  await kvs.set(`punti-legacy-${accountId}`, puntiLegacy + puntiStagione);
  await kvs.set(`punti-stagione-${accountId}`, 0);
  await kvs.set(`ticket-stagione-${accountId}`, 0);
  await kvs.set(`sfide-${accountId}`, []);
  await kvs.set(`punti-valutazione-${accountId}`, 0);
};

export const aggiungiPunti = async (accountId, punti) => {
  const puntiAttuali = await kvs.get(`punti-stagione-${accountId}`) || 0;
  const nuoviPunti = Math.max(0, puntiAttuali + punti);
  await kvs.set(`punti-stagione-${accountId}`, nuoviPunti);
  return nuoviPunti;
};

export const getPuntiStagione = async (accountId) => {
  return await kvs.get(`punti-stagione-${accountId}`) || 0;
};

export const getPuntiLegacy = async (accountId) => {
  return await kvs.get(`punti-legacy-${accountId}`) || 0;
};

export const getNumeroStagione = async () => {
  return await kvs.get('stagione-numero') || 1;
};

export const getGiorniRimanenti = async () => {
  const corrente = await getStagioneCorrente();
  if (!corrente) return 0;
  return Math.max(0, Math.ceil((corrente.fineMs - Date.now()) / GIORNO));
};

export const getStatoStagioneTestuale = async () => {
  const stato = await getStatoStagione();
  if (stato === 'attiva') return 'attiva';
  if (stato === 'pausa') return 'pausa';
  return 'nuova';
};

export const getTicketStagione = async (accountId) => {
  return await kvs.get(`ticket-stagione-${accountId}`) || 0;
};

export const getRiepilogoStagione = async (accountId) => {
  return await kvs.get(`riepilogo-${accountId}`) || null;
};

// Tempo alla PROSSIMA stagione, mostrato in pausa. Durante una stagione attiva
// ritorna null: il countdown "nuova stagione" ha senso solo tra una e l'altra.
export const getCountdownNuovaStagione = async () => {
  const corrente = await getStagioneCorrente();
  if (corrente) return null;

  const prossima = await getProssimaStagione();
  if (!prossima) return null;

  const msRimanenti = prossima.inizioMs - Date.now();
  if (msRimanenti <= 0) return null;

  const ore = Math.floor(msRimanenti / (1000 * 60 * 60));
  const minuti = Math.floor((msRimanenti % (1000 * 60 * 60)) / (1000 * 60));
  const giorni = Math.floor(ore / 24);

  if (giorni > 0) return `${giorni}g ${ore % 24}h`;
  return `${ore}h ${minuti}m`;
};

// Dati grezzi per il countdown live nell'hub. Espone i timestamp REALI (ms) presi
// dal calendario, così il countdown non diverge dalle date mostrate altrove.
// { attiva: false } se non c'è una stagione in corso (pausa o calendario finito).
export const getDatiCountdownStagione = async () => {
  const corrente = await getStagioneCorrente();
  if (!corrente) return { attiva: false };

  const prossima = await getProssimaStagione();
  return {
    attiva: true,
    fineMs: corrente.fineMs,
    inizioProssimaMs: prossima ? prossima.inizioMs : null,
    numero: await kvs.get('stagione-numero') || 1,
    stato: await getStatoStagione(),
  };
};

// Punti per ticket completato. Configurabile (getConfigPunti/setConfigPunti).
// Slegato dal calendario: resta com'era. ?? e non || così un 0 configurato resta 0.
export const getPuntiPerTicket = async () => {
  return await kvs.get('config-punti-per-ticket') ?? 3;
};

export const setPuntiPerTicket = async (n) => {
  const val = Number(n);
  if (!Number.isFinite(val)) throw new Error('Valore non valido');
  await kvs.set('config-punti-per-ticket', val);
  return val;
};
