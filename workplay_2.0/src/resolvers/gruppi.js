import { kvs } from '@forge/kvs';

// Modello dei GRUPPI (decisione di design del 18/07, vedi docs/HANDOFF-2026-07-18.md).
//
// Un gruppo è { id, nome, teamLeaderId, developers: [accountId, ...] }.
// A regime sostituirà membri.js + ruoli.js, ma per ora convive con loro senza
// toccarli: questo file non importa nulla da membri.js e nessuno lo importa
// ancora. Il flusso attuale resta identico finché non accendiamo il flag.
//
// L'ALBERO È IMPLICITO, non c'è nessun campo parentId.
// Il gruppo H è figlio di G quando il team leader di H compare fra i developers
// di G. Da qui discendono due invarianti che le funzioni qui sotto difendono:
//   1. un developer sta in UN SOLO gruppo  → quindi un gruppo ha un solo padre;
//   2. niente cicli  → un gruppo non può finire sotto un proprio discendente.
//
// Vincoli KVS del progetto rispettati: mai null (developers è sempre [], nome è
// sempre stringa), nessun decimale, chiavi identiche fra scrittura e lettura.

const CHIAVE = 'gruppi';
const CHIAVE_FLAG = 'config-gruppi-attivi';
// Contatore monotono degli id: vedi prossimoId. Non azzerarlo mai.
const CHIAVE_SEQ = 'gruppi-seq';
// Etichetta della radice dell'albero, scelta dall'admin.
const CHIAVE_ORG = 'config-organizzazione';

// ---------------------------------------------------------------- feature flag

// Il flag NON blocca le funzioni di questo file: l'amministratore deve poter
// costruire i gruppi PRIMA di accenderli. A leggerlo saranno i consumatori
// (trigger, notifiche, area Team Leader), che finché è false continuano a usare
// membri.js/ruoli.js come oggi. Default false = flusso attuale intatto.
export const isGruppiAttivi = async () => {
  return await kvs.get(CHIAVE_FLAG) === true;
};

export const setGruppiAttivi = async (attivo) => {
  await kvs.set(CHIAVE_FLAG, attivo === true);
  return attivo === true;
};

// ------------------------------------------------------- nome organizzazione

// Etichetta della radice dell'albero.
//
// Stringa vuota = mai impostata: sta al chiamante decidere il ripiego (vedi
// getGruppiAdmin, che prova il sottodominio del sito). Non salviamo qui il
// default, altrimenti non sapremmo più distinguere "scelto dall'admin" da
// "calcolato da noi", e una correzione del calcolo non raggiungerebbe più
// chi ha il valore vecchio congelato in KVS.
export const getOrganizzazione = async () => {
  return await kvs.get(CHIAVE_ORG) || '';
};

export const setOrganizzazione = async (nome) => {
  const pulito = String(nome || '').trim();
  if (pulito === '') return { errore: 'Il nome dell\'organizzazione è obbligatorio.' };

  await kvs.set(CHIAVE_ORG, pulito);
  return { successo: true, organizzazione: pulito };
};

// ---------------------------------------------------------------------- letture

// Elenco piatto dei gruppi. Array vuoto su installazione nuova.
export const getGruppi = async () => {
  return await kvs.get(CHIAVE) || [];
};

export const getGruppo = async (id) => {
  const gruppi = await getGruppi();
  return gruppi.find((g) => g.id === id);
};

// Il gruppo di cui questa persona è developer (o undefined).
// Grazie all'invariante 1 il risultato è al massimo uno.
export const gruppoDelDeveloper = async (accountId) => {
  const gruppi = await getGruppi();
  return gruppi.find((g) => g.developers.includes(accountId));
};

// Il gruppo che questa persona guida come team leader (o undefined).
export const gruppoGuidatoDa = async (accountId) => {
  const gruppi = await getGruppi();
  return gruppi.find((g) => g.teamLeaderId === accountId);
};

// ------------------------------------------------------------------- helper

// Id progressivo con contatore PERSISTENTE (chiave a parte).
//
// Non si deriva da max(gruppi esistenti): con l'eliminazione attiva quel
// calcolo RIUSA gli id liberati — elimini g3 e il gruppo successivo si
// richiama g3. Oggi nessuna chiave KVS fuori da 'gruppi' referenzia un id di
// gruppo, ma le notifiche per gruppo e l'area Team Leader lo faranno: un
// riferimento vecchio finirebbe a puntare su un gruppo diverso.
//
// Il contatore non torna mai indietro. Il max() col valore derivato è la rete
// per le installazioni che avessero già gruppi creati prima di questa modifica.
const prossimoId = async (gruppi) => {
  const numeri = gruppi
    .map((g) => parseInt(String(g.id).replace('g', ''), 10))
    .filter((n) => Number.isInteger(n));
  const daiGruppi = numeri.length > 0 ? Math.max(...numeri) : 0;

  const salvato = await kvs.get(CHIAVE_SEQ);
  const prossimo = Math.max(Number.isInteger(salvato) ? salvato : 0, daiGruppi) + 1;

  await kvs.set(CHIAVE_SEQ, prossimo);
  return `g${prossimo}`;
};

// Risale la catena dei padri partendo da un gruppo e restituisce gli id
// incontrati, incluso quello di partenza. Il `visti.includes` non è teoria:
// se per un bug i dati in KVS contenessero già un ciclo, senza quel controllo
// questo while non terminerebbe mai e la funzione andrebbe in timeout.
const catenaAntenati = (gruppi, gruppoId) => {
  const visti = [];
  let corrente = gruppi.find((g) => g.id === gruppoId);

  while (corrente && !visti.includes(corrente.id)) {
    visti.push(corrente.id);
    corrente = gruppi.find((g) => g.developers.includes(corrente.teamLeaderId));
  }

  return visti;
};

// ------------------------------------------------------------------ scritture

// Crea un gruppo. Il team leader NON viene messo fra i suoi developers: guida il
// gruppo, non ne fa parte come membro. Comparirà fra i developers del gruppo
// PADRE, ed è esattamente così che si forma l'albero.
export const creaGruppo = async (nome, teamLeaderId) => {
  const nomePulito = String(nome || '').trim();
  if (nomePulito === '') return { errore: 'Il nome del gruppo è obbligatorio.' };
  if (!teamLeaderId) return { errore: 'Devi indicare un team leader.' };

  const gruppi = await getGruppi();

  // Una persona guida al massimo un gruppo: altrimenti "il TL che riceve le
  // notifiche di quel developer" non sarebbe più univoco.
  if (gruppi.some((g) => g.teamLeaderId === teamLeaderId)) {
    return { errore: 'Questa persona è già team leader di un altro gruppo.' };
  }

  const nuovo = {
    id: await prossimoId(gruppi),
    nome: nomePulito,
    teamLeaderId,
    developers: [],
  };

  const aggiornati = [...gruppi, nuovo];
  await kvs.set(CHIAVE, aggiornati);
  return { successo: true, gruppo: nuovo, gruppi: aggiornati };
};

export const rinominaGruppo = async (gruppoId, nome) => {
  const nomePulito = String(nome || '').trim();
  if (nomePulito === '') return { errore: 'Il nome del gruppo è obbligatorio.' };

  const gruppi = await getGruppi();
  const gruppo = gruppi.find((g) => g.id === gruppoId);
  if (!gruppo) return { errore: 'Gruppo non trovato.' };

  const aggiornati = gruppi.map((g) =>
    g.id === gruppoId ? { ...g, nome: nomePulito } : g
  );
  await kvs.set(CHIAVE, aggiornati);
  return { successo: true, gruppi: aggiornati };
};

// Aggiunge una persona come developer di un gruppo.
// Qui vivono le due validazioni bloccanti volute dall'handoff.
export const aggiungiDeveloper = async (gruppoId, accountId) => {
  const gruppi = await getGruppi();
  const gruppo = gruppi.find((g) => g.id === gruppoId);
  if (!gruppo) return { errore: 'Gruppo non trovato.' };
  if (!accountId) return { errore: 'Devi indicare una persona.' };

  if (gruppo.teamLeaderId === accountId) {
    return { errore: 'Il team leader non può essere developer del proprio gruppo.' };
  }

  // INVARIANTE 1 — un developer in un solo gruppo.
  const giaAltrove = gruppi.find((g) => g.developers.includes(accountId));
  if (giaAltrove) {
    return {
      errore: `Questa persona è già nel gruppo "${giaAltrove.nome}". ` +
              'Rimuovila da lì prima di spostarla.',
    };
  }

  // INVARIANTE 2 — niente cicli.
  // Se la persona guida un suo gruppo, aggiungerla qui rende quel gruppo figlio
  // di questo. È un ciclo se questo gruppo discende già da quello.
  const suoGruppo = gruppi.find((g) => g.teamLeaderId === accountId);
  if (suoGruppo && catenaAntenati(gruppi, gruppoId).includes(suoGruppo.id)) {
    return {
      errore: `Operazione non consentita: "${gruppo.nome}" si trova già sotto ` +
              `"${suoGruppo.nome}". Si creerebbe un ciclo.`,
    };
  }

  const aggiornati = gruppi.map((g) =>
    g.id === gruppoId ? { ...g, developers: [...g.developers, accountId] } : g
  );
  await kvs.set(CHIAVE, aggiornati);
  return { successo: true, gruppi: aggiornati };
};

// Rimuove un developer dal gruppo.
// Il lucchetto 🔒 dell'handoff: se questa persona guida un suo gruppo, toglierla
// dal padre staccherebbe l'intero sottoalbero rendendolo orfano. Lo blocchiamo.
export const rimuoviDeveloper = async (gruppoId, accountId) => {
  const gruppi = await getGruppi();
  const gruppo = gruppi.find((g) => g.id === gruppoId);
  if (!gruppo) return { errore: 'Gruppo non trovato.' };

  const suoGruppo = gruppi.find((g) => g.teamLeaderId === accountId);
  if (suoGruppo) {
    return {
      errore: `Non puoi rimuoverla: guida il gruppo "${suoGruppo.nome}". ` +
              'Sciogli o riassegna quel gruppo prima.',
    };
  }

  const aggiornati = gruppi.map((g) =>
    g.id === gruppoId
      ? { ...g, developers: g.developers.filter((d) => d !== accountId) }
      : g
  );
  await kvs.set(CHIAVE, aggiornati);
  return { successo: true, gruppi: aggiornati };
};

// Elimina un gruppo. Regole decise il 19/07 (chiude l'open point dell'handoff).
//
// Si eliminano SOLO le foglie, risalendo poi verso la radice. È una scelta
// deliberata contro la cancellazione a cascata: eliminare un padre non deve
// poter spazzare via rami che nessuno ha guardato in faccia.
//
// Cosa NON fa, di proposito: non cancella punti, badge o storico dei
// developers. Vivono su chiavi KVS separate e non sono legati al gruppo.
export const eliminaGruppo = async (gruppoId) => {
  const gruppi = await getGruppi();
  const gruppo = gruppi.find((g) => g.id === gruppoId);
  if (!gruppo) return { errore: 'Gruppo non trovato.' };

  // REGOLA 1 — con sotto-gruppi non si elimina.
  const figli = gruppi.filter((g) => gruppo.developers.includes(g.teamLeaderId));
  if (figli.length > 0) {
    return {
      errore: `"${gruppo.nome}" ha ${figli.length} sotto-gruppi ` +
              `(${figli.map((f) => f.nome).join(', ')}). ` +
              'Eliminali prima, partendo dai più bassi.',
    };
  }

  // Il team leader di questo gruppo resta developer del padre: l'array
  // developers del padre non lo tocchiamo. Semplicemente non guida più nulla,
  // e il lucchetto 🔒 che lo proteggeva cade da solo.
  const aggiornati = gruppi.filter((g) => g.id !== gruppoId);
  await kvs.set(CHIAVE, aggiornati);
  return { successo: true, gruppi: aggiornati };
};

// -------------------------------------------------------------- albero per la UI

// Versione annidata per il tree della pagina Configurazione gruppi.
// Radici = gruppi il cui team leader non è developer di nessun altro gruppo.
export const getAlberoGruppi = async () => {
  const gruppi = await getGruppi();

  const figliDi = (gruppo) =>
    gruppi.filter((g) => gruppo.developers.includes(g.teamLeaderId));

  const costruisci = (gruppo) => ({
    ...gruppo,
    figli: figliDi(gruppo).map(costruisci),
  });

  const radici = gruppi.filter(
    (g) => !gruppi.some((altro) => altro.developers.includes(g.teamLeaderId))
  );

  return radici.map(costruisci);
};
