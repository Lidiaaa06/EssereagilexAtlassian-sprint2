import { kvs } from '@forge/kvs';

// Valori di DEFAULT in punti REALI (come nelle etichette del panel operatore).
// Modificabili dall'admin. Internamente vengono salvati ×10 (vedi calcolaPunti),
// così il contatore storico 'punti-valutazione-...' mantiene lo stesso formato.
const DEFAULT_PUNTI_VAL = {
    risoluzione: { autonomia: 3, collega: 2, manager: 0.5 },
    documentazione: { corretta: 2, errata: -1.5, nessuna: 0 },
    feedback: { positivo: 3.5, negativo: -2, nessuno: 0 },
};

// Config effettiva: quella salvata dall'admin, con fallback ai default.
export const getPuntiValutazioneConfig = async () => {
    const cfg = await kvs.get('config-punti-valutazione');
    if (!cfg) return DEFAULT_PUNTI_VAL;
    return {
        risoluzione: { ...DEFAULT_PUNTI_VAL.risoluzione, ...(cfg.risoluzione || {}) },
        documentazione: { ...DEFAULT_PUNTI_VAL.documentazione, ...(cfg.documentazione || {}) },
        feedback: { ...DEFAULT_PUNTI_VAL.feedback, ...(cfg.feedback || {}) },
    };
};

export const setPuntiValutazioneConfig = async (cfg) => {
    const pulito = {
        risoluzione: {
            autonomia: Number(cfg?.risoluzione?.autonomia),
            collega: Number(cfg?.risoluzione?.collega),
            manager: Number(cfg?.risoluzione?.manager),
        },
        documentazione: {
            corretta: Number(cfg?.documentazione?.corretta),
            errata: Number(cfg?.documentazione?.errata),
            nessuna: Number(cfg?.documentazione?.nessuna),
        },
        feedback: {
            positivo: Number(cfg?.feedback?.positivo),
            negativo: Number(cfg?.feedback?.negativo),
            nessuno: Number(cfg?.feedback?.nessuno),
        },
    };
    await kvs.set('config-punti-valutazione', pulito);
    return pulito;
};

// Somma i punti REALI dalle scelte e li converte in grezzi (×10, interi).
const calcolaPuntiGrezzi = (config, risoluzione, documentazione, feedback) => {
    const reale =
        (config.risoluzione[risoluzione] ?? 0) +
        (config.documentazione[documentazione] ?? 0) +
        (config.feedback[feedback] ?? 0);
    return Math.round(reale * 10);
};

// L'operatore invia l'autovalutazione: NON somma punti. Crea un record congelato.
export const salvaValutazione = async (accountId, nome, issueKey, risoluzione, documentazione, feedback) => {
    const config = await getPuntiValutazioneConfig();
    const puntiProposti = calcolaPuntiGrezzi(config, risoluzione, documentazione, feedback);
    const congelate = await kvs.get('valutazioni-congelate') || [];

    // Una sola valutazione per ticket per operatore, in QUALSIASI stato
    // (congelata, confermata, modificata o rifiutata). Blocco definitivo.
    if (congelate.find(v => v.accountId === accountId && v.issueKey === (issueKey || null))) {
        return { errore: 'Hai già inviato una valutazione per questo ticket' };
    }

    const record = {
        id: `val-${Date.now()}`,
        accountId,
        nome,
        issueKey: issueKey || null,
        risoluzione,
        documentazione,
        feedback,
        puntiProposti,           // grezzi (×10). In UI si mostra /10.
        stato: 'congelata',
        data: Date.now(),
    };

    await kvs.set('valutazioni-congelate', [...congelate, record]);
    return { inAttesa: true, puntiProposti: puntiProposti / 10 };
};

// Punti valutazione CONFERMATI (contatore storico, invariato).
export const getPuntiValutazione = async (accountId) => {
    const punti = await kvs.get(`punti-valutazione-${accountId}`);
    return punti ? punti / 10 : 0;
};

// Elenco valutazioni ANCORA IN ATTESA (solo quelle non ancora decise).
export const getValutazioniCongelate = async () => {
    const list = await kvs.get('valutazioni-congelate') || [];
    return list.filter(v => v.stato === 'congelata');
};

// Stato della valutazione di un operatore su un ticket (per il panel).
// null = non ha ancora valutato → può inviare.
export const getStatoValutazione = async (accountId, issueKey) => {
    const list = await kvs.get('valutazioni-congelate') || [];
    const rec = list.find(v => v.accountId === accountId && v.issueKey === (issueKey || null));
    return rec ? rec.stato : null;
};

// Conferma, eventualmente con scelte modificate: ricalcola dalla config attuale
// e somma al contatore confermato dell'operatore. Il record NON viene cancellato,
// ma marcato (confermata/modificata) così il ticket resta "già valutato".
export const confermaValutazione = async (id, risoluzione, documentazione, feedback) => {
    const congelate = await kvs.get('valutazioni-congelate') || [];
    const record = congelate.find(v => v.id === id);
    if (!record) return { errore: 'Valutazione non trovata' };
    if (record.stato !== 'congelata') return { errore: 'Valutazione già gestita' };

    const config = await getPuntiValutazioneConfig();
    const punti = calcolaPuntiGrezzi(config, risoluzione, documentazione, feedback);
    const current = await kvs.get(`punti-valutazione-${record.accountId}`) || 0;
    await kvs.set(`punti-valutazione-${record.accountId}`, current + punti);

    const modificata =
        risoluzione !== record.risoluzione ||
        documentazione !== record.documentazione ||
        feedback !== record.feedback;

    const aggiornata = congelate.map(v => v.id === id ? {
        ...v,
        stato: modificata ? 'modificata' : 'confermata',
        risoluzioneFinale: risoluzione,
        documentazioneFinale: documentazione,
        feedbackFinale: feedback,
        puntiApplicati: punti,
        decisaIl: Date.now(),
    } : v);
    await kvs.set('valutazioni-congelate', aggiornata);
    return { successo: true, puntiApplicati: punti / 10 };
};

// Rifiuta: nessun punto. Il record resta, marcato 'rifiutata' (blocco definitivo).
export const rifiutaValutazione = async (id) => {
    const congelate = await kvs.get('valutazioni-congelate') || [];
    const record = congelate.find(v => v.id === id);
    if (!record) return { errore: 'Valutazione non trovata' };
    const aggiornata = congelate.map(v => v.id === id
        ? { ...v, stato: 'rifiutata', decisaIl: Date.now() }
        : v);
    await kvs.set('valutazioni-congelate', aggiornata);
    return { successo: true };
};