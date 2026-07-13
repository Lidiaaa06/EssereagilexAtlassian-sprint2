import { kvs } from '@forge/kvs';

// Aggiungi un ticket alla Hall of Fame
export const aggiungiHallOfFame = async (issueKey, issueData, aggiuntoDA) => {
    const halloffame = await kvs.get('halloffame') || [];

    // Controlla se il ticket è già presente
    if (halloffame.find(t => t.id === issueKey)) return halloffame;

    const nuovoTicket = {
        id: issueKey,
        titolo: issueData.titolo,
        descrizione: issueData.descrizione,
        assignee: issueData.assignee,
        assigneeId: issueData.assigneeId,
        aggiuntoDA,
        data: Date.now(),
        reactions: {
            fuoco: [],
            cervello: [],
            fulmine: [],
            trofeo: []
        },
        commenti: []
    };

    await kvs.set('halloffame', [...halloffame, nuovoTicket]);
    return await kvs.get('halloffame');
};

// Leggi tutti i ticket della Hall of Fame
export const getHallOfFame = async () => {
    return await kvs.get('halloffame') || [];
};

// Aggiungi o rimuovi una reaction (toggle)
export const toggleReaction = async (issueKey, reaction, accountId) => {
    const halloffame = await kvs.get('halloffame') || [];

    const aggiornata = halloffame.map(ticket => {
        if (ticket.id !== issueKey) return ticket;

        const listaReaction = ticket.reactions[reaction] || [];
        const haReagito = listaReaction.includes(accountId);

        return {
            ...ticket,
            reactions: {
                ...ticket.reactions,
                [reaction]: haReagito
                    ? listaReaction.filter(id => id !== accountId) // rimuovi
                    : [...listaReaction, accountId] // aggiungi
            }
        };
    });

    await kvs.set('halloffame', aggiornata);
    return await kvs.get('halloffame');
};

// Aggiungi un commento
export const aggiungiCommento = async (issueKey, testo, autore, autoreId) => {
    const halloffame = await kvs.get('halloffame') || [];

    const aggiornata = halloffame.map(ticket => {
        if (ticket.id !== issueKey) return ticket;

        const nuovoCommento = {
            id: `comm-${Date.now()}`,
            testo: testo.slice(0, 300), // max 300 caratteri (~3 righe)
            autore,
            autoreId,
            data: Date.now()
        };

        return {
            ...ticket,
            commenti: [...ticket.commenti, nuovoCommento]
        };
    });

    await kvs.set('halloffame', aggiornata);
    return await kvs.get('halloffame');
};

// Elimina un commento
export const eliminaCommento = async (issueKey, commentoId, richiedenteId) => {
    const halloffame = await kvs.get('halloffame') || [];

    const aggiornata = halloffame.map(ticket => {
        if (ticket.id !== issueKey) return ticket;

        return {
            ...ticket,
            commenti: ticket.commenti.filter(c =>
                !(c.id === commentoId && c.autoreId === richiedenteId)
            )
        };
    });

    await kvs.set('halloffame', aggiornata);
    return await kvs.get('halloffame');
};