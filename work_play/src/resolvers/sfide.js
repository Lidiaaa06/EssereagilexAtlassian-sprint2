import { kvs } from '@forge/kvs';

export const SFIDE = [
    // Giornaliere
    { key: 'doc-5', tipo: 'giornaliera', emoji: '📚', nome: 'Aggiorna la documentazione correttamente 5 volte', punti: 5, descrizione: 'Accedi alla documentazione del progetto e aggiorna almeno 5 pagine con informazioni corrette e aggiornate. Ogni aggiornamento deve essere verificabile e pertinente.' },
    { key: 'ticket-5stelle', tipo: 'giornaliera', emoji: '⭐', nome: 'Chiudi un ticket con 5 stelle', punti: 5, descrizione: 'Risolvi un ticket in modo eccellente ottenendo una valutazione di 5 stelle dal cliente. La qualità della soluzione e la comunicazione sono fondamentali.' },
    { key: 'aiuta-collega', tipo: 'giornaliera', emoji: '🤝', nome: 'Aiuta 1 collega in una task', punti: 5, descrizione: 'Supporta attivamente un collega nella risoluzione di una task. L\'aiuto deve essere concreto e documentato nel ticket.' },
    { key: 'recensore', tipo: 'giornaliera', emoji: '👌', nome: 'Lascia un commento costruttivo su un ticket di un collega', punti: 5, descrizione: 'Aggiungi un commento utile e costruttivo su un ticket di un collega. Il commento deve contribuire alla risoluzione del problema o migliorare la qualità del lavoro.' },
    { key: 'taglia-code', tipo: 'giornaliera', emoji: '✔️', nome: 'Prendi un ticket da to do e portalo in done', punti: 5, descrizione: 'Seleziona un ticket dalla colonna To Do, prenditi carico e portalo a completamento nella stessa giornata.' },
    { key: 'assist', tipo: 'giornaliera', emoji: '👥', nome: 'Tagga un collega in un commento risolvendo un suo dubbio', punti: 5, descrizione: 'Menziona un collega in un commento fornendo una risposta chiara e utile a un suo dubbio. La risposta deve essere completa e risolutiva.' },
    { key: 'pronto-soccorso', tipo: 'giornaliera', emoji: '🚑', nome: 'Prendi un ticket contrassegnato come bloccato e risolvilo', punti: 5, descrizione: 'Identifica un ticket bloccato, analizza il problema che lo sta bloccando e trovane una soluzione entro la giornata.' },

    // Settimanali
    { key: 'chiudi-10', tipo: 'settimanale', emoji: '🏆', nome: 'Chiudi 10 ticket questa settimana', punti: 10, descrizione: 'Porta a completamento almeno 10 ticket nell\'arco della settimana lavorativa. La qualità delle soluzioni deve essere mantenuta alta.' },
    { key: 'aiuta-2colleghi', tipo: 'settimanale', emoji: '🤝', nome: 'Aiuta 2 colleghi questa settimana', punti: 10, descrizione: 'Fornisci supporto concreto ad almeno 2 colleghi diversi durante la settimana. Ogni aiuto deve essere documentato nei rispettivi ticket.' },
    { key: 'nessuno-resta-indietro', tipo: 'settimanale', emoji: '🪖', nome: 'Arriva a venerdì sera senza ticket in progress', punti: 10, descrizione: 'Gestisci il tuo carico di lavoro in modo da non avere ticket in stato "In Progress" alla fine della settimana lavorativa.' },
    { key: 'zero-sospesi', tipo: 'settimanale', emoji: '🖋️', nome: 'Rispondi a tutte le menzioni ricevute', punti: 10, descrizione: 'Rispondi a tutte le menzioni ricevute nei ticket durante la settimana. Nessuna menzione deve rimanere senza risposta entro venerdì.' },
    { key: 'compagno-di-sprint', tipo: 'settimanale', emoji: '🚀', nome: 'Completa tutte le task assegnate a te durante la sprint', punti: 10, descrizione: 'Porta a completamento tutte le task che ti sono state assegnate durante lo sprint corrente entro la fine della settimana.' },

    // Mensili
    { key: 'nuova-doc', tipo: 'mensile', emoji: '📝', nome: 'Crea una nuova pagina di documentazione', punti: 20, descrizione: 'Crea una nuova pagina di documentazione completa e utile per il team. La pagina deve essere ben strutturata, chiara e aggiungere valore alla knowledge base del progetto.' },
    { key: 'clean-sweep', tipo: 'mensile', emoji: '🧹', nome: 'Chiudi almeno 25 ticket in questo mese', punti: 20, descrizione: 'Porta a completamento almeno 25 ticket nell\'arco del mese. Dimostra costanza e produttività mantenendo alta la qualità delle soluzioni.' },
    { key: 'infallibile', tipo: 'mensile', emoji: '⏳', nome: 'Concludi il mese senza far scadere nessun ticket "Due Date"', punti: 20, descrizione: 'Gestisci le priorità in modo da rispettare tutte le scadenze dei ticket durante il mese. Nessun ticket con Due Date deve scadere senza essere stato completato.' },
    { key: 'il-preferito-del-po', tipo: 'mensile', emoji: '💖', nome: 'Completa il 100% delle task priority assegnati nel mese', punti: 20, descrizione: 'Porta a completamento tutte le task contrassegnate come prioritarie che ti sono state assegnate durante il mese. Dimostra affidabilità e attenzione alle priorità del progetto.' },
    { key: 'epic-crusher', tipo: 'mensile', emoji: '👹', nome: 'Partecipa attivamente alla chiusura di almeno il 30% di una Epic', punti: 20, descrizione: 'Porta a completamento almeno il 30% dei task di una epic che ti è stata assegnata durante il mese. Dimostra capacità di gestione di progetti complessi e attenzione ai dettagli.' },
    { key: 'il-maratoneta', tipo: 'mensile', emoji: '🏃‍♂️', nome: 'Logga più di 120 ore di lavoro effettivo su task regolarmente approvati nel corso del mese', punti: 20, descrizione: 'Logga più di 120 ore di lavoro effettivo su task regolarmente approvati nel corso del mese. Dimostra impegno e dedizione al lavoro.' },
    { key: 'zero-riaperture', tipo: 'mensile', emoji: '🔐', nome: 'Chiudi almeno 10 ticket senza che nessuno di essi venga riaperto per bug di regressione o test falliti', punti: 20, descrizione: 'Porta a completamento almeno 10 ticket durante il mese senza che nessuno di essi venga riaperto. Dimostra qualità e precisione nel lavoro svolto.' },
];

export const getScadenza = (tipo) => {
    const ora = new Date();
    if (tipo === 'giornaliera') {
        const fine = new Date(ora);
        fine.setHours(23, 59, 59, 0);
        return fine.getTime();
    }
    if (tipo === 'settimanale') {
        const fine = new Date(ora);
        const giorniAllaFine = 7 - fine.getDay();
        fine.setDate(fine.getDate() + giorniAllaFine);
        fine.setHours(23, 59, 59, 0);
        return fine.getTime();
    }
    if (tipo === 'mensile') {
        const fine = new Date(ora.getFullYear(), ora.getMonth() + 1, 0, 23, 59, 59);
        return fine.getTime();
    }
};

export const getSfideUtente = async (accountId) => {
    const sfide = await kvs.get(`sfide-${accountId}`);
    return sfide || [];
};

export const accettaSfida = async (accountId, sfidaKey) => {
    const current = await getSfideUtente(accountId);
    const sfida = SFIDE.find(s => s.key === sfidaKey);

    if (!sfida) return current;

    const limiti = { giornaliera: 3, settimanale: 2, mensile: 1 };
    const contatorePerTipo = current.filter(s => s.tipo === sfida.tipo && !s.completata).length;

    if (contatorePerTipo >= limiti[sfida.tipo]) return current;
    if (current.find(s => s.key === sfidaKey)) return current;

    const nuovaSfida = {
        key: sfidaKey,
        tipo: sfida.tipo,
        scadenza: getScadenza(sfida.tipo),
        completata: false,
    };

    await kvs.set(`sfide-${accountId}`, [...current, nuovaSfida]);
    return await getSfideUtente(accountId);
};

export const completaSfida = async (accountId, sfidaKey, descrizione) => {
    const current = await getSfideUtente(accountId);
    const aggiornate = current.map(s =>
        s.key === sfidaKey ? { ...s, completata: true, descrizione: descrizione || null } : s
    );
    await kvs.set(`sfide-${accountId}`, aggiornate);
    return await getSfideUtente(accountId);
};

export const getPuntiBonus = (tipo) => {
    const bonus = { giornaliera: 1, settimanale: 2, mensile: 4 };
    return bonus[tipo] || 0;
};

export const pulisciSfideScadute = async (accountId) => {
    const current = await getSfideUtente(accountId);
    const ora = Date.now();
    const attive = current.filter(s => s.scadenza > ora);
    await kvs.set(`sfide-${accountId}`, attive);
    return attive;
};