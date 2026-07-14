import { kvs } from '@forge/kvs';

// Supervisore hardcoded di default
const SUPERVISORE_DEFAULT = '712020:5930294d-413c-434a-ae40-db82633bff30'; // Lidia
// Inizializza i ruoli se non esistono
const inizializzaRuoli = async (TEAM) => {
    const ruoli = await kvs.get('ruoli');
    if (ruoli) return ruoli;

    // Prima inizializzazione — Roberto è supervisore, tutti gli altri operatori
    const ruoliIniziali = {};
    for (const membro of TEAM) {
        ruoliIniziali[membro.accountId] = membro.accountId === SUPERVISORE_DEFAULT
            ? 'supervisore'
            : 'operatore';
    }
    await kvs.set('ruoli', ruoliIniziali);
    return ruoliIniziali;
};

// Leggi il ruolo di un utente
export const getRuolo = async (accountId, TEAM) => {
    const ruoli = await inizializzaRuoli(TEAM);
    return ruoli[accountId] || 'operatore';
};

// Controlla se un utente è supervisore
export const isSupervisore = async (accountId, TEAM) => {
    const ruolo = await getRuolo(accountId, TEAM);
    return ruolo === 'supervisore';
};

// Conta quanti supervisori ci sono attualmente nella mappa ruoli
const contaSupervisori = (ruoli) => {
    return Object.values(ruoli).filter(r => r === 'supervisore').length;
};

// Assegna un ruolo a un utente (solo supervisore può farlo)
export const assegnaRuolo = async (accountIdRichiedente, accountIdTarget, nuovoRuolo, TEAM) => {
    const richiedente = await isSupervisore(accountIdRichiedente, TEAM);
    if (!richiedente) return { errore: 'Non hai i permessi per assegnare ruoli' };

    // Accetta solo i due ruoli previsti, per evitare di scrivere valori sporchi in KVS
    if (nuovoRuolo !== 'supervisore' && nuovoRuolo !== 'operatore') {
        return { errore: 'Ruolo non valido' };
    }

    // inizializzaRuoli invece di kvs.get diretto: garantisce che la mappa esista
    const ruoli = await inizializzaRuoli(TEAM);

    // GUARDRAIL ANTI-LOCKOUT
    // Se stiamo declassando un supervisore a operatore e lui è l'ultimo rimasto,
    // blocchiamo: senza supervisori nessuno potrebbe più assegnare ruoli e
    // l'unico recupero sarebbe da terminale con `forge storage`.
    const staDeclassando =
        ruoli[accountIdTarget] === 'supervisore' && nuovoRuolo === 'operatore';

    if (staDeclassando && contaSupervisori(ruoli) <= 1) {
        return { errore: 'Non puoi rimuovere l\'ultimo supervisore. Nominane un altro prima.' };
    }

    ruoli[accountIdTarget] = nuovoRuolo;
    await kvs.set('ruoli', ruoli);
    return { successo: true, ruoli };
};

// Leggi tutti i ruoli
export const getRuoli = async (TEAM) => {
    return await inizializzaRuoli(TEAM);
};