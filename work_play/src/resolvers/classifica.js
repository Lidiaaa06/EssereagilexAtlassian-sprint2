import { kvs } from '@forge/kvs';

// Fotografia delle posizioni in classifica, aggiornata una volta al giorno.
// Serve a calcolare la colonna "Cambio" (▲ / ▼) del gadget classifica.
//
// Non esiste un cron in Forge: lo snapshot viene aggiornato pigramente, alla
// prima lettura della classifica di ogni giorno. Se nessuno apre il gadget per
// tre giorni, il confronto sarà rispetto a tre giorni fa, non a ieri.

// Stesso formato data usato in pensieri.js, per coerenza
const dataOdierna = () => {
    const oggi = new Date();
    return `${oggi.getFullYear()}-${oggi.getMonth() + 1}-${oggi.getDate()}`;
};

// Da un array già ordinato costruisce { accountId: posizione }
const estraiPosizioni = (classificaOrdinata) => {
    const posizioni = {};
    classificaOrdinata.forEach((utente, index) => {
        posizioni[utente.accountId] = index + 1;
    });
    return posizioni;
};

// Calcola il movimento di ciascun membro rispetto allo snapshot precedente,
// poi aggiorna lo snapshot se è di un giorno diverso da oggi.
//
// Riceve la classifica GIÀ ORDINATA e restituisce lo stesso array con il campo
// cambioPosizione valorizzato. Positivo = salito, negativo = sceso.
export const applicaCambioPosizione = async (classificaOrdinata) => {
    const snapshot = await kvs.get('classifica-snapshot');
    const posizioniOggi = estraiPosizioni(classificaOrdinata);

    // IMPORTANTE: leggiamo lo snapshot PRIMA di sovrascriverlo, altrimenti
    // confronteremmo la classifica con se stessa e il cambio sarebbe sempre 0.
    const risultato = classificaOrdinata.map((utente, index) => {
        const posizioneAttuale = index + 1;

        // Nessuno snapshot (prima esecuzione) o membro non ancora fotografato
        // (es. appena aggiunto al TEAM): non c'è un "prima" con cui confrontarsi.
        const posizionePrecedente = snapshot?.posizioni?.[utente.accountId];
        if (!posizionePrecedente) {
            return { ...utente, cambioPosizione: 0 };
        }

        // Salire in classifica significa che il numero di posizione DIMINUISCE:
        // da 4° a 2° è un miglioramento, quindi 4 - 2 = +2.
        return { ...utente, cambioPosizione: posizionePrecedente - posizioneAttuale };
    });

    // Nuovo giorno (o primo avvio) → aggiorniamo la fotografia.
    // Durante la stessa giornata non riscriviamo, così il confronto resta stabile.
    const oggi = dataOdierna();
    if (!snapshot || snapshot.data !== oggi) {
        await kvs.set('classifica-snapshot', {
            data: oggi,
            posizioni: posizioniOggi,
        });
    }

    return risultato;
};