import { kvs } from '@forge/kvs';

// Tempo minimo che un ticket deve restare in In Progress per non essere segnalato.
// 3 minuti: sotto questa soglia il ticket non è stato realmente lavorato.
const SOGLIA_SECONDI = 180;

// Quanto una segnalazione resta visibile dopo essere stata marcata come vista.
// Passate 24 ore viene cancellata definitivamente.
const DURATA_SEGNALAZIONE_RISOLTA_MS = 24 * 60 * 60 * 1000;

// Tipi di segnalazione
export const FLAG_TROPPO_VELOCE = 'TROPPO_VELOCE';
export const FLAG_SALTO_IN_PROGRESS = 'SALTO_IN_PROGRESS';

// Chiave KVS del timestamp di ingresso in In Progress.
// Indicizzata per ISSUE e non per utente: se una persona lavora più ticket
// in parallelo, una chiave per utente si sovrascriverebbe misurando quello sbagliato.
const chiaveInProgress = (issueKey) => `inprogress-${issueKey}`;

// Salva il momento in cui il ticket entra in In Progress.
export const registraInProgress = async (issueKey) => {
    await kvs.set(chiaveInProgress(issueKey), Date.now());
    console.log(`[antifarming] ${issueKey} entrato in In Progress, timer avviato`);
};

// Rimuove il timestamp senza fare controlli.
// Serve quando il ticket esce da In Progress per una via diversa da Done.
export const pulisciInProgress = async (issueKey) => {
    await kvs.delete(chiaveInProgress(issueKey));
};

// Analizza una chiusura e decide se va segnalata.
// Restituisce sempre { flags, secondiInProgress }: i punti li assegna il
// chiamante in ogni caso, la segnalazione è puramente informativa.
export const controllaChiusura = async (issueKey, statoPreced) => {
    const flags = [];
    let secondiInProgress = null;

    // Caso 1: il ticket arriva in Done partendo da To Do.
    // Non serve nessun timestamp per saperlo: non è mai stato in lavorazione.
    if (statoPreced === 'to do') {
        flags.push(FLAG_SALTO_IN_PROGRESS);
        console.log(`[antifarming] ${issueKey} SEGNALATO: salto di In Progress`);
        await pulisciInProgress(issueKey);
        return { flags, secondiInProgress };
    }

    // Caso 2: il ticket arriva da In Progress. Misuriamo quanto ci è rimasto.
    if (statoPreced === 'in progress') {
        const inizio = await kvs.get(chiaveInProgress(issueKey));

        if (!inizio) {
            // Nessun timestamp: il ticket era già in In Progress prima che questa
            // feature esistesse, oppure lo stato ha un nome diverso da quello atteso.
            // Non abbiamo dati per giudicare, quindi non segnaliamo — ma lo scriviamo
            // nei log, perché se succede spesso c'è qualcosa da sistemare.
            console.log(`[antifarming] ATTENZIONE: ${issueKey} chiuso da In Progress ma senza timestamp`);
            return { flags, secondiInProgress };
        }

        secondiInProgress = Math.round((Date.now() - inizio) / 1000);
        await pulisciInProgress(issueKey);

        if (secondiInProgress < SOGLIA_SECONDI) {
            flags.push(FLAG_TROPPO_VELOCE);
            console.log(`[antifarming] ${issueKey} SEGNALATO: solo ${secondiInProgress}s in In Progress (soglia ${SOGLIA_SECONDI}s)`);
        } else {
            console.log(`[antifarming] ${issueKey} ok: ${secondiInProgress}s in In Progress`);
        }

        return { flags, secondiInProgress };
    }

    // Caso 3: proviene da un altro stato (es. In Review, Blocked).
    // Non sappiamo cosa significhi, quindi non giudichiamo.
    console.log(`[antifarming] ${issueKey} chiuso da "${statoPreced}": nessun controllo`);
    await pulisciInProgress(issueKey);
    return { flags, secondiInProgress };
};

// Aggiunge una segnalazione alla lista che vedrà il supervisore.
export const aggiungiSegnalazione = async ({ issueKey, accountId, nome, flags, secondiInProgress }) => {
    const segnalazioni = await kvs.get('segnalazioni') || [];

    const nuova = {
        id: `segn-${Date.now()}`,
        issueKey,
        accountId,
        nome,
        flags,
        // KVS non accetta null: usiamo -1 come "non misurato"
        secondiInProgress: secondiInProgress === null ? -1 : secondiInProgress,
        data: Date.now(),
        risolta: false,
    };

    await kvs.set('segnalazioni', [...segnalazioni, nuova]);
    return nuova;
};

// Rimuove le segnalazioni marcate come viste da più di 24 ore.
// Le segnalazioni ancora aperte non vengono mai toccate.
const pulisciSegnalazioniScadute = async () => {
    const segnalazioni = await kvs.get('segnalazioni') || [];
    const ora = Date.now();
    let modificata = false;

    const superstiti = segnalazioni.filter((s) => {
        if (!s.risolta) return true; // aperta: resta sempre

        // Backfill: le segnalazioni marcate viste PRIMA che esistesse questo campo
        // non hanno risoltaIl. Invece di cancellarle subito (perderemmo dati senza
        // che nessuno abbia scelto di farlo), assegniamo adesso come istante zero:
        // spariranno tra 24 ore.
        if (!s.risoltaIl) {
            s.risoltaIl = ora;
            modificata = true;
            return true;
        }

        const scaduta = ora - s.risoltaIl >= DURATA_SEGNALAZIONE_RISOLTA_MS;
        if (scaduta) modificata = true;
        return !scaduta;
    });

    // Scriviamo solo se qualcosa è davvero cambiato, per non fare una set
    // su KVS a ogni singola apertura del pannello admin.
    if (modificata) await kvs.set('segnalazioni', superstiti);
    return superstiti;
};

// Legge tutte le segnalazioni, dalla più recente alla più vecchia.
// Coglie l'occasione per rimuovere quelle risolte e scadute.
export const getSegnalazioni = async () => {
    const segnalazioni = await pulisciSegnalazioniScadute();
    return [...segnalazioni].sort((a, b) => b.data - a.data);
};

// Marca una segnalazione come vista dal supervisore.
// Salva anche l'istante: da lì partono le 24 ore prima della cancellazione.
export const marcaSegnalazioneVista = async (segnalazioneId) => {
    const segnalazioni = await kvs.get('segnalazioni') || [];
    const aggiornate = segnalazioni.map(s =>
        s.id === segnalazioneId
            ? { ...s, risolta: true, risoltaIl: Date.now() }
            : s
    );
    await kvs.set('segnalazioni', aggiornate);
    return await getSegnalazioni();
};