import { kvs } from '@forge/kvs';

// Crea una RICHIESTA di inserimento in Hall of Fame (in attesa di approvazione).
// Non inserisce diretto: la voce resta in 'halloffame-richieste' finché il
// supervisore non approva o rifiuta.
export const richiediHallOfFame = async (issueKey, issueData, richiedenteDA) => {
  const richieste = await kvs.get('halloffame-richieste') || [];
  const halloffame = await kvs.get('halloffame') || [];

  // Evita doppioni: già in Hall of Fame, oppure richiesta già inviata.
  if (halloffame.find(t => t.id === issueKey)) return { errore: 'Ticket già in Hall of Fame' };
  if (richieste.find(t => t.id === issueKey)) return { errore: 'Richiesta già inviata, in attesa di approvazione' };

  const nuovaRichiesta = {
    id: issueKey,
    titolo: issueData.titolo,
    descrizione: issueData.descrizione,
    assignee: issueData.assignee,
    assigneeId: issueData.assigneeId,
    aggiuntoDA: richiedenteDA,
    data: Date.now(),
  };

  await kvs.set('halloffame-richieste', [...richieste, nuovaRichiesta]);
  return { successo: true };
};

// Elenco delle richieste in attesa (uso riservato al supervisore, il check è nel resolver).
export const getRichiesteHallOfFame = async () => {
  return await kvs.get('halloffame-richieste') || [];
};

// Approva una richiesta: la sposta nella Hall of Fame vera, inizializzando
// reactions e commenti vuoti, e la rimuove dalle richieste.
export const approvaRichiesta = async (issueKey) => {
  const richieste = await kvs.get('halloffame-richieste') || [];
  const richiesta = richieste.find(t => t.id === issueKey);
  if (!richiesta) return { errore: 'Richiesta non trovata' };

  const halloffame = await kvs.get('halloffame') || [];
  if (!halloffame.find(t => t.id === issueKey)) {
    const nuovoTicket = {
      ...richiesta,
      reactions: { fuoco: [], cervello: [], fulmine: [], trofeo: [] },
      commenti: [],
    };
    await kvs.set('halloffame', [...halloffame, nuovoTicket]);
  }

  await kvs.set('halloffame-richieste', richieste.filter(t => t.id !== issueKey));
  return { successo: true };
};

// Nega una richiesta: la rimuove senza inserirla in Hall of Fame.
export const rifiutaRichiesta = async (issueKey) => {
  const richieste = await kvs.get('halloffame-richieste') || [];
  await kvs.set('halloffame-richieste', richieste.filter(t => t.id !== issueKey));
  return { successo: true };
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