import { kvs } from '@forge/kvs';
import TEMPLATE from './config/stagioni-default.json';

// Calendario delle stagioni, in KVS e modificabile dall'admin.
// Frame Figma 80:2 (Settings → scheda Season).
//
// ⚠️ NON è (ancora) il motore dei punti. Il rollover reale — migrazione punti in
// legacy, azzeramento, countdown dell'hub — vive ancora in stagione.js con la
// vecchia logica a 2 mesi. Questo calendario è un modello NUOVO e a sé, come lo
// è stato il modello Gruppo prima di sostituire membri/ruoli. Collegarlo al
// motore è un passo successivo e deliberato: finché non si fa, creare o
// modificare una stagione QUI non cambia quando i punti si resettano.
//
// Le date sono in UTC, coerentemente col resto dell'app (i confini stagione e
// il countdown sono già calcolati in UTC: vedi countdown-view / stagione.js).

const CHIAVE = 'calendario-stagioni';
const CHIAVE_SEQ = 'stagioni-seq'; // contatore monotono degli id, non azzerarlo

// --------------------------------------------------------------- generazione

// Genera le stagioni datate a partire da un anno, secondo il template.
// Funzione PURA (annoBase esplicito) così è testabile senza dipendere da "oggi".
// Nota: meseInizio+3 per il 4° trimestre dà mese 12 = gennaio dell'anno dopo,
// e "-1" porta all'ultimo millisecondo del 31 dicembre. Nessun bug di
// lunghezza-mese perché non contiamo mai i giorni a mano.
export const generaStagioniDefault = (annoBase, template = TEMPLATE) => {
  const stagioni = [];
  let seq = 0;

  for (let i = 0; i < template.anniDaCreare; i++) {
    const anno = annoBase + i;
    template.trimestri.forEach((t) => {
      seq += 1;
      stagioni.push({
        id: `s${seq}`,
        nome: t.nome,
        inizioMs: Date.UTC(anno, t.meseInizio, 1, 0, 0, 0, 0),
        fineMs: Date.UTC(anno, t.meseInizio + 3, 1, 0, 0, 0, 0) - 1,
      });
    });
  }

  return stagioni;
};

// --------------------------------------------------------------------- seed

// Popola il calendario la PRIMA volta, e mai più.
//
// Come per il catalogo sfide: seed pigro (non evento lifecycle, che non
// scatterebbe sulle installazioni già attive) e idempotente. "Mai scritta"
// (undefined) è il segnale, NON "array vuoto": se l'admin cancella tutte le
// stagioni di proposito, il calendario resta vuoto invece di ripopolarsi.
export const seedCalendarioSeVuoto = async () => {
  const esistenti = await kvs.get(CHIAVE);
  if (esistenti !== undefined && esistenti !== null) return;

  const annoCorrente = new Date().getUTCFullYear();
  const stagioni = generaStagioniDefault(annoCorrente);

  await kvs.set(CHIAVE, stagioni);
  await kvs.set(CHIAVE_SEQ, stagioni.length);
  console.log(
    `[catalogo-stagioni] seed iniziale: ${stagioni.length} stagioni ` +
    `da ${annoCorrente} a ${annoCorrente + TEMPLATE.anniDaCreare - 1}`
  );
};

// ------------------------------------------------------------------ letture

// Elenco piatto, ordinato per data d'inizio. Il frontend raggruppa per anno.
export const getStagioni = async () => {
  await seedCalendarioSeVuoto();
  const stagioni = await kvs.get(CHIAVE) || [];
  return [...stagioni].sort((a, b) => a.inizioMs - b.inizioMs);
};

// Stato di una stagione rispetto a un istante. La "corrente" è quella che
// contiene ORA: con le stagioni non sovrapposte (validato in scrittura) ce n'è
// al massimo una.
export const statoStagione = (stagione, ora) => {
  if (ora < stagione.inizioMs) return 'futura';
  if (ora > stagione.fineMs) return 'conclusa';
  return 'corrente';
};

// ------------------------------------------------------------------- helper

const prossimoId = async (stagioni) => {
  const numeri = stagioni
    .map((s) => parseInt(String(s.id).replace('s', ''), 10))
    .filter((n) => Number.isInteger(n));
  const daElenco = numeri.length > 0 ? Math.max(...numeri) : 0;

  const salvato = await kvs.get(CHIAVE_SEQ);
  const prossimo = Math.max(Number.isInteger(salvato) ? salvato : 0, daElenco) + 1;

  await kvs.set(CHIAVE_SEQ, prossimo);
  return `s${prossimo}`;
};

// Due intervalli si sovrappongono se NON sono l'uno del tutto prima dell'altro.
// `escludiId` salta la stagione che si sta modificando (che ovviamente si
// "sovrappone" con sé stessa).
const trovaSovrapposta = (stagioni, inizioMs, fineMs, escludiId) => {
  return stagioni.find(
    (s) => s.id !== escludiId && !(fineMs < s.inizioMs || inizioMs > s.fineMs)
  );
};

const valida = (nome, inizioMs, fineMs) => {
  const nomePulito = String(nome || '').trim();
  if (nomePulito === '') return { errore: 'Il nome della stagione è obbligatorio.' };
  if (!Number.isFinite(inizioMs) || !Number.isFinite(fineMs)) {
    return { errore: 'Date non valide.' };
  }
  if (inizioMs >= fineMs) {
    return { errore: 'La data di inizio deve precedere quella di fine.' };
  }
  return { nome: nomePulito };
};

// ------------------------------------------------------------------ scritture

export const creaStagione = async ({ nome, inizioMs, fineMs }) => {
  const v = valida(nome, inizioMs, fineMs);
  if (v.errore) return v;

  const stagioni = await getStagioni();

  const collisione = trovaSovrapposta(stagioni, inizioMs, fineMs, null);
  if (collisione) {
    return {
      errore: `Si sovrappone a "${collisione.nome}". Le stagioni non possono ` +
              'accavallarsi: i giorni scoperti tra una e l\'altra sono la pausa.',
    };
  }

  const nuova = { id: await prossimoId(stagioni), nome: v.nome, inizioMs, fineMs };
  const aggiornate = [...stagioni, nuova].sort((a, b) => a.inizioMs - b.inizioMs);
  await kvs.set(CHIAVE, aggiornate);
  return { successo: true, stagione: nuova, stagioni: aggiornate };
};

export const modificaStagione = async (id, { nome, inizioMs, fineMs }) => {
  const v = valida(nome, inizioMs, fineMs);
  if (v.errore) return v;

  const stagioni = await getStagioni();
  const stagione = stagioni.find((s) => s.id === id);
  if (!stagione) return { errore: 'Stagione non trovata.' };

  const collisione = trovaSovrapposta(stagioni, inizioMs, fineMs, id);
  if (collisione) {
    return { errore: `Si sovrappone a "${collisione.nome}".` };
  }

  const aggiornate = stagioni
    .map((s) => (s.id === id ? { ...s, nome: v.nome, inizioMs, fineMs } : s))
    .sort((a, b) => a.inizioMs - b.inizioMs);
  await kvs.set(CHIAVE, aggiornate);
  return { successo: true, stagioni: aggiornate };
};

// Elimina una stagione. La CORRENTE non è eliminabile (🔒 nel mockup): per
// chiuderla in anticipo si userà "Termina stagione" nella zona critica, non
// una cancellazione che lascerebbe l'app senza stagione attiva.
export const eliminaStagione = async (id, ora) => {
  const stagioni = await getStagioni();
  const stagione = stagioni.find((s) => s.id === id);
  if (!stagione) return { errore: 'Stagione non trovata.' };

  if (statoStagione(stagione, ora) === 'corrente') {
    return {
      errore: 'La stagione in corso non è eliminabile. Per chiuderla in ' +
              'anticipo usa "Termina stagione" nella zona critica.',
    };
  }

  const aggiornate = stagioni.filter((s) => s.id !== id);
  await kvs.set(CHIAVE, aggiornate);
  return { successo: true, stagioni: aggiornate };
};
