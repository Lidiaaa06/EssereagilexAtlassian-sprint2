import { kvs } from '@forge/kvs';

const DURATA_PENSIERO_MS = 24 * 60 * 60 * 1000; // 24 ore

// Rimuove i pensieri scaduti (più vecchi di 24 ore)
const pulisciPensieriScaduti = async () => {
  const pensieri = await kvs.get('pensieri') || [];
  const ora = Date.now();
  const attivi = pensieri.filter(p => ora - p.data < DURATA_PENSIERO_MS);
  await kvs.set('pensieri', attivi);
  return attivi;
};

// Controlla se l'utente ha già scritto un pensiero oggi
const haScrittoDoggi = async (accountId) => {
  const ultimaData = await kvs.get(`pensiero-oggi-${accountId}`);
  if (!ultimaData) return false;
  
  const oggi = new Date();
  const dataOggi = `${oggi.getFullYear()}-${oggi.getMonth() + 1}-${oggi.getDate()}`;
  
  return ultimaData === dataOggi;
};

// Aggiunge un nuovo pensiero
export const aggiungiPensiero = async (testo, autore, autoreId) => {
  const haGiaScritto = await haScrittoDoggi(autoreId);
  if (haGiaScritto) return { errore: 'Hai già scritto il tuo pensiero di oggi!' };

  const pensieri = await pulisciPensieriScaduti();

  const nuovoPensiero = {
    id: `pensiero-${Date.now()}`,
    testo: testo.slice(0, 500),
    autore,
    autoreId,
    data: Date.now(),
    reactions: {
      fuoco: [],
      cervello: [],
      fulmine: [],
      trofeo: []
    },
    commenti: []
  };

  await kvs.set('pensieri', [...pensieri, nuovoPensiero]);

  const oggi = new Date();
  const dataOggi = `${oggi.getFullYear()}-${oggi.getMonth() + 1}-${oggi.getDate()}`;
  await kvs.set(`pensiero-oggi-${autoreId}`, dataOggi);

  return { successo: true, pensieri: await kvs.get('pensieri') };
};

// Leggi tutti i pensieri (pulisce quelli scaduti)
export const getPensieri = async () => {
  return await pulisciPensieriScaduti();
};

// Toggle reaction
export const toggleReactionPensiero = async (pensieroId, reaction, accountId) => {
  const pensieri = await kvs.get('pensieri') || [];

  const aggiornati = pensieri.map(pensiero => {
    if (pensiero.id !== pensieroId) return pensiero;

    const listaReaction = pensiero.reactions[reaction] || [];
    const haReagito = listaReaction.includes(accountId);

    return {
      ...pensiero,
      reactions: {
        ...pensiero.reactions,
        [reaction]: haReagito
          ? listaReaction.filter(id => id !== accountId)
          : [...listaReaction, accountId]
      }
    };
  });

  await kvs.set('pensieri', aggiornati);
  return await kvs.get('pensieri');
};

// Aggiungi commento
export const aggiungiCommentoPensiero = async (pensieroId, testo, autore, autoreId) => {
  const pensieri = await kvs.get('pensieri') || [];

  const aggiornati = pensieri.map(pensiero => {
    if (pensiero.id !== pensieroId) return pensiero;

    const nuovoCommento = {
      id: `comm-${Date.now()}`,
      testo: testo.slice(0, 300),
      autore,
      autoreId,
      data: Date.now()
    };

    return {
      ...pensiero,
      commenti: [...pensiero.commenti, nuovoCommento]
    };
  });

  await kvs.set('pensieri', aggiornati);
  return await kvs.get('pensieri');
};

// Elimina commento (solo autore)
export const eliminaCommentoPensiero = async (pensieroId, commentoId, richiedenteId) => {
  const pensieri = await kvs.get('pensieri') || [];

  const aggiornati = pensieri.map(pensiero => {
    if (pensiero.id !== pensieroId) return pensiero;

    return {
      ...pensiero,
      commenti: pensiero.commenti.filter(c =>
        !(c.id === commentoId && c.autoreId === richiedenteId)
      )
    };
  });

  await kvs.set('pensieri', aggiornati);
  return await kvs.get('pensieri');
};

// Elimina pensiero (solo autore) e resetta il limite giornaliero
export const eliminaPensiero = async (pensieroId, richiedenteId) => {
  const pensieri = await kvs.get('pensieri') || [];
  const aggiornati = pensieri.filter(p =>
    !(p.id === pensieroId && p.autoreId === richiedenteId)
  );
  await kvs.set('pensieri', aggiornati);
  await kvs.set(`pensiero-oggi-${richiedenteId}`, '1970-1-1');
  return await kvs.get('pensieri');
};

// Controlla se l'utente ha già scritto oggi
export const getStatoPensiero = async (accountId) => {
  const haGiaScritto = await haScrittoDoggi(accountId);
  return { haGiaScritto };
};