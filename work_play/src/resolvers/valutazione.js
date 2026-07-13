import { kvs } from '@forge/kvs';

const PUNTI_RISOLUZIONE = {
    autonomia: 30,
    collega: 20,
    manager: 5,
};

const PUNTI_DOCUMENTAZIONE = {
    corretta: 20,
    errata: -15,
    nessuna: 0,
};

const PUNTI_FEEDBACK = {
    positivo: 35,
    negativo: -20,
    nessuno: 0,
};

export const salvaValutazione = async (accountId, risoluzione, documentazione, feedback) => {
    console.log('risoluzione:', risoluzione);
    console.log('documentazione:', documentazione);
    console.log('feedback:', feedback);

    const puntiGuadagnati =
        PUNTI_RISOLUZIONE[risoluzione] +
        PUNTI_DOCUMENTAZIONE[documentazione] +
        PUNTI_FEEDBACK[feedback];

    const current = await kvs.get(`punti-valutazione-${accountId}`) || 0;

    console.log('accountId:', accountId);
    console.log('puntiGuadagnati:', puntiGuadagnati);
    console.log('current:', current);
    console.log('totale:', current + puntiGuadagnati);

    await kvs.set(`punti-valutazione-${accountId}`, current + puntiGuadagnati);

    return { puntiGuadagnati: puntiGuadagnati / 10, totale: (current + puntiGuadagnati) / 10 };
};

export const getPuntiValutazione = async (accountId) => {
    const punti = await kvs.get(`punti-valutazione-${accountId}`);
    return punti ? punti / 10 : 0;
};