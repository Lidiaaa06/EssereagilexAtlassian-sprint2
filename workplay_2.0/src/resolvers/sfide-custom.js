import {
  getCatalogo,
  aggiungiSfida,
  eliminaSfida,
} from './catalogo-sfide';

// ADATTATORE, non più uno storage a sé.
//
// Fino al 19/07 qui viveva un elenco separato di sfide "custom", che veniva
// concatenato all'array hardcoded di sfide.js. Ora la sorgente è UNA sola —
// il catalogo in KVS (catalogo-sfide.js) — e questo file resta solo per non
// rompere chi lo importa già: index.js e il pannello admin storico.
//
// Nuovo codice: usare direttamente catalogo-sfide.js.

// Sorgente unica di verità per "tutte le sfide del sistema".
// Il nome resta questo perché è citato in CLAUDE.md come l'UNICO punto da cui
// leggere le sfide: cambiarlo manderebbe fuori strada chi legge quelle regole.
export const getTutteLeSfide = async () => {
  return await getCatalogo();
};

// Solo le sfide aggiunte a mano. Nel catalogo unificato si riconoscono dal
// prefisso della key, che abbiamo mantenuto proprio per questo.
export const getSfideCustom = async () => {
  const catalogo = await getCatalogo();
  return catalogo.filter((s) => String(s.key).startsWith('custom-'));
};

export const aggiungiSfidaCustom = async ({ nome, emoji, tipo, descrizione }) => {
  const esito = await aggiungiSfida({ nome, emoji, tipo, descrizione });
  if (esito.errore) return esito;
  return { successo: true, sfida: esito.sfida, sfideCustom: await getSfideCustom() };
};

// Il guardrail storico resta: dal pannello admin VECCHIO si possono eliminare
// solo le sfide aggiunte a mano, non quelle del catalogo iniziale.
// La nuova pagina Settings usa eliminaSfida() e può eliminare tutto — è una
// scelta consapevole, con avviso esplicito all'admin.
export const rimuoviSfidaCustom = async (key) => {
  if (!key || !String(key).startsWith('custom-')) {
    return { errore: 'Puoi rimuovere solo le sfide personalizzate' };
  }

  const esito = await eliminaSfida(key);
  if (esito.errore) return esito;
  return { successo: true, sfideCustom: await getSfideCustom() };
};
