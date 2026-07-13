import { aggiungiPunti, controllaStagione } from './stagione';
import { registraInProgress, pulisciInProgress, controllaChiusura, aggiungiSegnalazione } from './antifarming';
import { kvs } from '@forge/kvs';

const TEAM = [
    { nome: "Roberto", accountId: "712020:a4ccdea1-0bb3-408f-9623-93c19691d980" },
    { nome: "Alessandro", accountId: "712020:48b975fc-daa2-4bc8-92dd-f8bf751a454a" },
    { nome: "Ludovica", accountId: "712020:c82776d1-c22b-4b85-ae3c-0110c541520f" },
    { nome: "Matthia", accountId: "712020:68180304-900d-4cbe-ad8e-73695ad5b96d" },
    { nome: "Lidia", accountId: "712020:5930294d-413c-434a-ae40-db82633bff30" },
];

export const handler = async (event, context) => {
    const stato = await controllaStagione(TEAM);

    if (stato === 'pausa') {
        console.log('Stagione in pausa - nessun punto assegnato');
        return;
    }

    const issue = event.issue;
    const changelog = event.changelog;

    const assigneeId = issue?.fields?.assignee?.accountId;
    if (!assigneeId) {
        console.log('Nessun assignee trovato');
        return;
    }

    const membroTeam = TEAM.find(m => m.accountId === assigneeId);
    if (!membroTeam) {
        console.log('Assignee non nel team');
        return;
    }

    const statusChange = changelog?.items?.find(item => item.field === 'status');
    if (!statusChange) {
        console.log('Nessun cambio di status');
        return;
    }

    const statoPreced = statusChange.fromString?.toLowerCase();
    const statoAttuale = statusChange.toString?.toLowerCase();

    console.log(`Ticket ${issue.key}: ${statoPreced} → ${statoAttuale} (assignee: ${membroTeam.nome})`);

    // Ticket passato a Done → controllo antifarming + 3 punti + incrementa contatore
    if (statoAttuale === 'done') {
        // Il controllo NON blocca i punti: segnala e basta (scelta di design).
        const { flags, secondiInProgress } = await controllaChiusura(issue.key, statoPreced);

        if (flags.length > 0) {
            await aggiungiSegnalazione({
                issueKey: issue.key,
                accountId: assigneeId,
                nome: membroTeam.nome,
                flags,
                secondiInProgress,
            });
        }

        const punti = await getPuntiPerTicket();
        await aggiungiPunti(assigneeId, punti);        // era: aggiungiPunti(assigneeId, 3)
        const ticketAttuali = await kvs.get(`ticket-stagione-${assigneeId}`) || 0;
        await kvs.set(`ticket-stagione-${assigneeId}`, ticketAttuali + 1);
        console.log(`+3 punti a ${membroTeam.nome} (ticket stagione: ${ticketAttuali + 1})`);
        return;
    }

    // Ticket riaperto da Done → -3 punti + decrementa contatore
    // ATTENZIONE all'ordine: questo ramo cattura anche Done → In Progress, quindi
    // deve stare PRIMA del ramo In Progress, altrimenti la riapertura salterebbe il -3.
    if (statoPreced === 'done' && statoAttuale !== 'done') {
        const punti = await getPuntiPerTicket();
        await aggiungiPunti(assigneeId, -punti);       // era: aggiungiPunti(assigneeId, -3)
        const ticketAttuali = await kvs.get(`ticket-stagione-${assigneeId}`) || 0;
        await kvs.set(`ticket-stagione-${assigneeId}`, Math.max(0, ticketAttuali - 1));
        console.log(`-3 punti a ${membroTeam.nome} (ticket stagione: ${Math.max(0, ticketAttuali - 1)})`);

        // Se la riapertura porta il ticket in lavorazione, il timer riparte da adesso.
        // Una richiusura rapida verrà quindi segnalata, ed è voluto.
        if (statoAttuale === 'in progress') {
            await registraInProgress(issue.key);
        } else {
            await pulisciInProgress(issue.key);
        }
        return;
    }

    // Ticket entrato in In Progress (non da Done, quel caso è gestito sopra)
    // → avvia il timer. Nessun punto assegnato.
    if (statoAttuale === 'in progress') {
        await registraInProgress(issue.key);
        return;
    }

    // Ticket uscito da In Progress verso uno stato che non è Done
    // (es. rimandato in To Do) → il timer non ha più senso, lo azzeriamo.
    if (statoPreced === 'in progress') {
        await pulisciInProgress(issue.key);
        return;
    }
};