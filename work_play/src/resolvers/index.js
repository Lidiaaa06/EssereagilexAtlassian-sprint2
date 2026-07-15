import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
import api, { route } from '@forge/api';
import { BADGES, getUserBadges, assignBadge, removeBadge } from './badges';
import { SFIDE, getSfideUtente, accettaSfida, completaSfida, pulisciSfideScadute, getPuntiBonus } from './sfide';
import { salvaValutazione, getPuntiValutazione, getValutazioniCongelate, confermaValutazione, rifiutaValutazione, getPuntiValutazioneConfig, setPuntiValutazioneConfig, getStatoValutazione } from './valutazione';
import { getPuntiStagione, getPuntiLegacy, getNumeroStagione, getGiorniRimanenti, controllaStagione, getStatoStagioneTestuale, getTicketStagione, getRiepilogoStagione, getCountdownNuovaStagione, getPuntiPerTicket, setPuntiPerTicket } from './stagione';
import { richiediHallOfFame, getRichiesteHallOfFame, approvaRichiesta, rifiutaRichiesta, getHallOfFame, toggleReaction, aggiungiCommento, eliminaCommento } from './halloffame';
import { aggiungiPensiero, getPensieri, toggleReactionPensiero, aggiungiCommentoPensiero, eliminaCommentoPensiero, eliminaPensiero, getStatoPensiero, resetLimiteGiornaliero } from './pensieri';
import { getRuolo, getRuoli, isSupervisore, assegnaRuolo } from './ruoli';
import { getSegnalazioni, marcaSegnalazioneVista } from './antifarming';
import { applicaCambioPosizione } from './classifica';

const TEAM = [
  { nome: "Roberto", accountId: "712020:a4ccdea1-0bb3-408f-9623-93c19691d980" },
  { nome: "Alessandro", accountId: "712020:48b975fc-daa2-4bc8-92dd-f8bf751a454a" },
  { nome: "Ludovica", accountId: "712020:c82776d1-c22b-4b85-ae3c-0110c541520f" },
  { nome: "Matthia", accountId: "712020:68180304-900d-4cbe-ad8e-73695ad5b96d" },
  { nome: "Lidia", accountId: "712020:5930294d-413c-434a-ae40-db82633bff30" },
];

const resolver = new Resolver();

// Calcola i punti totali delle sfide COMPLETATE di un utente.
// Estratto qui perché serve identico sia in getUserStats sia in getAdminData:
// tenerlo in un solo posto evita che le due viste mostrino numeri diversi.
const calcolaPuntiSfide = (sfideUtente) => {
  return sfideUtente
    .filter(s => s.completata)
    .reduce((acc, s) => {
      const sfida = SFIDE.find(sf => sf.key === s.key);
      // Il bonus si ottiene solo se l'utente ha scritto una descrizione
      const bonus = s.descrizione ? getPuntiBonus(s.tipo) : 0;
      return acc + (sfida ? sfida.punti + bonus : 0);
    }, 0);
};

const getBadge = (points) => {
  if (points >= 1000) return { name: 'Ticket Destroyer', emoji: '👹', next: null, nextPoints: null };
  if (points >= 600) return { name: 'Farmer', emoji: '👨‍🌾', next: 'Ticket Destroyer', nextPoints: 1000 };
  if (points >= 300) return { name: 'Master', emoji: '👨‍🏫', next: 'Farmer', nextPoints: 600 };
  if (points >= 150) return { name: 'Legend', emoji: '🐐', next: 'Master', nextPoints: 300 };
  if (points >= 100) return { name: 'Champion', emoji: '🏆', next: 'Legend', nextPoints: 150 };
  if (points >= 60) return { name: 'Expert', emoji: '🥇', next: 'Champion', nextPoints: 100 };
  if (points >= 30) return { name: 'Intermediate', emoji: '🥈', next: 'Expert', nextPoints: 60 };
  return { name: 'Rookie', emoji: '🥉', next: 'Intermediate', nextPoints: 30 };
};

resolver.define('getUserStats', async ({ context }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();

  await controllaStagione(TEAM);
  await pulisciSfideScadute(me.accountId);

  const ticketChiusi = await getTicketStagione(me.accountId);
  const puntiTicket = await getPuntiStagione(me.accountId);
  const puntiLegacy = await getPuntiLegacy(me.accountId);
  const numeroStagione = await getNumeroStagione();
  const giorniRimanenti = await getGiorniRimanenti();
  const statoStagione = await getStatoStagioneTestuale();
  const riepilogoStagione = await getRiepilogoStagione(me.accountId);
  const countdownNuovaStagione = await getCountdownNuovaStagione();

  const sfideUtente = await getSfideUtente(me.accountId);
  const puntiSfide = calcolaPuntiSfide(sfideUtente);

  const puntiValutazione = await getPuntiValutazione(me.accountId);
  const puntiTotali = puntiTicket + puntiSfide + puntiValutazione;
  const badge = getBadge(puntiTotali);
  const specialBadges = await getUserBadges(me.accountId);

  // Ruolo dell'utente corrente: 'supervisore' oppure 'operatore'.
  // Alla prima chiamata in assoluto, inizializzaRuoli() dentro ruoli.js
  // crea la chiave KVS 'ruoli' con Roberto supervisore e gli altri operatori.
  const ruolo = await getRuolo(me.accountId, TEAM);

  // Scorciatoia per i supervisori: quante segnalazioni antifarming sono ancora
  // da rivedere. Calcolato SOLO per i supervisori, così un operatore non riceve
  // (e non potrebbe dedurre) un dato che non gli compete. Per gli altri è null.
  let segnalazioniDaRivedere = null;
  if (ruolo === 'supervisore') {
    const segnalazioni = await getSegnalazioni();
    segnalazioniDaRivedere = segnalazioni.filter(s => !s.risolta).length;
  }

  return {
    nome: me.displayName,
    accountId: me.accountId,
    ruolo,
    segnalazioniDaRivedere,
    ticketChiusi,
    puntiTicket,
    puntiSfide,
    puntiValutazione,
    punti: puntiTotali,
    puntiLegacy,
    numeroStagione,
    giorniRimanenti,
    statoStagione,
    riepilogoStagione,
    countdownNuovaStagione,
    badge,
    specialBadges,
    allBadges: BADGES,
    sfideUtente,
    allSfide: SFIDE,
  };
});

resolver.define('accettaSfida', async ({ context, payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();
  return await accettaSfida(me.accountId, payload.sfidaKey);
});

resolver.define('completaSfida', async ({ context, payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();

  const sfida = SFIDE.find(s => s.key === payload.sfidaKey);
  const bonus = payload.descrizione ? getPuntiBonus(sfida.tipo) : 0;

  return await completaSfida(me.accountId, payload.sfidaKey, payload.descrizione);
});

resolver.define('valutaTicket', async ({ context, payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();
  // Non assegna punti: crea una valutazione congelata in attesa del supervisore.
  return await salvaValutazione(me.accountId, me.displayName, payload.issueKey, payload.risoluzione, payload.documentazione, payload.feedback);
});

// Stato della valutazione dell'utente corrente su un ticket (per il panel).
resolver.define('getStatoValutazione', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  return { stato: await getStatoValutazione(me.accountId, payload.issueKey) };
});

// Valutazioni in attesa di conferma (solo supervisore).
resolver.define('getValutazioniCongelate', async () => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  if (!await isSupervisore(me.accountId, TEAM)) return { errore: 'Non autorizzato' };
  return { valutazioni: await getValutazioniCongelate() };
});

// Conferma (eventualmente con scelte modificate dal supervisore) → applica i punti.
resolver.define('confermaValutazione', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  if (!await isSupervisore(me.accountId, TEAM)) return { errore: 'Non autorizzato' };
  return await confermaValutazione(payload.id, payload.risoluzione, payload.documentazione, payload.feedback);
});

// Rifiuta → nessun punto.
resolver.define('rifiutaValutazione', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  if (!await isSupervisore(me.accountId, TEAM)) return { errore: 'Non autorizzato' };
  return await rifiutaValutazione(payload.id);
});

// Griglia punteggi valutazione (valori reali). Lettura libera nell'admin.
resolver.define('getConfigValutazione', async () => {
  return { config: await getPuntiValutazioneConfig() };
});

// Salvataggio griglia punteggi valutazione (solo supervisore).
resolver.define('setConfigValutazione', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  if (!await isSupervisore(me.accountId, TEAM)) return { errore: 'Non autorizzato' };
  const config = await setPuntiValutazioneConfig(payload.config);
  return { successo: true, config };
});

resolver.define('getIssueStatus', async ({ context }) => {
  const issueKey = context.extension.issue.key;
  const response = await api.asUser().requestJira(
    route`/rest/api/3/issue/${issueKey}?fields=status`
  );
  const data = await response.json();
  const isDone = data.fields.status.statusCategory.key === 'done';
  return { isDone, issueKey };
});

const calcolaLivello = (punti) => {
  if (punti >= 100) return 5;
  if (punti >= 75) return 4;
  if (punti >= 50) return 3;
  if (punti >= 25) return 2;
  return 1;
};

resolver.define('getClassifica', async () => {
  const classifica = await Promise.all(
    TEAM.map(async (membro) => {
      const puntiTicket = await getPuntiStagione(membro.accountId);
      const ticketChiusi = await getTicketStagione(membro.accountId);
      const puntiValutazione = await getPuntiValutazione(membro.accountId);

      const sfideUtente = await getSfideUtente(membro.accountId);
      const puntiSfide = calcolaPuntiSfide(sfideUtente);
      const sfideCompletate = sfideUtente.filter(s => s.completata).length;

      // Stesso totale del gadget profilo: prima qui c'erano solo i punti ticket,
      // quindi classifica e profilo mostravano numeri diversi per la stessa persona.
      const puntiTotali = puntiTicket + puntiSfide + puntiValutazione;

      return {
        nome: membro.nome,
        accountId: membro.accountId,
        punti: puntiTotali,
        puntiTicket,
        puntiSfide,
        puntiValutazione,
        ticketChiusi,
        sfideCompletate,
        livello: calcolaLivello(puntiTotali),
      };
    })
  );

  classifica.sort((a, b) => b.punti - a.punti);

  // Il cambio posizione si calcola sull'array ORDINATO: prima serve sapere
  // chi è primo, secondo, terzo. Aggiorna anche lo snapshot se è un nuovo giorno.
  return await applicaCambioPosizione(classifica);
});

// L'operatore RICHIEDE l'inserimento: la voce resta in attesa di approvazione.
resolver.define('richiediHallOfFame', async ({ context, payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();

  const issueResponse = await api.asUser().requestJira(
    route`/rest/api/3/issue/${payload.issueKey}?fields=summary,description,assignee`
  );
  const issue = await issueResponse.json();

  const issueData = {
    titolo: issue.fields.summary,
    descrizione: issue.fields.description?.content?.[0]?.content?.[0]?.text || 'Nessuna descrizione',
    assignee: issue.fields.assignee?.displayName || 'Non assegnato',
    assigneeId: issue.fields.assignee?.accountId || null,
  };

  return await richiediHallOfFame(payload.issueKey, issueData, me.displayName);
});

// Elenco richieste in attesa (solo supervisore).
resolver.define('getRichiesteHallOfFame', async () => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  if (!await isSupervisore(me.accountId, TEAM)) return { errore: 'Non autorizzato' };
  return { richieste: await getRichiesteHallOfFame() };
});

// Approva una richiesta (solo supervisore).
resolver.define('approvaRichiestaHOF', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  if (!await isSupervisore(me.accountId, TEAM)) return { errore: 'Non autorizzato' };
  return await approvaRichiesta(payload.issueKey);
});

// Nega una richiesta (solo supervisore).
resolver.define('rifiutaRichiestaHOF', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  if (!await isSupervisore(me.accountId, TEAM)) return { errore: 'Non autorizzato' };
  return await rifiutaRichiesta(payload.issueKey);
});

resolver.define('getHallOfFame', async ({ context }) => {
  return await getHallOfFame();
});

resolver.define('toggleReaction', async ({ context, payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();
  return await toggleReaction(payload.issueKey, payload.reaction, me.accountId);
});

resolver.define('aggiungiCommento', async ({ context, payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();
  return await aggiungiCommento(payload.issueKey, payload.testo, me.displayName, me.accountId);
});

resolver.define('eliminaCommento', async ({ context, payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();
  return await eliminaCommento(payload.issueKey, payload.commentoId, me.accountId);
});

resolver.define('aggiungiPensiero', async ({ context, payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();
  return await aggiungiPensiero(payload.testo, me.displayName, me.accountId);
});

resolver.define('getPensieri', async ({ context }) => {
  return await getPensieri();
});

resolver.define('toggleReactionPensiero', async ({ context, payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();
  return await toggleReactionPensiero(payload.pensieroId, payload.reaction, me.accountId);
});

resolver.define('aggiungiCommentoPensiero', async ({ context, payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();
  return await aggiungiCommentoPensiero(payload.pensieroId, payload.testo, me.displayName, me.accountId);
});

resolver.define('eliminaCommentoPensiero', async ({ context, payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();
  return await eliminaCommentoPensiero(payload.pensieroId, payload.commentoId, me.accountId);
});

resolver.define('eliminaPensiero', async ({ context, payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();
  return await eliminaPensiero(payload.pensieroId, me.accountId);
});

resolver.define('getStatoPensiero', async ({ context }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();
  return await getStatoPensiero(me.accountId);
});


// ---------------------------------------------------------------------------
// ADMIN — sola lettura (step 2a)
// ---------------------------------------------------------------------------

// Restituisce i profili di TUTTI i membri del team, più il flag isSupervisore
// riferito a CHI sta chiamando (serve al frontend per decidere cosa mostrare).
resolver.define('getAdminData', async () => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();

  // Chi apre la pagina è supervisore? Da questo dipende l'accesso.
  const richiedenteSupervisore = await isSupervisore(me.accountId, TEAM);

  // Una sola lettura della mappa ruoli, invece di una getRuolo() per membro.
  const ruoli = await getRuoli(TEAM);

  const profili = await Promise.all(
    TEAM.map(async (membro) => {
      const puntiTicket = await getPuntiStagione(membro.accountId);
      const ticketChiusi = await getTicketStagione(membro.accountId);
      const puntiLegacy = await getPuntiLegacy(membro.accountId);
      const puntiValutazione = await getPuntiValutazione(membro.accountId);

      const sfideUtente = await getSfideUtente(membro.accountId);
      const puntiSfide = calcolaPuntiSfide(sfideUtente);

      // Stesso totale mostrato nel gadget profilo
      const puntiTotali = puntiTicket + puntiSfide + puntiValutazione;

      return {
        nome: membro.nome,
        accountId: membro.accountId,
        ruolo: ruoli[membro.accountId] || 'operatore',
        punti: puntiTotali,
        puntiLegacy,
        ticketChiusi,
        badge: getBadge(puntiTotali),
        specialBadges: await getUserBadges(membro.accountId),
      };
    })
  );

  return {
    isSupervisore: richiedenteSupervisore,
    profili,
    allBadges: BADGES,
  };
});


// Assegna un ruolo a un membro del team.
// Nessun controllo qui: assegnaRuolo() in ruoli.js verifica sia i permessi
// del richiedente sia il guardrail anti-lockout sull'ultimo supervisore.
resolver.define('assegnaRuolo', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();

  return await assegnaRuolo(
    me.accountId,
    payload.accountIdTarget,
    payload.nuovoRuolo,
    TEAM
  );
});


// Assegna un badge speciale a un membro del team.
// Il check permessi sta QUI e non in badges.js: assignBadge() deve restare
// utilizzabile anche da automatismi (es. un trigger che assegna Streak),
// dove non c'è nessun supervisore che effettua la richiesta.
resolver.define('assegnaBadge', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();

  if (!await isSupervisore(me.accountId, TEAM)) {
    return { errore: 'Non hai i permessi per assegnare badge' };
  }

  // Rifiuta key inventate: scriverebbero in KVS badge che la UI non sa mostrare
  if (!BADGES.find(b => b.key === payload.badgeKey)) {
    return { errore: 'Badge non valido' };
  }

  const badges = await assignBadge(payload.accountIdTarget, payload.badgeKey);
  return { successo: true, badges };
});

// Rimuove un badge speciale da un membro del team (solo supervisore).
resolver.define('rimuoviBadge', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();

  if (!await isSupervisore(me.accountId, TEAM)) {
    return { errore: 'Non hai i permessi per rimuovere badge' };
  }

  const badges = await removeBadge(payload.accountIdTarget, payload.badgeKey);
  return { successo: true, badges };
});


// ---------------------------------------------------------------------------
// ANTIFARMING — segnalazioni
// ---------------------------------------------------------------------------

// Elenco delle chiusure sospette, visibile solo al supervisore.
resolver.define('getSegnalazioni', async () => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();

  if (!await isSupervisore(me.accountId, TEAM)) {
    return { errore: 'Non hai i permessi per vedere le segnalazioni' };
  }

  return { segnalazioni: await getSegnalazioni() };
});

// Marca una segnalazione come vista. Non tocca i punti: la revoca,
// se servirà, sarà un'azione separata e volontaria del supervisore.
resolver.define('marcaSegnalazioneVista', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();

  if (!await isSupervisore(me.accountId, TEAM)) {
    return { errore: 'Non hai i permessi per gestire le segnalazioni' };
  }

  const segnalazioni = await marcaSegnalazioneVista(payload.segnalazioneId);
  return { successo: true, segnalazioni };
});


// ---------------------------------------------------------------------------
// CONFIG PUNTI — punti per ticket, modificabili dal supervisore
// ---------------------------------------------------------------------------

resolver.define('getConfigPunti', async () => {
  return { puntiPerTicket: await getPuntiPerTicket() };
});

resolver.define('setConfigPunti', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  if (!await isSupervisore(me.accountId, TEAM)) {
    return { errore: 'Non hai i permessi per modificare i punti' };
  }
  const val = await setPuntiPerTicket(payload.puntiPerTicket);
  return { successo: true, puntiPerTicket: val };
});

// ---------------------------------------------------------------------------
// CONFIG PUNTI AIUTO — punti per ogni aiuto segnalato, modificabili dal supervisore
// (stessa pagina WorkPlay Admin; i dati stanno nel blob KVS 'aiuto-dati')
// ---------------------------------------------------------------------------

resolver.define('getConfigAiuto', async () => {
  const d = await kvs.get('aiuto-dati');
  return { puntiPerAiuto: d?.config?.puntiPerAiuto ?? 10 };
});

resolver.define('setConfigAiuto', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  if (!await isSupervisore(me.accountId, TEAM)) {
    return { errore: 'Non hai i permessi per modificare i punti aiuto' };
  }
  const val = Number(payload.puntiPerAiuto);
  if (!Number.isFinite(val) || val < 0) {
    return { errore: 'Valore non valido: inserisci un numero >= 0.' };
  }
  const d = await kvs.get('aiuto-dati');
  await kvs.set('aiuto-dati', {
    config: { puntiPerAiuto: val },
    punti: d?.punti || {},
    storico: Array.isArray(d?.storico) ? d.storico : [],
  });
  return { successo: true, puntiPerAiuto: val };
});

export const handler = resolver.getDefinitions();