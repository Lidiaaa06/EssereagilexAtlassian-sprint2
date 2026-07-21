import Resolver from '@forge/resolver';
import api, { route, assumeTrustedRoute } from '@forge/api';
import { BADGES, getUserBadges, assignBadge, removeBadge } from './badges';
import { getSfideUtente, accettaSfida, completaSfida, pulisciSfideScadute, getPuntiBonus } from './sfide';
import { getTutteLeSfide, getSfideCustom, aggiungiSfidaCustom, rimuoviSfidaCustom } from './sfide-custom';
import { getCatalogo, getCategorie, aggiungiSfida, modificaSfida, eliminaSfida, setCategoria, ripristinaDefault } from './catalogo-sfide';
import { getStagioni, statoStagione as statoStagioneCal, creaStagione, modificaStagione, eliminaStagione } from './catalogo-stagioni';
import { getRegole, aggiungiRegola, modificaRegola, eliminaRegola, getTriggerCatalogo, modificaTrigger } from './regole-workflow';
import { eseguiDecanter, getUltimaEsecuzioneDecanter } from './decanter';
import { logAudit, getAuditLog, getEventiIssue } from './audit';
import { salvaValutazione, getPuntiValutazione } from './valutazione';
import { getPuntiStagione, getPuntiLegacy, getNumeroStagione, getGiorniRimanenti, controllaStagione, getStatoStagioneTestuale, getTicketStagione, getRiepilogoStagione, getCountdownNuovaStagione, getPuntiPerTicket, setPuntiPerTicket, getDatiCountdownStagione } from './stagione';
import { richiediHallOfFame, getRichiesteHallOfFame, approvaRichiesta, rifiutaRichiesta, getHallOfFame, toggleReaction, aggiungiCommento, eliminaCommento } from './halloffame';
import { aggiungiPensiero, getPensieri, toggleReactionPensiero, aggiungiCommentoPensiero, eliminaCommentoPensiero, eliminaPensiero, getStatoPensiero } from './pensieri';
import { getRuolo, getRuoli, isSupervisore, assegnaRuolo } from './ruoli';
import { getSegnalazioni, marcaSegnalazioneVista } from './antifarming';
import { applicaCambioPosizione } from './classifica';
import { getMembri, seedMembriSeVuoto, aggiungiMembro, rimuoviMembro } from './membri';
import { getAlberoGruppi, getGruppo, gruppoDelDeveloper, gruppoGuidatoDa, creaGruppo, rinominaGruppo, eliminaGruppo, aggiungiDeveloper, rimuoviDeveloper, isGruppiAttivi, setGruppiAttivi, getOrganizzazione, setOrganizzazione } from './gruppi';
import { segnalaAiuto, getClassificaAiuto, getAiutiTicket, getNumeroAiuti, getEventiAiutoTicket } from './aiuti';
import { reconcileGoldenTicket, redeemGoldenTicket, dismissGoldenTicketNotice, getSogliaGoldenTicket, setSogliaGoldenTicket, getMaxGoldenTicket, setMaxGoldenTicket, getPartenzaGoldenTicket, setPartenzaGoldenTicket, getGoldenTicketUsati } from './golden-ticket';

// Array legacy: fonte del seed una-tantum, NON più la verità del team.
// Vedi seedMembriSeVuoto in membri.js. Su installazioni nuove è inerte.
const TEAM_LEGACY = [
  { nome: "Roberto", accountId: "712020:a4ccdea1-0bb3-408f-9623-93c19691d980" },
  { nome: "Alessandro", accountId: "712020:48b975fc-daa2-4bc8-92dd-f8bf751a454a" },
  { nome: "Ludovica", accountId: "712020:c82776d1-c22b-4b85-ae3c-0110c541520f" },
  { nome: "Matthia", accountId: "712020:68180304-900d-4cbe-ad8e-73695ad5b96d" },
  { nome: "Lidia", accountId: "712020:5930294d-413c-434a-ae40-db82633bff30" },
];

const resolver = new Resolver();

// Helper Audit Log: una riga per registrare le azioni umane. Fail-safe (logAudit
// non lancia mai). `context.accountId` = chi ha fatto l'azione.
const auditConfig = (context, x) => logAudit({ y: 'config', a: context?.accountId, d: { x }, o: 'ok' });
const auditTl = (context, x, s) => logAudit({ y: 'tl', a: context?.accountId, s, d: { x }, o: 'ok' });

// Nome leggibile di un accountId per i dettagli dell'audit: prova i membri, poi
// Jira. Non lancia mai (ripiega sull'accountId). Serve a rendere i log dei
// gruppi comprensibili (chi, quale gruppo, quale team leader).
const nomeUtente = async (accountId) => {
  if (!accountId) return '—';
  try {
    const membri = await getMembri();
    const m = (membri || []).find((x) => x.accountId === accountId);
    if (m?.nome) return m.nome;
    const r = await api.asApp().requestJira(route`/rest/api/3/user?accountId=${accountId}`);
    if (r.ok) { const u = await r.json(); return u.displayName || accountId; }
  } catch (e) { /* ripiega sull'accountId */ }
  return accountId;
};

// Verifica se l'utente che sta chiamando è amministratore Jira del sito.
// Usa mypermissions con la global permission ADMINISTER: chiede "ho io questo
// permesso?", cosa che non richiede scope speciali (a differenza di controllare
// i permessi ALTRUI). Va sempre chiamata con api.asUser(): deve valutare chi ha
// aperto il pannello, non l'app.
//
// È il gate per la gestione dei membri: funziona anche a team vuoto, perché non
// dipende dal nostro stato interno (ruoli/membri) ma dai permessi Jira. Così su
// un'installazione nuova del marketplace l'admin che installa può sempre entrare.
const isAdminJira = async () => {
  try {
    const response = await api.asUser().requestJira(
      route`/rest/api/3/mypermissions?permissions=ADMINISTER`
    );
    if (!response.ok) return false;
    const data = await response.json();
    return data?.permissions?.ADMINISTER?.havePermission === true;
  } catch (e) {
    // In caso di errore rete/parsing neghiamo: meglio bloccare che aprire per sbaglio.
    console.log('[isAdminJira] errore nel controllo permessi:', e.message);
    return false;
  }
};

// Calcola i punti totali delle sfide COMPLETATE di un utente.
// Estratto qui perché serve identico sia in getUserStats sia in getAdminData:
// tenerlo in un solo posto evita che le due viste mostrino numeri diversi.
// `tutteLeSfide` NON ha più un default: il catalogo vive in KVS, quindi va
// letto e passato dal chiamante. Un default silenzioso qui significherebbe
// calcolare i punti su un elenco vuoto senza accorgersene.
const calcolaPuntiSfide = (sfideUtente, tutteLeSfide) => {
  return sfideUtente
    .filter(s => s.completata)
    .reduce((acc, s) => {
      const sfida = tutteLeSfide.find(sf => sf.key === s.key);
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

// Punti totali stagionali dell'operatore, come in classifica/profilo (ticket +
// sfide completate + valutazione). Serve al golden ticket per la soglia "earned".
const calcolaPuntiTotaliUtente = async (accountId) => {
  const puntiTicket = await getPuntiStagione(accountId);
  const sfideUtente = await getSfideUtente(accountId);
  const tutteLeSfide = await getTutteLeSfide();
  const puntiSfide = calcolaPuntiSfide(sfideUtente, tutteLeSfide);
  const puntiValutazione = await getPuntiValutazione(accountId);
  return puntiTicket + puntiSfide + puntiValutazione;
};

resolver.define('getUserStats', async ({ context }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();

  // Migrazione una-tantum dai dati legacy (inerte dopo il primo giro).
  await seedMembriSeVuoto(TEAM_LEGACY);

  await controllaStagione();
  await pulisciSfideScadute(me.accountId);

  const ticketChiusi = await getTicketStagione(me.accountId);
  const puntiTicket = await getPuntiStagione(me.accountId);
  const puntiLegacy = await getPuntiLegacy(me.accountId);
  const numeroStagione = await getNumeroStagione();
  const giorniRimanenti = await getGiorniRimanenti();
  const statoStagione = await getStatoStagioneTestuale();
  const riepilogoStagione = await getRiepilogoStagione(me.accountId);
  const countdownNuovaStagione = await getCountdownNuovaStagione();

  // Nome della stagione IN CORSO dal calendario (Season tab), non il numero
  // legacy: è quello che l'admin vede evidenziato (es. "3° trimestre '26").
  const stagioniCal = await getStagioni();
  const stagioneCorrente = stagioniCal.find((s) => statoStagioneCal(s, Date.now()) === 'corrente');
  const stagioneNome = stagioneCorrente?.nome || null;

  // Catalogo trigger (Trigger disponibili dell'admin): serve alla dashboard per
  // mostrare, in modo dinamico, da quali trigger sono composti i punti stagione.
  const triggerCatalogo = await getTriggerCatalogo();

  // Eventi-punto del developer nella stagione corrente, dall'Audit Log: servono
  // alla treeview della dashboard per espandere ogni nodo sui singoli work item
  // che hanno generato i punti (es. "WA-2 · +3"). Filtrati per questo utente.
  // Separati per tipo: i completamenti (punti) sotto "WorkItem Completato", le
  // segnalazioni Decanter (nessun punto) sotto "Work Item Decanter". Entrambi sono
  // y='trigger' nell'audit, quindi vanno distinti dal campo d.k.
  let eventiTrigger = [];
  let eventiDecanter = [];
  if (stagioneCorrente) {
    const log = await getAuditLog({
      from: new Date(stagioneCorrente.inizioMs).toISOString(),
      to: new Date().toISOString(),
      type: 'trigger',
      developer: me.accountId,
    });
    const entries = log.entries || [];
    eventiTrigger = entries
      .filter((e) => e.d?.k !== 'decanter')
      .map((e) => ({ t: e.t, issueKey: e.d?.i || '', punti: e.d?.p ?? 0 }));
    eventiDecanter = entries
      .filter((e) => e.d?.k === 'decanter')
      .map((e) => ({ t: e.t, issueKey: e.d?.i || '', stato: e.d?.st || '', durataMin: e.d?.gi ?? null, sogliaMin: e.d?.so ?? null }));

    // Icona del tipo + STATO CORRENTE del work item: UNA sola query (key in (...))
    // per TUTTE le chiavi. Lo stato è quello LIVE (al caricamento), non quello
    // congelato nell'audit: serve al nodo Decanter per mostrare se il work item è
    // ancora fermo o è avanzato. Non critico: in errore si omette.
    const chiavi = [...new Set([...eventiTrigger, ...eventiDecanter].map((e) => e.issueKey).filter(Boolean))].slice(0, 100);
    if (chiavi.length > 0) {
      try {
        const rIco = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jql: `key in (${chiavi.join(',')})`, maxResults: 100, fields: ['issuetype', 'status'] }),
        });
        if (rIco.ok) {
          const dIco = await rIco.json();
          const iconePer = {};
          const statoPer = {};
          (dIco.issues || []).forEach((it) => {
            iconePer[it.key] = it.fields?.issuetype?.iconUrl || '';
            statoPer[it.key] = { nome: it.fields?.status?.name || '', cat: it.fields?.status?.statusCategory?.key || '' };
          });
          eventiTrigger = eventiTrigger.map((e) => ({ ...e, ic: iconePer[e.issueKey] || '' }));
          eventiDecanter = eventiDecanter.map((e) => ({
            ...e,
            ic: iconePer[e.issueKey] || '',
            statoLive: statoPer[e.issueKey]?.nome || '',
            statoCat: statoPer[e.issueKey]?.cat || '',
          }));
        }
      } catch (e) { /* icone/stato non critici */ }
    }
  }

  const sfideUtente = await getSfideUtente(me.accountId);
  // Tutte le sfide (hardcoded + custom del supervisore): serve sia per il calcolo
  // punti sia per popolare allSfide, che il frontend usa per la lista disponibili.
  const tutteLeSfide = await getTutteLeSfide();
  const puntiSfide = calcolaPuntiSfide(sfideUtente, tutteLeSfide);

  const puntiValutazione = await getPuntiValutazione(me.accountId);
  const puntiTotali = puntiTicket + puntiSfide + puntiValutazione;
  const badge = getBadge(puntiTotali);
  const specialBadges = await getUserBadges(me.accountId);

  // Ruolo dell'utente corrente: 'supervisore' oppure 'operatore'.
  // Alla prima chiamata in assoluto, inizializzaRuoli() dentro ruoli.js
  // crea la chiave KVS 'ruoli' con Roberto supervisore e gli altri operatori.
  const ruolo = await getRuolo(me.accountId);

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
    avatarUrl: me.avatarUrls?.['48x48'] || '',
    ruolo,
    segnalazioniDaRivedere,
    ticketChiusi,
    puntiTicket,
    puntiSfide,
    puntiValutazione,
    punti: puntiTotali,
    puntiLegacy,
    numeroStagione,
    stagioneNome,
    triggerCatalogo,
    eventiTrigger,
    eventiDecanter,
    giorniRimanenti,
    statoStagione,
    riepilogoStagione,
    countdownNuovaStagione,
    badge,
    specialBadges,
    allBadges: BADGES,
    sfideUtente,
    allSfide: tutteLeSfide,
  };
});

resolver.define('accettaSfida', async ({ context, payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();
  // Passa tutte le sfide (incluse le custom) così accettaSfida riconosce
  // anche le key custom-* e ne legge tipo/limiti correttamente.
  const tutteLeSfide = await getTutteLeSfide();
  return await accettaSfida(me.accountId, payload.sfidaKey, tutteLeSfide);
});

resolver.define('completaSfida', async ({ context, payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();

  // Nota: completaSfida non ricalcola i punti qui (lo fa getUserStats leggendo
  // le sfide completate). Il vecchio calcolo di 'bonus' era codice morto e
  // andava in crash su key custom non trovate, quindi è stato rimosso.
  return await completaSfida(me.accountId, payload.sfidaKey, payload.descrizione);
});

resolver.define('valutaTicket', async ({ context, payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();
  return await salvaValutazione(me.accountId, payload.risoluzione, payload.documentazione, payload.feedback);
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
  const membri = await getMembri();
  const tutteLeSfide = await getTutteLeSfide();
  const classifica = await Promise.all(
    membri.map(async (membro) => {
      const puntiTicket = await getPuntiStagione(membro.accountId);
      const ticketChiusi = await getTicketStagione(membro.accountId);
      const puntiValutazione = await getPuntiValutazione(membro.accountId);

      const sfideUtente = await getSfideUtente(membro.accountId);
      const puntiSfide = calcolaPuntiSfide(sfideUtente, tutteLeSfide);
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

// Team Leaderboard: la classifica del PROPRIO team (gruppo), non quella globale.
// Decisione 20/07 (mockup 6-83): ogni team gioca la sua classifica; i developer
// che fanno capo ad altri Team Leader non compaiono. Il Team Leader vede il team
// che GUIDA e NON è fra le righe (è classificato nel gruppo padre, di cui è
// developer). Chi non è in nessun gruppo → team: null (stato vuoto lato frontend).
resolver.define('getTeamLeaderboard', async ({ context }) => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();

  // Contesto stagione (come la dashboard): nome dal calendario + giorni al reset.
  // Calcolato PRIMA del controllo team, così anche lo stato vuoto mostra stagione
  // e countdown corretti.
  const giorniRimanenti = await getGiorniRimanenti();
  const stagioniCal = await getStagioni();
  const stagioneCorrente = stagioniCal.find((s) => statoStagioneCal(s, Date.now()) === 'corrente');
  const stagioneNome = stagioneCorrente?.nome || null;

  // Il "mio team": il gruppo di cui sono developer; se non lo sono ma guido un
  // gruppo, quello. Un developer sta in UN SOLO gruppo (invariante di gruppi.js).
  let gruppo = await gruppoDelDeveloper(me.accountId);
  if (!gruppo) gruppo = await gruppoGuidatoDa(me.accountId);
  if (!gruppo) return { team: null, stagioneNome, giorniRimanenti };

  const tutteLeSfide = await getTutteLeSfide();

  // Nome visualizzato E avatar di tutti (developer + team leader) in UNA bulk,
  // come fa l'admin: stessa interfaccia, e una sola chiamata invece di N.
  const info = await risolviNomi([...gruppo.developers, gruppo.teamLeaderId]);

  // Una riga per developer del gruppo. Punti = stesso totale del profilo e di
  // getClassifica (ticket + sfide + valutazione); più i conteggi Task e Sfide del
  // mockup e i punti-aiuto (pool separato) per il secondo tab.
  const righeBase = await Promise.all(
    gruppo.developers.map(async (accountId) => {
      const puntiTicket = await getPuntiStagione(accountId);
      const ticketChiusi = await getTicketStagione(accountId);
      const puntiValutazione = await getPuntiValutazione(accountId);
      const sfideUtente = await getSfideUtente(accountId);
      const puntiSfide = calcolaPuntiSfide(sfideUtente, tutteLeSfide);
      const sfideCompletate = sfideUtente.filter((s) => s.completata).length;
      return {
        accountId,
        nome: info[accountId]?.nome || accountId,
        avatar: info[accountId]?.avatar || '',
        sonoIo: accountId === me.accountId,
        punti: puntiTicket + puntiSfide + puntiValutazione,
        task: ticketChiusi,
        sfide: sfideCompletate,
        aiuti: await getNumeroAiuti(accountId),
      };
    })
  );

  // XP: ordina per punti e applica il "Cambio" con snapshot PER-GRUPPO, altrimenti
  // team diversi si sovrascriverebbero a vicenda la fotografia di ieri.
  const righeXp = [...righeBase].sort((a, b) => b.punti - a.punti);
  const righe = await applicaCambioPosizione(righeXp, `classifica-team-${gruppo.id}`);

  // Aiuti del team: stessa tabella, pool separato, snapshot a parte.
  const righeOrdAiuti = [...righeBase].sort((a, b) => b.aiuti - a.aiuti);
  const righeAiuti = await applicaCambioPosizione(righeOrdAiuti, `classifica-team-aiuti-${gruppo.id}`);

  return {
    team: {
      id: gruppo.id,
      nome: gruppo.nome,
      teamLeader: info[gruppo.teamLeaderId]?.nome || gruppo.teamLeaderId,
      teamLeaderAvatar: info[gruppo.teamLeaderId]?.avatar || '',
      numeroDeveloper: gruppo.developers.length,
    },
    ioAccountId: me.accountId,
    stagioneNome,
    giorniRimanenti,
    righe,
    righeAiuti,
  };
});

// Attività WorkPlay di UNA issue: i trigger (punti +/-) che l'hanno coinvolta,
// per il pannello `jira:issueActivity`. Così si verificano dalla history della
// issue, non solo dall'Audit Log. issueKey arriva dal contesto del modulo issue.
resolver.define('getWorkplayActivity', async ({ payload, context }) => {
  const issueKey = payload?.issueKey || context?.extension?.issue?.key;
  if (!issueKey) return { issueKey: null, eventi: [] };

  // 1) Eventi dall'audit: trigger (completamento/riapertura) + decanter.
  const grezzi = await getEventiIssue(issueKey);
  const eventiAudit = grezzi.map((e) => ({
    t: e.t,
    // Tipo: dal campo k (nuovi eventi); per i vecchi si deduce dal segno dei punti.
    tipo: e.d?.k || (typeof e.d?.p === 'number' ? (e.d.p >= 0 ? 'completato' : 'riapertura') : 'evento'),
    accountId: e.s || null,
    punti: typeof e.d?.p === 'number' ? e.d.p : null,
    stato: e.d?.st || '',
    progetto: e.d?.pr || '',
    flags: Array.isArray(e.d?.f) ? e.d.f : [],
    durataMin: typeof e.d?.gi === 'number' ? e.d.gi : null,  // decanter: minuti fermo
    sogliaMin: typeof e.d?.so === 'number' ? e.d.so : null,  // decanter: soglia in minuti
  }));

  // 2) Eventi di feedback/aiuto (pool separato): ognuno vale +1 punto-aiuto.
  const aiuti = await getEventiAiutoTicket(issueKey);
  const eventiFeedback = aiuti.map((a) => ({
    t: new Date(a.data || 0).toISOString(),
    tipo: 'feedback',
    accountId: a.collegaId,          // chi ha ricevuto l'aiuto → avatar/nome
    punti: 1,
    segnalatoreId: a.segnalatoreId,  // chi ha dato il feedback → "Da …"
    descrizione: a.descrizione || '',
  }));

  // 3) Un'unica cronologia, dal più recente.
  const eventi = [...eventiAudit, ...eventiFeedback].sort((x, y) => (x.t < y.t ? 1 : x.t > y.t ? -1 : 0));

  // 4) Nomi + avatar (bulk) di TUTTI gli accountId coinvolti (protagonista + "da").
  const ids = [...new Set(eventi.flatMap((e) => [e.accountId, e.segnalatoreId]).filter(Boolean))];
  const info = ids.length ? await risolviNomi(ids) : {};
  const eventiRis = eventi.map((e) => ({
    ...e,
    nome: info[e.accountId]?.nome || e.accountId || 'Sistema',
    avatar: info[e.accountId]?.avatar || '',
    daNome: e.segnalatoreId ? (info[e.segnalatoreId]?.nome || e.segnalatoreId) : null,
  }));

  // 5) Riepilogo per il banner: punti totali generati, developer distinti, n. eventi.
  const totalePunti = eventiRis.reduce((s, e) => s + (typeof e.punti === 'number' ? e.punti : 0), 0);
  const numeroDeveloper = new Set(eventiRis.map((e) => e.accountId).filter(Boolean)).size;

  return {
    issueKey,
    riepilogo: { totalePunti, numeroDeveloper, numeroEventi: eventiRis.length },
    eventi: eventiRis,
  };
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
  if (!await isSupervisore(me.accountId)) return { errore: 'Non autorizzato' };
  return { richieste: await getRichiesteHallOfFame() };
});

// Approva una richiesta (solo supervisore).
resolver.define('approvaRichiestaHOF', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  if (!await isSupervisore(me.accountId)) return { errore: 'Non autorizzato' };
  const esito = await approvaRichiesta(payload.issueKey);
  if (!esito?.errore) await auditTl({ accountId: me.accountId }, `Hall of Fame approvata: ${payload.issueKey}`);
  return esito;
});

// Nega una richiesta (solo supervisore).
resolver.define('rifiutaRichiestaHOF', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  if (!await isSupervisore(me.accountId)) return { errore: 'Non autorizzato' };
  const esito = await rifiutaRichiesta(payload.issueKey);
  if (!esito?.errore) await auditTl({ accountId: me.accountId }, `Hall of Fame rifiutata: ${payload.issueKey}`);
  return esito;
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

  // Chi apre la pagina è supervisore? Da questo dipende l'accesso alle funzioni
  // interne (ruoli, badge, segnalazioni).
  const richiedenteSupervisore = await isSupervisore(me.accountId);

  // È amministratore Jira? Da questo dipende l'accesso alla GESTIONE MEMBRI.
  // Separato dal ruolo interno di proposito: su installazione nuova a team vuoto
  // nessuno è supervisore, ma l'admin Jira deve poter aggiungere il primo membro.
  const richiedenteAdminJira = await isAdminJira();

  // Una sola lettura della mappa ruoli, invece di una getRuolo() per membro.
  const ruoli = await getRuoli();

  const membri = await getMembri();
  const tutteLeSfide = await getTutteLeSfide();
  const profili = await Promise.all(
    membri.map(async (membro) => {
      const puntiTicket = await getPuntiStagione(membro.accountId);
      const ticketChiusi = await getTicketStagione(membro.accountId);
      const puntiLegacy = await getPuntiLegacy(membro.accountId);
      const puntiValutazione = await getPuntiValutazione(membro.accountId);

      const sfideUtente = await getSfideUtente(membro.accountId);
      const puntiSfide = calcolaPuntiSfide(sfideUtente, tutteLeSfide);

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
    isAdminJira: richiedenteAdminJira,
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
    payload.nuovoRuolo
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

  if (!await isSupervisore(me.accountId)) {
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

  if (!await isSupervisore(me.accountId)) {
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

  if (!await isSupervisore(me.accountId)) {
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

  if (!await isSupervisore(me.accountId)) {
    return { errore: 'Non hai i permessi per gestire le segnalazioni' };
  }

  const segnalazioni = await marcaSegnalazioneVista(payload.segnalazioneId);
  return { successo: true, segnalazioni };
});


// ---------------------------------------------------------------------------
// GESTIONE MEMBRI (tappa 3+4) — gate: amministratore Jira
// ---------------------------------------------------------------------------

// Aggiunge un membro al team a partire dal solo accountId.
// Il backend valida l'id contro Jira e ne ricava il nome vero: così non entrano
// id inventati (che non comparirebbero mai in classifica) né nomi digitati male.
resolver.define('aggiungiMembroAdmin', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire i membri' };
  }

  const accountId = (payload.accountId || '').trim();
  if (!accountId) {
    return { errore: 'Inserisci un accountId' };
  }

  // Validazione + recupero nome: se l'id non esiste sul sito, Jira risponde 404.
  const userResponse = await api.asUser().requestJira(
    route`/rest/api/3/user?accountId=${accountId}`
  );

  if (!userResponse.ok) {
    return { errore: 'accountId non valido o utente non trovato su questo sito' };
  }

  const utente = await userResponse.json();

  // Un utente disattivato non ha senso in una classifica: lo segnaliamo.
  if (utente.active === false) {
    return { errore: `${utente.displayName} è un utente disattivato` };
  }

  const membri = await aggiungiMembro(accountId, utente.displayName);
  await auditConfig(context, `membro aggiunto: ${utente.displayName}`);
  return { successo: true, nome: utente.displayName, membri };
});

// Rimuove un membro dal team. Non cancella i suoi punti/badge/ruolo: toglie solo
// dall'elenco (vedi nota in membri.js). La cancellazione dei dati è separata.
resolver.define('rimuoviMembroAdmin', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire i membri' };
  }

  const membri = await rimuoviMembro(payload.accountId);
  await auditConfig(context, `membro rimosso: ${payload.accountId}`);
  return { successo: true, membri };
});


// ---------------------------------------------------------------------------
// SFIDE CUSTOM (gestite dal supervisore, nel pannello admin)
// ---------------------------------------------------------------------------

// Crea una sfida personalizzata. Gate: supervisore.
resolver.define('aggiungiSfidaAdmin', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();

  if (!await isSupervisore(me.accountId)) {
    return { errore: 'Solo un supervisore può creare sfide' };
  }

  return await aggiungiSfidaCustom({
    nome: payload.nome,
    emoji: payload.emoji,
    tipo: payload.tipo,
    descrizione: payload.descrizione,
  });
});

// Rimuove una sfida personalizzata. Gate: supervisore.
// Non tocca le sfide già accettate dagli utenti né i punti già guadagnati.
resolver.define('rimuoviSfidaAdmin', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();

  if (!await isSupervisore(me.accountId)) {
    return { errore: 'Solo un supervisore può rimuovere sfide' };
  }

  return await rimuoviSfidaCustom(payload.key);
});

// Elenco delle sole sfide custom, per la gestione nel pannello admin.
resolver.define('getSfideCustom', async () => {
  const meResponse = await api.asUser().requestJira(
    route`/rest/api/3/myself`
  );
  const me = await meResponse.json();

  if (!await isSupervisore(me.accountId)) {
    return { errore: 'Non hai i permessi', sfideCustom: [] };
  }

  return { sfideCustom: await getSfideCustom() };
});


// ---------------------------------------------------------------------------
// CONFIG PUNTI — punti per ticket, modificabili dal supervisore
// ---------------------------------------------------------------------------

// Lettura libera: serve al pannello admin per popolare il campo. Nessun dato
// sensibile, quindi niente gate qui.
resolver.define('getConfigPunti', async () => {
  return { puntiPerTicket: await getPuntiPerTicket() };
});

// Config di Settings: gate su AMMINISTRATORE JIRA (come tutti i valori di questa
// pagina). Il valore vale dal prossimo evento del trigger. In futuro il TeamLeader
// avrà un Settings ridotto con permessi propri.
resolver.define('setConfigPunti', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può modificare i punti' };
  }
  const val = await setPuntiPerTicket(payload.puntiPerTicket);
  await auditConfig(context, `punteggio work item → ${val}`);
  return { successo: true, puntiPerTicket: val };
});


// ---------------------------------------------------------------------------
// AIUTI — segnalazione aiuto tra colleghi + classifica aiuti (pool separato)
// ---------------------------------------------------------------------------

// L'utente corrente segnala un collega che lo ha aiutato su un ticket.
// Il segnalatore è chi chiama (asUser), non un dato inviato dal client.
resolver.define('segnalaAiuto', async ({ payload }) => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  return await segnalaAiuto(me.accountId, payload.collegaId, payload.collegaNome, payload.issueKey, payload.descrizione);
});

// Elenco degli aiuti segnalati su una specifica issue (per il pannello).
resolver.define('getAiutiTicket', async ({ payload }) => {
  return await getAiutiTicket(payload.issueKey);
});

// Classifica aiuti del team (pool separato dai punti stagione).
resolver.define('getClassificaAiuto', async () => {
  return await getClassificaAiuto();
});

// Dati per il menu a tendina "Segnala aiuto": elenco membri + il mio accountId,
// così il frontend esclude me stesso senza TEAM hardcoded.
resolver.define('getMembriPerAiuto', async () => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  return { membri: await getMembri(), mioAccountId: me.accountId };
});


// ---------------------------------------------------------------------------
// STAGIONE — dati per il countdown live nell'hub
// ---------------------------------------------------------------------------

// Lettura libera: solo date/numero stagione, nessun dato sensibile.
resolver.define('getDatiStagioneCountdown', async () => {
  return await getDatiCountdownStagione();
});


// ---------------------------------------------------------------------------
// GOLDEN TICKET — grant mensili + "guadagnato", uso su issue (label + commento)
// ---------------------------------------------------------------------------

resolver.define('getGoldenTicketState', async () => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  const puntiTotali = await calcolaPuntiTotaliUtente(me.accountId);
  const { rec, soglia, numeroStagione } = await reconcileGoldenTicket(me.accountId, puntiTotali);
  return {
    balance: rec.balance,
    grants: rec.grants,
    seasonId: numeroStagione,
    pendingNotice: !!rec.pendingNotice,
    soglia,
  };
});

resolver.define('redeemGoldenTicket', async ({ context }) => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  // issueKey dal context, non dal client (come getIssueStatus).
  const issueKey = context.extension?.issue?.key;
  const puntiTotali = await calcolaPuntiTotaliUtente(me.accountId);
  return await redeemGoldenTicket(me.accountId, me.displayName, issueKey, puntiTotali);
});

// Elenco dei golden ticket usati (solo supervisore) — notifica interna affidabile.
resolver.define('getGoldenTicketUsati', async () => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  if (!await isSupervisore(me.accountId)) return { errore: 'Non autorizzato', usati: [] };
  return { usati: await getGoldenTicketUsati() };
});

resolver.define('dismissGoldenTicketNotice', async () => {
  const meResponse = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const me = await meResponse.json();
  return await dismissGoldenTicketNotice(me.accountId);
});

// Lettura libera della config (serve al pannello admin per popolare i campi).
resolver.define('getConfigGoldenTicket', async () => {
  return {
    soglia: await getSogliaGoldenTicket(),
    max: await getMaxGoldenTicket(),
    partenza: await getPartenzaGoldenTicket(),
  };
});

// Config di Settings: gate su amministratore Jira. I setter validano i valori e
// lanciano in caso di input non valido (es. max < 1): lo trasformiamo in { errore }.
resolver.define('setConfigGoldenTicket', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può modificare la configurazione' };
  }
  try {
    const soglia = await setSogliaGoldenTicket(payload.soglia);
    const max = await setMaxGoldenTicket(payload.max);
    const partenza = await setPartenzaGoldenTicket(payload.partenza);
    await auditConfig(context, `golden workitem: soglia ${soglia} · max ${max} · partenza ${partenza}`);
    return { successo: true, soglia, max, partenza };
  } catch (e) {
    return { errore: e.message };
  }
});

// ---------------------------------------------------------------------------
// GRUPPI (pagina admin "Configurazione gruppi" — decisioni del 18/07)
//
// Gate: isAdminJira su TUTTE le define, anche quelle in lettura. La pagina è
// sotto Impostazioni Jira e l'handoff la assegna alla persona Administrator,
// non al Team Leader: chi non è admin non deve nemmeno vedere l'organigramma.
//
// Nessuna define per l'eliminazione: è un open point aperto (vedi gruppi.js).
// ---------------------------------------------------------------------------

// Valida un accountId contro Jira e ne ricava il nome vero.
// Serve ANCHE ora che la UI usa un picker: il frontend può inviare qualunque
// stringa, quindi la verifica lato server non è ridondante.
const validaUtenteJira = async (accountId) => {
  const id = (accountId || '').trim();
  if (!id) return { errore: 'Devi indicare una persona' };

  const response = await api.asUser().requestJira(
    route`/rest/api/3/user?accountId=${id}`
  );
  if (!response.ok) {
    return { errore: 'accountId non valido o utente non trovato su questo sito' };
  }

  const utente = await response.json();
  if (utente.active === false) {
    return { errore: `${utente.displayName} è un utente disattivato` };
  }

  return { accountId: id, nome: utente.displayName };
};

// Ricerca utenti Jira per il picker: è ciò che sostituisce il campo accountId.
//
// /rest/api/3/user/search cerca su nome e email e restituisce l'accountId, che
// resta la chiave vera salvata in KVS — semplicemente l'admin non lo vede più.
//
// I due filtri NON sono cosmetici: senza accountType==='atlassian' nel picker
// finiscono i bot delle app e gli account cliente del portale JSM, e senza
// active !== false compaiono utenti disattivati che non chiuderanno mai un ticket.
resolver.define('cercaUtentiJira', async ({ payload }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può cercare utenti' };
  }

  const query = (payload.query || '').trim();
  // Soglia minima: ogni tasto premuto è un invoke + una chiamata REST a Jira.
  if (query.length < 2) return { successo: true, utenti: [] };

  const response = await api.asUser().requestJira(
    route`/rest/api/3/user/search?query=${query}&maxResults=20`
  );
  if (!response.ok) {
    return { errore: 'Ricerca utenti non riuscita' };
  }

  const utenti = (await response.json())
    .filter((u) => u.accountType === 'atlassian' && u.active !== false)
    .map((u) => ({
      accountId: u.accountId,
      nome: u.displayName,
      avatar: u.avatarUrls?.['24x24'] || '',
    }));

  return { successo: true, utenti };
});

// Risolve nome visualizzato E avatar di una lista di accountId.
//
// L'avatar non costa nulla in più: arriva nella stessa risposta bulk. E non
// serve alcun permesso di egress — la CSP che Atlassian applica ai nostri
// iframe include già il dominio degli avatar fra le img-src consentite
// (verificato sull'header della pagina, x-amz-meta-csp img-src è vuoto).
//
// L'EMAIL invece NON è qui di proposito: richiederebbe lo scope
// read:email-address:jira, che scavalca le impostazioni di privacy di chi ha
// scelto di nascondere la propria mail. Decisione del 19/07: non lo aggiungiamo.
//
// Usa l'endpoint BULK: una sola richiesta per un intero albero, invece di una
// per persona. La versione precedente pescava i nomi da getMembri() e chiunque
// non fosse ancora membro di WorkPlay compariva nell'albero come accountId
// grezzo — cosa che succede sempre, dato che i gruppi servono proprio a
// censire persone non ancora nel sistema.
//
// I chunk da 100 stanno sotto il limite dell'endpoint (200 per chiamata) e
// tengono corta la query string anche con organizzazioni grandi.
const risolviNomi = async (accountIds) => {
  const unici = [...new Set(accountIds.filter(Boolean))];
  const nomi = {};

  for (let i = 0; i < unici.length; i += 100) {
    const blocco = unici.slice(i, i + 100);
    // route` ` codificherebbe anche & e =, spezzando i parametri ripetuti:
    // qui l'URL lo componiamo noi, codificando ogni singolo id.
    const query = blocco
      .map((id) => `accountId=${encodeURIComponent(id)}`)
      .join('&');

    try {
      const risposta = await api.asUser().requestJira(
        assumeTrustedRoute(`/rest/api/3/user/bulk?maxResults=100&${query}`)
      );
      if (!risposta.ok) continue;

      const dati = await risposta.json();
      (dati.values || []).forEach((u) => {
        if (!u.accountId || !u.displayName) return;
        nomi[u.accountId] = {
          nome: u.displayName,
          // 24px è la dimensione che serve alla lista; se manca, il frontend
          // ripiega sulle iniziali invece di mostrare un'immagine rotta.
          avatar: u.avatarUrls?.['24x24'] || '',
        };
      });
    } catch (e) {
      // Un blocco fallito non deve far fallire la pagina: quelle persone
      // ricadranno sull'accountId, le altre restano leggibili.
      console.log('[risolviNomi] blocco non risolto:', e.message);
    }
  }

  return nomi;
};

// Risposta standard di OGNI operazione sui gruppi: albero + nomi aggiornati.
//
// Il dizionario va rispedito a ogni scrittura, non solo al caricamento. Se una
// scrittura restituisse il solo albero, la UI lo aggiornerebbe tenendosi il
// dizionario vecchio: la persona appena aggiunta comparirebbe come accountId
// grezzo fino al reload successivo. È un bug che abbiamo già visto due volte.
const rispostaGruppi = async () => {
  const albero = await getAlberoGruppi();

  // Raccoglie ogni accountId che comparirà a schermo: team leader e developers,
  // a ogni livello. Una sola visita dell'albero, una sola chiamata a Jira.
  const daRisolvere = [];
  const visita = (gruppo) => {
    daRisolvere.push(gruppo.teamLeaderId, ...gruppo.developers);
    gruppo.figli.forEach(visita);
  };
  albero.forEach(visita);

  return { albero, persone: await risolviNomi(daRisolvere) };
};

// Albero dei gruppi + dizionario dei nomi per la UI.
// I gruppi salvano SOLO accountId: i nomi si risolvono qui, al volo.
resolver.define('getGruppiAdmin', async () => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire i gruppi' };
  }

  const { albero, persone } = await rispostaGruppi();

  // I membri restano come rete: se una persona è stata rimossa da Jira il bulk
  // non la restituisce, ma il nome storico ce l'abbiamo ancora qui. Senza
  // avatar, ovviamente: quello vive solo su Jira.
  const membri = await getMembri();
  membri.forEach((m) => {
    if (!persone[m.accountId]) persone[m.accountId] = { nome: m.nome, avatar: '' };
  });

  // Etichetta della radice, in ordine di preferenza:
  //   1. quella scelta dall'admin  → l'unica che sa la grafia giusta
  //   2. il sottodominio del sito  → "essereagile.atlassian.net" → "essereagile"
  //   3. 'Organizzazione'          → la pagina si apre comunque
  //
  // serverInfo.serverTitle NON si usa più: su questo sito restituiva "Jira",
  // cioè il nome del prodotto invece dell'organizzazione. È il default di
  // fabbrica che quasi nessuno cambia, quindi come fonte è inaffidabile.
  let organizzazione = await getOrganizzazione();

  if (organizzazione === '') {
    organizzazione = 'Organizzazione';
    try {
      const info = await api.asUser().requestJira(route`/rest/api/3/serverInfo`);
      if (info.ok) {
        const dati = await info.json();
        const sottodominio = String(dati.baseUrl || '')
          .replace(/^https?:\/\//, '')
          .split('.')[0];
        if (sottodominio) organizzazione = sottodominio;
      }
    } catch (e) {
      console.log('[getGruppiAdmin] serverInfo non disponibile:', e.message);
    }
  }

  return {
    successo: true,
    albero,
    persone,
    organizzazione,
    attivi: await isGruppiAttivi(),
  };
});

// Rinomina l'organizzazione, cioè l'etichetta della radice dell'albero.
resolver.define('setOrganizzazioneAdmin', async ({ payload }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire i gruppi' };
  }

  return await setOrganizzazione(payload.nome);
});

// Creazione completa dalla modale: nome + team leader + N developers in UNA
// chiamata. Senza questa, la UI dovrebbe fare creaGruppo + N aggiungiDeveloper
// e un fallimento a metà lascerebbe un gruppo creato solo in parte.
//
// I developers NON sono atomici fra loro di proposito: se uno solo è già in un
// altro gruppo, gli altri entrano lo stesso e restituiamo l'elenco degli scarti.
// Annullare tutto per un singolo scarto costringerebbe l'admin a ricompilare
// l'intera modale, che è peggio.
resolver.define('creaGruppoCompletoAdmin', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire i gruppi' };
  }

  const teamLeader = await validaUtenteJira(payload.teamLeaderId);
  if (teamLeader.errore) return { errore: teamLeader.errore };

  const esito = await creaGruppo(payload.nome, teamLeader.accountId);
  if (esito.errore) return esito;

  // Il gruppo ora esiste: da qui in poi gli errori sono parziali, non bloccanti.
  const scartati = [];
  for (const accountId of payload.developers || []) {
    const utente = await validaUtenteJira(accountId);
    if (utente.errore) {
      scartati.push({ accountId, motivo: utente.errore });
      continue;
    }

    const aggiunta = await aggiungiDeveloper(esito.gruppo.id, utente.accountId);
    if (aggiunta.errore) {
      scartati.push({ nome: utente.nome, motivo: aggiunta.errore });
    }
  }

  const tlCreato = await nomeUtente(teamLeader.accountId);
  const nDev = (payload.developers || []).length - scartati.length;
  await auditConfig(context, `gruppo creato: "${payload.nome}" (TL: ${tlCreato}, ${nDev} developer)`);
  return {
    successo: true,
    gruppo: esito.gruppo,
    scartati,
    ...(await rispostaGruppi()),
  };
});

resolver.define('rinominaGruppoAdmin', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire i gruppi' };
  }

  const prima = await getGruppo(payload.gruppoId);
  const esito = await rinominaGruppo(payload.gruppoId, payload.nome);
  if (esito.errore) return esito;

  await auditConfig(context, `gruppo rinominato: "${prima?.nome || payload.gruppoId}" → "${payload.nome}"`);
  return { successo: true, ...(await rispostaGruppi()) };
});

// Eliminazione: la regola "solo foglie" la difende gruppi.js. Il pulsante nel
// frontend è già disabilitato sui gruppi con figli, ma il frontend non è un
// controllo di sicurezza — chiunque può invocare questo resolver a mano.
resolver.define('eliminaGruppoAdmin', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire i gruppi' };
  }

  // Info del gruppo PRIMA dell'eliminazione, per un log leggibile.
  const gruppo = await getGruppo(payload.gruppoId);
  const tlNome = await nomeUtente(gruppo?.teamLeaderId);

  const esito = await eliminaGruppo(payload.gruppoId);
  if (esito.errore) return esito;

  await auditConfig(context, `gruppo eliminato: "${gruppo?.nome || payload.gruppoId}" (TL: ${tlNome})`);
  return { successo: true, ...(await rispostaGruppi()) };
});

resolver.define('aggiungiDeveloperAdmin', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire i gruppi' };
  }

  const utente = await validaUtenteJira(payload.accountId);
  if (utente.errore) return { errore: utente.errore };

  const esito = await aggiungiDeveloper(payload.gruppoId, utente.accountId);
  if (esito.errore) return esito;

  const gruppo = await getGruppo(payload.gruppoId);
  const tl = await nomeUtente(gruppo?.teamLeaderId);
  await auditConfig(context, `developer aggiunto: ${utente.nome} → gruppo "${gruppo?.nome || payload.gruppoId}" (TL: ${tl})`);
  return { successo: true, nome: utente.nome, ...(await rispostaGruppi()) };
});

resolver.define('rimuoviDeveloperAdmin', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire i gruppi' };
  }

  // Nome del developer e info del gruppo PRIMA della rimozione, per un log leggibile.
  const gruppo = await getGruppo(payload.gruppoId);
  const devNome = await nomeUtente(payload.accountId);
  const tlNome = await nomeUtente(gruppo?.teamLeaderId);

  const esito = await rimuoviDeveloper(payload.gruppoId, payload.accountId);
  if (esito.errore) return esito;

  await auditConfig(context, `developer rimosso: ${devNome} dal gruppo "${gruppo?.nome || payload.gruppoId}" (TL: ${tlNome})`);
  return { successo: true, ...(await rispostaGruppi()) };
});

// Interruttore del nuovo modello. Finché è false, trigger e notifiche
// continuano a usare membri.js/ruoli.js: il flusso attuale non cambia.
resolver.define('setGruppiAttiviAdmin', async ({ payload }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire i gruppi' };
  }

  return { successo: true, attivi: await setGruppiAttivi(payload.attivi) };
});

// ---------------------------------------------------------------------------
// CATALOGO SFIDE (pagina admin "Settings" → scheda Challenges)
//
// Le sfide non sono più hardcoded: vivono in KVS, seedate al primo accesso da
// src/resolvers/config/sfide-default.json. Vedi catalogo-sfide.js.
//
// ⚠️ I nomi hanno tutti il prefisso `catalogo`: esisteva già un
// `aggiungiSfidaAdmin` (riga ~584, gate supervisore, usato dal pannello admin
// storico). Due define con lo stesso nome fanno fallire il caricamento
// dell'INTERO modulo resolver, mandando giù tutta l'app — non solo la pagina
// nuova. Prima di aggiungere un define, controlla i duplicati.
// ---------------------------------------------------------------------------

resolver.define('catalogoGet', async () => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire il catalogo sfide' };
  }

  return {
    successo: true,
    categorie: await getCategorie(),
    sfide: await getCatalogo(),
  };
});

resolver.define('catalogoAggiungiSfida', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire il catalogo sfide' };
  }

  const esito = await aggiungiSfida(payload);
  if (esito.errore) return esito;
  await auditConfig(context, `item aggiunto (${payload.tipo}): "${payload.nome}"`);
  return { successo: true, categorie: await getCategorie(), sfide: esito.catalogo };
});

resolver.define('catalogoModificaSfida', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire il catalogo sfide' };
  }

  const esito = await modificaSfida(payload.key, payload);
  if (esito.errore) return esito;
  await auditConfig(context, `item modificato: "${payload.nome}"`);
  return { successo: true, categorie: await getCategorie(), sfide: esito.catalogo };
});

// ⚠️ Eliminare una sfida fa sparire i punti di chi l'aveva completata:
// calcolaPuntiSfide la cerca nel catalogo e, non trovandola, conta 0.
// È una conseguenza accettata consapevolmente (decisione del 19/07) e la UI
// la dichiara prima di confermare.
resolver.define('catalogoEliminaSfida', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire il catalogo sfide' };
  }

  const esito = await eliminaSfida(payload.key);
  if (esito.errore) return esito;
  await auditConfig(context, `item eliminato: ${payload.key}`);
  return { successo: true, categorie: await getCategorie(), sfide: esito.catalogo };
});

// Ripristina le sole sfide di default MANCANTI. Non sovrascrive nulla: una
// sfida già presente resta com'è, anche se l'admin l'ha modificata.
resolver.define('catalogoRipristinaDefault', async ({ context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire il catalogo sfide' };
  }

  const esito = await ripristinaDefault();
  await auditConfig(context, `ripristino default catalogo: +${esito.aggiunte} sfide`);
  return {
    successo: true,
    aggiunte: esito.aggiunte,
    categorie: await getCategorie(),
    sfide: esito.catalogo,
  };
});

resolver.define('catalogoSetCategoria', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire il catalogo sfide' };
  }

  const esito = await setCategoria(payload.tipo, payload);
  if (esito.errore) return esito;
  await auditConfig(context, `categoria "${payload.tipo}": default ${payload.puntiDefault} · limite ${payload.limite}`);
  return { successo: true, categorie: esito.categorie, sfide: await getCatalogo() };
});

// ---------------------------------------------------------------------------
// CALENDARIO STAGIONI (pagina admin "Settings" → scheda Season)
//
// ⚠️ Modello NUOVO e a sé: NON è ancora il motore dei punti (stagione.js con la
// vecchia logica a 2 mesi resta la fonte del rollover). Vedi catalogo-stagioni.js.
// Prefisso `stagioni` sui define per non collidere con nomi esistenti.
// ---------------------------------------------------------------------------

// Aggiunge a ogni stagione il suo stato calcolato ORA (conclusa/corrente/futura),
// così il frontend non deve conoscere la regola e non c'è rischio che diverga.
const stagioniConStato = async () => {
  const ora = Date.now();
  const GIORNO = 24 * 60 * 60 * 1000;
  const stagioni = await getStagioni();
  return stagioni.map((s) => {
    const stato = statoStagioneCal(s, ora);
    // Giorni alla fine: serve solo alla stagione in corso, per la riga del tree.
    const giorniRimanenti =
      stato === 'corrente' ? Math.max(0, Math.ceil((s.fineMs - ora) / GIORNO)) : null;
    return { ...s, stato, giorniRimanenti };
  });
};

resolver.define('stagioniGet', async () => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire le stagioni' };
  }
  return { successo: true, stagioni: await stagioniConStato() };
});

resolver.define('stagioniCrea', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire le stagioni' };
  }
  const esito = await creaStagione(payload);
  if (esito.errore) return esito;
  await auditConfig(context, `stagione creata: "${payload.nome}"`);
  return { successo: true, stagioni: await stagioniConStato() };
});

resolver.define('stagioniModifica', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire le stagioni' };
  }
  const esito = await modificaStagione(payload.id, payload);
  if (esito.errore) return esito;
  await auditConfig(context, `stagione modificata: "${payload.nome || payload.id}"`);
  return { successo: true, stagioni: await stagioniConStato() };
});

resolver.define('stagioniElimina', async ({ payload, context }) => {
  if (!await isAdminJira()) {
    return { errore: 'Solo un amministratore Jira può gestire le stagioni' };
  }
  const esito = await eliminaStagione(payload.id, Date.now());
  if (esito.errore) return esito;
  await auditConfig(context, `stagione eliminata: ${payload.id}`);
  return { successo: true, stagioni: await stagioniConStato() };
});

// ---------------------------------------------------------------------------
// WORKFLOW — regole di monitoraggio (scheda admin "Workflow")
//
// Progetto + stato → trigger → punti. È ciò che trigger.js consulta per
// decidere se assegnare punti. Prefisso `workflow` sui define. Tutto isAdminJira.
// ---------------------------------------------------------------------------

// Elenco progetti Jira per il picker della regola.
resolver.define('workflowProgetti', async () => {
  if (!await isAdminJira()) return { errore: 'Solo un amministratore Jira' };

  const res = await api.asUser().requestJira(
    route`/rest/api/3/project/search?maxResults=100&orderBy=name`
  );
  if (!res.ok) return { errore: 'Impossibile leggere i progetti' };

  const dati = await res.json();
  return {
    successo: true,
    progetti: (dati.values || []).map((p) => ({
      key: p.key,
      nome: p.name,
      // Avatar del progetto (icona nello Space picker). L'endpoint restituisce
      // più taglie: prendiamo la 24x24.
      avatarUrl: p.avatarUrls?.['24x24'] || '',
    })),
  };
});

// Issue type di un progetto, ognuno con i suoi stati. L'endpoint
// /project/{key}/statuses li restituisce GIÀ raggruppati per issue type: uno
// Space ha più issue type, ognuno con il suo workflow e quindi i suoi stati.
// Col solo read:jira-work — niente manage:jira-configuration.
resolver.define('workflowStatiProgetto', async ({ payload }) => {
  if (!await isAdminJira()) return { errore: 'Solo un amministratore Jira' };

  const key = payload.progettoKey;
  if (!key) return { errore: 'Progetto mancante' };

  const resStati = await api.asUser().requestJira(
    route`/rest/api/3/project/${key}/statuses`
  );
  if (!resStati.ok) return { errore: 'Impossibile leggere gli stati del progetto' };

  const dati = await resStati.json();
  const issueTypes = (Array.isArray(dati) ? dati : []).map((tipo) => ({
    id: tipo.id,
    nome: tipo.name,
    stati: (tipo.statuses || []).map((st) => ({
      id: st.id, nome: st.name, categoria: st.statusCategory?.key,
    })),
  }));

  return { successo: true, issueTypes };
});

// Regole + trigger disponibili + il punteggio del work item (dal config globale,
// così la scheda mostra lo stesso valore usato dal trigger).
resolver.define('workflowRegoleGet', async () => {
  if (!await isAdminJira()) return { errore: 'Solo un amministratore Jira' };
  const regole = await getRegole();
  // Alle regole a tempo aggancio l'ultima esecuzione del Decanter (per la UI).
  const conEsec = await Promise.all(regole.map(async (r) => (
    r.famiglia === 'tempo'
      ? { ...r, ultimaEsecuzione: await getUltimaEsecuzioneDecanter(r.id) }
      : r
  )));
  return {
    successo: true,
    regole: conEsec,
    trigger: await getTriggerCatalogo(),
    puntiWorkItem: await getPuntiPerTicket(),
  };
});

resolver.define('workflowRegolaCrea', async ({ payload, context }) => {
  if (!await isAdminJira()) return { errore: 'Solo un amministratore Jira' };
  const esito = await aggiungiRegola(payload);
  if (esito.errore) return esito;
  const stati = (payload.stati || []).map((s) => s.nome).join('/');
  await auditConfig(context, `regola creata: ${payload.progettoKey}/${payload.issueTypeNome || '—'}/${stati} → ${payload.trigger}`);
  return { successo: true, regole: esito.regole };
});

resolver.define('workflowRegolaModifica', async ({ payload, context }) => {
  if (!await isAdminJira()) return { errore: 'Solo un amministratore Jira' };
  const esito = await modificaRegola(payload.id, payload);
  if (esito.errore) return esito;
  await auditConfig(context, `regola modificata: ${payload.id} (${payload.progettoKey || '—'})`);
  return { successo: true, regole: esito.regole };
});

resolver.define('workflowRegolaElimina', async ({ payload, context }) => {
  if (!await isAdminJira()) return { errore: 'Solo un amministratore Jira' };
  const esito = await eliminaRegola(payload.id);
  if (esito.errore) return esito;
  await auditConfig(context, `regola eliminata: ${payload.id}`);
  return { successo: true, regole: esito.regole };
});

// Personalizza nome/descrizione di un trigger (la chiave, e quindi il match,
// non cambia). Vedi getTriggerCatalogo/modificaTrigger in regole-workflow.js.
resolver.define('workflowTriggerModifica', async ({ payload, context }) => {
  if (!await isAdminJira()) return { errore: 'Solo un amministratore Jira' };
  const esito = await modificaTrigger(payload.key, payload);
  if (esito.errore) return esito;
  await auditConfig(context, `trigger modificato: ${payload.key} → "${payload.nome}"`);
  return { successo: true, trigger: esito.trigger };
});

// Esegue SUBITO una passata del Decanter (trigger a tempo), senza aspettare lo
// scheduled trigger. Serve all'admin per testare/forzare la scansione.
resolver.define('decanterEseguiOra', async () => {
  if (!await isAdminJira()) return { errore: 'Solo un amministratore Jira' };
  return await eseguiDecanter();
});

// Audit Log — lettura paginata (≤50) filtrata per intervallo date, tipo, developer.
// Arricchisce gli accountId con i nomi dei membri per la colonna "Chi".
resolver.define('auditLogGet', async ({ payload }) => {
  if (!await isAdminJira()) return { errore: 'Solo un amministratore Jira' };

  const res = await getAuditLog(payload || {});

  const membri = await getMembri();
  const nomePer = {};
  (membri || []).forEach((m) => { nomePer[m.accountId] = m.nome; });

  // AccountId presenti nella pagina ma NON tra i membri (tipicamente admin/Team
  // Leader che fanno azioni config/TL): risolviamo il nome via Jira, una sola
  // volta per id, con un tetto di sicurezza sul numero di lookup.
  const daRisolvere = new Set();
  res.entries.forEach((e) => {
    [e.a, e.s].forEach((id) => {
      if (id && id !== 'system' && !nomePer[id]) daRisolvere.add(id);
    });
  });
  let lookup = 0;
  for (const id of daRisolvere) {
    if (lookup >= 25) break;
    lookup += 1;
    try {
      const r = await api.asApp().requestJira(route`/rest/api/3/user?accountId=${id}`);
      if (r.ok) { const u = await r.json(); nomePer[id] = u.displayName || '—'; }
    } catch (e) { /* nome non risolto: resterà '—' */ }
  }

  const nome = (id) => (id === 'system' ? 'Sistema' : (id ? (nomePer[id] || '—') : ''));

  const entries = res.entries.map((e) => ({
    ...e,
    aNome: nome(e.a),
    ...(e.s ? { sNome: nome(e.s) } : {}),
  }));

  return {
    successo: true,
    entries,
    nextCursor: res.nextCursor,
    totale: res.totale,
    troncato: res.troncato,
  };
});

export const handler = resolver.getDefinitions();