import { kvs } from '@forge/kvs';
import { SFIDE, getPuntiBonus } from './sfide';

const calcolaFineStagione = (inizioStagione) => {
    const inizio = new Date(inizioStagione);
    const ultimoGiornoSecondoMese = new Date(
        inizio.getFullYear(),
        inizio.getMonth() + 2,
        0,
        23, 59, 59, 0
    );
    ultimoGiornoSecondoMese.setDate(ultimoGiornoSecondoMese.getDate() - 2);
    return ultimoGiornoSecondoMese.getTime();
};

const calcolaInizioProssimaStagione = (inizioStagione) => {
    const inizio = new Date(inizioStagione);
    const prossima = new Date(
        inizio.getFullYear(),
        inizio.getMonth() + 2,
        1,
        0, 0, 0, 0
    );
    return prossima.getTime();
};

export const getStatoStagione = async () => {
    const inizioStagione = await kvs.get('stagione-inizio');
    if (!inizioStagione) return 'scaduta';

    const ora = Date.now();
    const fineStagione = calcolaFineStagione(inizioStagione);
    const inizioProssima = calcolaInizioProssimaStagione(inizioStagione);

    if (ora <= fineStagione) return 'attiva';
    if (ora < inizioProssima) return 'pausa';
    return 'scaduta';
};

const calcolaBadge = (points) => {
    if (points >= 1000) return { name: 'Ticket Destroyer', emoji: '👹' };
    if (points >= 600) return { name: 'Farmer', emoji: '👨‍🌾' };
    if (points >= 300) return { name: 'Master', emoji: '👨‍🏫' };
    if (points >= 150) return { name: 'Legend', emoji: '🐐' };
    if (points >= 100) return { name: 'Champion', emoji: '🏆' };
    if (points >= 60) return { name: 'Expert', emoji: '🥇' };
    if (points >= 30) return { name: 'Intermediate', emoji: '🥈' };
    return { name: 'Rookie', emoji: '🥉' };
};

export const controllaStagione = async (TEAM) => {
    const stato = await getStatoStagione();

    if (stato === 'scaduta') {
        const numeroStagione = await kvs.get('stagione-numero') || 1;

        const classificaFinale = await Promise.all(
            TEAM.map(async (membro) => {
                const puntiTicket = await kvs.get(`punti-stagione-${membro.accountId}`) || 0;
                const ticket = await kvs.get(`ticket-stagione-${membro.accountId}`) || 0;

                const sfideUtente = await kvs.get(`sfide-${membro.accountId}`) || [];
                const puntiSfide = sfideUtente
                    .filter(s => s.completata)
                    .reduce((acc, s) => {
                        const sfida = SFIDE.find(sf => sf.key === s.key);
                        const bonus = s.descrizione ? getPuntiBonus(s.tipo) : 0;
                        return acc + (sfida ? sfida.punti + bonus : 0);
                    }, 0);

                const puntiValutazioneRaw = await kvs.get(`punti-valutazione-${membro.accountId}`) || 0;
                const puntiValutazione = puntiValutazioneRaw / 10;
                const puntiTotali = puntiTicket + puntiSfide + puntiValutazione;

                return {
                    accountId: membro.accountId,
                    nome: membro.nome,
                    puntiTotali,
                    ticket
                };
            })
        );
        classificaFinale.sort((a, b) => b.puntiTotali - a.puntiTotali);

        for (let i = 0; i < classificaFinale.length; i++) {
            const membro = classificaFinale[i];
            const puntiLegacy = await kvs.get(`punti-legacy-${membro.accountId}`) || 0;
            const badge = calcolaBadge(membro.puntiTotali);

            await kvs.set(`riepilogo-${membro.accountId}`, {
                numeroStagione,
                ticketChiusi: membro.ticket,
                puntiGuadagnati: membro.puntiTotali,
                badge,
                posizione: i + 1,
                totalePartecipanti: TEAM.length,
            });

            await kvs.set(`punti-legacy-${membro.accountId}`, puntiLegacy + membro.puntiTotali);
            await kvs.set(`punti-stagione-${membro.accountId}`, 0);
            await kvs.set(`ticket-stagione-${membro.accountId}`, 0);
            await kvs.set(`sfide-${membro.accountId}`, []);
            await kvs.set(`punti-valutazione-${membro.accountId}`, 0);
        }

        const ora = new Date();
        const inizioNuovaStagione = new Date(
            ora.getFullYear(),
            ora.getMonth(),
            1, 0, 0, 0, 0
        ).getTime();

        await kvs.set('stagione-inizio', inizioNuovaStagione);
        await kvs.set('stagione-numero', numeroStagione + 1);
        return 'nuova';
    }

    return stato;
};

export const resettaPuntiUtente = async (accountId) => {
    const puntiStagione = await kvs.get(`punti-stagione-${accountId}`) || 0;
    const puntiLegacy = await kvs.get(`punti-legacy-${accountId}`) || 0;
    await kvs.set(`punti-legacy-${accountId}`, puntiLegacy + puntiStagione);
    await kvs.set(`punti-stagione-${accountId}`, 0);
    await kvs.set(`ticket-stagione-${accountId}`, 0);
    await kvs.set(`sfide-${accountId}`, []);
    await kvs.set(`punti-valutazione-${accountId}`, 0);
};

export const aggiungiPunti = async (accountId, punti) => {
    const puntiAttuali = await kvs.get(`punti-stagione-${accountId}`) || 0;
    const nuoviPunti = Math.max(0, puntiAttuali + punti);
    await kvs.set(`punti-stagione-${accountId}`, nuoviPunti);
    return nuoviPunti;
};

export const getPuntiStagione = async (accountId) => {
    return await kvs.get(`punti-stagione-${accountId}`) || 0;
};

export const getPuntiLegacy = async (accountId) => {
    return await kvs.get(`punti-legacy-${accountId}`) || 0;
};

export const getNumeroStagione = async () => {
    return await kvs.get('stagione-numero') || 1;
};

export const getGiorniRimanenti = async () => {
    const inizioStagione = await kvs.get('stagione-inizio');
    if (!inizioStagione) return 0;

    const fineStagione = calcolaFineStagione(inizioStagione);
    const msRimanenti = fineStagione - Date.now();
    return Math.max(0, Math.ceil(msRimanenti / (1000 * 60 * 60 * 24)));
};

export const getStatoStagioneTestuale = async () => {
    const stato = await getStatoStagione();
    if (stato === 'attiva') return 'attiva';
    if (stato === 'pausa') return 'pausa';
    return 'nuova';
};

export const getTicketStagione = async (accountId) => {
    return await kvs.get(`ticket-stagione-${accountId}`) || 0;
};

export const getRiepilogoStagione = async (accountId) => {
    return await kvs.get(`riepilogo-${accountId}`) || null;
};

export const getCountdownNuovaStagione = async () => {
    const inizioStagione = await kvs.get('stagione-inizio');
    if (!inizioStagione) return null;

    const inizioProssima = calcolaInizioProssimaStagione(inizioStagione);
    const msRimanenti = inizioProssima - Date.now();
    if (msRimanenti <= 0) return null;

    const ore = Math.floor(msRimanenti / (1000 * 60 * 60));
    const minuti = Math.floor((msRimanenti % (1000 * 60 * 60)) / (1000 * 60));
    const giorni = Math.floor(ore / 24);

    if (giorni > 0) return `${giorni}g ${ore % 24}h`;
    return `${ore}h ${minuti}m`;
};

export const getPuntiPerTicket = async () => {
    return await kvs.get('config-punti-per-ticket') ?? 3;
};

export const setPuntiPerTicket = async (n) => {
    const val = Number(n);
    if (!Number.isFinite(val)) throw new Error('Valore non valido');
    await kvs.set('config-punti-per-ticket', val);
    return val;
}; 