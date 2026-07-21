import { kvs } from '@forge/kvs';
import DEFAULT_SFIDE from './config/sfide-default.json';
import DEFAULT_EXTRA from './config/extra-default.json';

// Catalogo delle sfide, in KVS e modificabile dall'admin.
//
// Prima del 19/07 le sfide predefinite erano un array hardcoded in sfide.js e
// solo le "custom" vivevano in KVS. Ora la sorgente è UNA: questo catalogo.
// I valori iniziali stanno in config/sfide-default.json — un file di
// configurazione, non codice: chi vuole cambiare il catalogo di partenza per
// una nuova installazione tocca quel file e basta.
//
// ⚠️ Le `key` del file di default sono le STESSE di prima ('doc-5',
// 'ticket-5stelle', …). Non cambiarle: le sfide accettate dagli utenti sono
// salvate in `sfide-<accountId>` e le referenziano per key. Cambiarle
// significherebbe far sparire dalle classifiche tutto lo storico.
//
// Un SOLO catalogo, due sorgenti di seed. Le categorie portano un campo
// `gruppo`: 'challenge' (le sfide, in config/sfide-default.json) o 'extra'
// (Feedback e Golden WorkItem, in config/extra-default.json). Il tab Challenges
// mostra le challenge, il tab Extra le extra: stessa struttura, stesso KVS,
// stessa logica di lettura — cambia solo il filtro nel frontend. Feedback resta
// nel catalogo (aiuti.js lo legge ancora con getCategoria('feedback')), solo
// taggato 'extra'. Golden WorkItem è una categoria di sola config (`config:
// true`): non ha item e i suoi numeri vivono in golden-ticket.js.
const DEFAULT = {
  categorie: [...DEFAULT_SFIDE.categorie, ...DEFAULT_EXTRA.categorie],
  sfide: [...DEFAULT_SFIDE.sfide, ...DEFAULT_EXTRA.sfide],
};

const CHIAVE_SFIDE = 'catalogo-sfide';
const CHIAVE_CATEGORIE = 'catalogo-categorie';

// --------------------------------------------------------------------- seed

// Popola il catalogo la PRIMA volta, e mai più.
//
// Perché non l'evento lifecycle di installazione: quell'evento scatta solo
// all'installazione, e su questa installazione — già attiva — non scatterebbe
// mai, lasciando il catalogo vuoto per sempre. Un seed pigro invece copre sia
// le installazioni nuove sia quelle esistenti.
//
// Idempotente per costruzione: usa "mai scritta" (undefined) come segnale, NON
// "array vuoto". Se l'admin cancella tutte le sfide di proposito, il catalogo
// resta vuoto invece di ripopolarsi da solo a ogni lettura.
export const seedCatalogoSeVuoto = async () => {
  const sfide = await kvs.get(CHIAVE_SFIDE);
  const categorie = await kvs.get(CHIAVE_CATEGORIE);

  const primaVolta = categorie === undefined || categorie === null;

  if (sfide === undefined || sfide === null) {
    await kvs.set(CHIAVE_SFIDE, DEFAULT.sfide);
    console.log(`[catalogo-sfide] seed iniziale: ${DEFAULT.sfide.length} sfide`);
  }

  if (primaVolta) {
    await kvs.set(CHIAVE_CATEGORIE, DEFAULT.categorie);
    console.log(`[catalogo-sfide] seed iniziale: ${DEFAULT.categorie.length} categorie`);
    return;
  }

  // AGGIORNAMENTO delle installazioni già seedate.
  //
  // Il seed iniziale scatta una volta sola, quindi una categoria aggiunta al
  // file di configurazione DOPO il primo avvio non arriverebbe mai a chi ha già
  // il catalogo in KVS. Qui innestiamo solo le categorie nuove, riconosciute
  // per `tipo`, senza toccare quelle esistenti: i valori che l'admin ha
  // personalizzato restano suoi.

  // BACKFILL del campo `gruppo` (introdotto il 19/07 con il tab Extra). Le
  // categorie già in KVS da prima non ce l'hanno: senza, Feedback non
  // comparirebbe in Extra e resterebbe in Challenges. Copiamo il gruppo dal
  // file di default per `tipo`; se un domani una categoria non fosse nel file,
  // resta 'challenge' (il default storico), mai senza gruppo. Idempotente:
  // tocca solo chi il gruppo non ce l'ha.
  let categorieBase = categorie;
  const senzaGruppo = categorie.some((c) => c.gruppo === undefined);
  if (senzaGruppo) {
    categorieBase = categorie.map((c) => {
      if (c.gruppo !== undefined) return c;
      const dal = DEFAULT.categorie.find((d) => d.tipo === c.tipo);
      return { ...c, gruppo: dal?.gruppo || 'challenge' };
    });
    await kvs.set(CHIAVE_CATEGORIE, categorieBase);
    console.log('[catalogo-sfide] backfill gruppo sulle categorie esistenti');
  }

  const presenti = categorieBase.map((c) => c.tipo);
  const mancanti = DEFAULT.categorie.filter((c) => !presenti.includes(c.tipo));
  if (mancanti.length === 0) return;

  await kvs.set(CHIAVE_CATEGORIE, [...categorieBase, ...mancanti]);

  // Insieme alla categoria nuova arrivano le sue sfide di default, ma SOLO se
  // non ce n'è già nessuna di quel tipo: così non resuscitiamo elementi che
  // l'admin avesse eliminato di proposito.
  const catalogo = await kvs.get(CHIAVE_SFIDE) || [];
  const daAggiungere = DEFAULT.sfide.filter(
    (s) => mancanti.some((c) => c.tipo === s.tipo) &&
           !catalogo.some((esistente) => esistente.tipo === s.tipo)
  );

  if (daAggiungere.length > 0) {
    await kvs.set(CHIAVE_SFIDE, [...catalogo, ...daAggiungere]);
  }

  console.log(
    `[catalogo-sfide] aggiornamento: +${mancanti.length} categorie ` +
    `(${mancanti.map((c) => c.tipo).join(', ')}), +${daAggiungere.length} sfide`
  );
};

// ------------------------------------------------------------------ letture

export const getCatalogo = async () => {
  await seedCatalogoSeVuoto();
  return await kvs.get(CHIAVE_SFIDE) || [];
};

export const getCategorie = async () => {
  await seedCatalogoSeVuoto();
  return await kvs.get(CHIAVE_CATEGORIE) || [];
};

export const getCategoria = async (tipo) => {
  const categorie = await getCategorie();
  return categorie.find((c) => c.tipo === tipo);
};

// Limiti per tipo nella forma attesa da accettaSfida: { giornaliera: 3, ... }.
export const getLimiti = async () => {
  const categorie = await getCategorie();
  const limiti = {};
  categorie.forEach((c) => { limiti[c.tipo] = c.limite; });
  return limiti;
};

// ---------------------------------------------------------------- scritture

// Aggiunge una sfida. I punti sono facoltativi: se non indicati eredita il
// default della categoria, che è il comportamento del mockup ("erediteranno
// punteggio di default"). Indicandoli si personalizza la singola sfida.
export const aggiungiSfida = async ({ tipo, nome, emoji, descrizione, punti }) => {
  const nomePulito = String(nome || '').trim();
  if (nomePulito === '') return { errore: 'Il nome della sfida è obbligatorio.' };

  const categoria = await getCategoria(tipo);
  if (!categoria) return { errore: 'Categoria non valida.' };

  const catalogo = await getCatalogo();

  const nuova = {
    // Prefisso 'custom-' mantenuto per compatibilità: il frontend e i dati già
    // in KVS lo usano per distinguere le sfide aggiunte a mano.
    key: `custom-${Date.now()}`,
    tipo,
    emoji: String(emoji || '🎯').trim(),
    nome: nomePulito,
    punti: Number.isInteger(punti) && punti > 0 ? punti : categoria.puntiDefault,
    descrizione: String(descrizione || '').trim(),
  };

  const aggiornato = [...catalogo, nuova];
  await kvs.set(CHIAVE_SFIDE, aggiornato);
  return { successo: true, sfida: nuova, catalogo: aggiornato };
};

// Modifica una sfida esistente. Il tipo NON è modificabile: cambiarlo
// sposterebbe la sfida di categoria cambiandone limiti e scadenze, mentre
// utenti potrebbero averla già accettata con la scadenza della vecchia.
export const modificaSfida = async (key, { nome, emoji, descrizione, punti }) => {
  const catalogo = await getCatalogo();
  const sfida = catalogo.find((s) => s.key === key);
  if (!sfida) return { errore: 'Sfida non trovata.' };

  const nomePulito = String(nome ?? sfida.nome).trim();
  if (nomePulito === '') return { errore: 'Il nome della sfida è obbligatorio.' };

  const aggiornato = catalogo.map((s) =>
    s.key === key
      ? {
          ...s,
          nome: nomePulito,
          emoji: String(emoji ?? s.emoji).trim(),
          descrizione: String(descrizione ?? s.descrizione).trim(),
          punti: Number.isInteger(punti) && punti > 0 ? punti : s.punti,
        }
      : s
  );

  await kvs.set(CHIAVE_SFIDE, aggiornato);
  return { successo: true, catalogo: aggiornato };
};

// Elimina una sfida dal catalogo.
//
// ⚠️ CONSEGUENZA ACCETTATA (decisione del 19/07): i punti di chi l'aveva
// completata vengono ricalcolati cercando la sfida nel catalogo, quindi
// eliminandola quei punti SPARISCONO dalle classifiche, anche a stagione in
// corso. La UI lo dice esplicitamente prima di confermare.
export const eliminaSfida = async (key) => {
  const catalogo = await getCatalogo();
  const sfida = catalogo.find((s) => s.key === key);
  if (!sfida) return { errore: 'Sfida non trovata.' };

  const aggiornato = catalogo.filter((s) => s.key !== key);
  await kvs.set(CHIAVE_SFIDE, aggiornato);
  return { successo: true, catalogo: aggiornato };
};

// Ripristina le sfide di default MANCANTI, senza toccare le altre.
//
// Regole volute (19/07):
//   - catalogo svuotato del tutto  → torna completo;
//   - eliminate solo alcune        → tornano solo quelle;
//   - key già presente             → NON si tocca, anche se l'admin ne ha
//                                    cambiato nome, emoji, punti o descrizione.
//
// Il confronto è sulla `key`, non sul contenuto: è l'identità della sfida, ed è
// ciò che le sfide accettate dagli utenti referenziano. Una sfida rinominata
// dall'admin resta la sua, non viene "corretta" secondo il file di default.
//
// Le sfide aggiunte a mano (prefisso 'custom-') non compaiono nel file di
// default, quindi non vengono né toccate né duplicate.
export const ripristinaDefault = async () => {
  const catalogo = await getCatalogo();
  const presenti = new Set(catalogo.map((s) => s.key));

  const mancanti = DEFAULT.sfide.filter((s) => !presenti.has(s.key));
  if (mancanti.length === 0) {
    return { successo: true, aggiunte: 0, catalogo };
  }

  // In coda, non riordinate: se l'admin ha ricostruito un ordine suo, le
  // ripristinate si accodano invece di rimescolargli il catalogo.
  const aggiornato = [...catalogo, ...mancanti];
  await kvs.set(CHIAVE_SFIDE, aggiornato);

  console.log(`[catalogo-sfide] ripristinate ${mancanti.length} sfide di default`);
  return { successo: true, aggiunte: mancanti.length, catalogo: aggiornato };
};

// Aggiorna punteggio di default e limite di una categoria.
// Le categorie sono FISSE: si modificano, non si creano né si eliminano.
export const setCategoria = async (tipo, { puntiDefault, limite }) => {
  const categorie = await getCategorie();
  const categoria = categorie.find((c) => c.tipo === tipo);
  if (!categoria) return { errore: 'Categoria non valida.' };

  if (!Number.isInteger(puntiDefault) || puntiDefault < 1) {
    return { errore: 'Il punteggio di default deve essere un intero positivo.' };
  }
  if (!Number.isInteger(limite) || limite < 1) {
    return { errore: 'Il limite deve essere almeno 1.' };
  }

  const aggiornate = categorie.map((c) =>
    c.tipo === tipo ? { ...c, puntiDefault, limite } : c
  );

  await kvs.set(CHIAVE_CATEGORIE, aggiornate);
  return { successo: true, categorie: aggiornate };
};
