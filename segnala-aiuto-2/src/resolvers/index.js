import Resolver from '@forge/resolver';
import { asUser, route } from '@forge/api';
import { kvs } from '@forge/kvs';

const resolver = new Resolver();

const TEAM = [
  { nome: 'Roberto', accountId: '712020:a4ccdea1-0bb3-408f-9623-93c19691d980' },
  { nome: 'Alessandro', accountId: '712020:48b975fc-daa2-4bc8-92dd-f8bf751a454a' },
  { nome: 'Ludovica', accountId: '712020:c82776d1-c22b-4b85-ae3c-0110c541520f' },
  { nome: 'Matthia', accountId: '712020:68180304-900d-4cbe-ad8e-73695ad5b96d' },
  { nome: 'Lidia', accountId: '712020:5930294d-413c-434a-ae40-db82633bff30' },
];

const nomeDaAccountId = (accountId) =>
  TEAM.find((m) => m.accountId === accountId)?.nome || 'Sconosciuto';

// --- Snapshot posizioni per la colonna "Cambio" ---------------------------
// Forge non ha un cron: la fotografia delle posizioni viene aggiornata
// "pigramente", alla prima apertura della classifica di ogni giorno.
const dataOdierna = () => {
  const oggi = new Date();
  return `${oggi.getFullYear()}-${oggi.getMonth() + 1}-${oggi.getDate()}`;
};

// Riceve la classifica GIA' ORDINATA e aggiunge cambioPosizione a ogni membro.
// Positivo = salito in classifica, negativo = sceso, 0 = invariato.
const applicaCambioPosizione = async (classificaOrdinata) => {
  const snapshot = await kvs.get('classifica-aiuto-snapshot');

  const posizioniOggi = {};
  classificaOrdinata.forEach((u, i) => {
    posizioniOggi[u.accountId] = i + 1;
  });

  // Leggiamo lo snapshot PRIMA di riscriverlo, altrimenti confronteremmo
  // la classifica con se stessa e il cambio sarebbe sempre 0.
  const risultato = classificaOrdinata.map((utente, index) => {
    const posizioneAttuale = index + 1;
    const posizionePrecedente = snapshot?.posizioni?.[utente.accountId];

    // Nessuno snapshot (primo avvio) o membro non ancora fotografato.
    if (!posizionePrecedente) {
      return { ...utente, cambioPosizione: 0 };
    }

    // Salire significa che il numero di posizione DIMINUISCE:
    // da 4° a 2° = 4 - 2 = +2.
    return { ...utente, cambioPosizione: posizionePrecedente - posizioneAttuale };
  });

  // Nuovo giorno (o primo avvio) -> aggiorniamo la fotografia.
  const oggi = dataOdierna();
  if (!snapshot || snapshot.data !== oggi) {
    await kvs.set('classifica-aiuto-snapshot', {
      data: oggi,
      posizioni: posizioniOggi,
    });
  }

  return risultato;
};

resolver.define('segnalaAiuto', async (req) => {
  const { collegaId, issueKey, descrizione } = req.payload;
  const segnalatoDa = req.context.accountId;

  const response = await asUser().requestJira(
    route`/rest/api/3/issue/ITS-193/properties/punti-aiuto-${collegaId}`
  );

  let puntiAttuali = 0;
  let aiuti = [];
  if (response.status === 200) {
    const data = await response.json();
    puntiAttuali = data.value?.punti || 0;
    aiuti = Array.isArray(data.value?.aiuti) ? data.value.aiuti : [];
  }

  const nuovoAiuto = {
    descrizione: (descrizione || '').trim(),
    segnalatoDa,
    segnalatoDaNome: nomeDaAccountId(segnalatoDa),
    issueKey: issueKey || null,
    data: Date.now(),
  };

  await asUser().requestJira(
    route`/rest/api/3/issue/ITS-193/properties/punti-aiuto-${collegaId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        punti: puntiAttuali + 10,
        segnalatoDa,
        ultimoTicket: issueKey,
        aiuti: [...aiuti, nuovoAiuto],
      }),
    }
  );

  return { success: true, nuoviPunti: puntiAttuali + 10 };
});

resolver.define('getAiutiTicket', async (req) => {
  const { issueKey } = req.payload;
  const risultati = [];

  await Promise.all(
    TEAM.map(async (membro) => {
      const response = await asUser().requestJira(
        route`/rest/api/3/issue/ITS-193/properties/punti-aiuto-${membro.accountId}`
      );

      if (response.status === 200) {
        const data = await response.json();
        const aiuti = Array.isArray(data.value?.aiuti) ? data.value.aiuti : [];
        aiuti
          .filter((a) => a.issueKey === issueKey)
          .forEach((a) => {
            risultati.push({
              collegaNome: membro.nome,
              descrizione: a.descrizione || '',
              segnalatoDaNome: a.segnalatoDaNome || nomeDaAccountId(a.segnalatoDa),
              data: a.data || 0,
            });
          });
      }
    })
  );

  return risultati.sort((a, b) => (b.data || 0) - (a.data || 0));
});

resolver.define('getClassificaAiuto', async () => {
  console.log('getClassificaAiuto chiamato!');

  const classifica = await Promise.all(
    TEAM.map(async (membro) => {
      const response = await asUser().requestJira(
        route`/rest/api/3/issue/ITS-193/properties/punti-aiuto-${membro.accountId}`
      );

      let punti = 0;
      let numeroAiuti = 0;

      if (response.status === 200) {
        const data = await response.json();
        punti = data.value?.punti || 0;
        numeroAiuti = Math.floor(punti / 10);
      }

      return {
        nome: membro.nome,
        accountId: membro.accountId,
        punti,
        numeroAiuti,
      };
    })
  );

  const ordinata = classifica.sort((a, b) => b.punti - a.punti);
  return applicaCambioPosizione(ordinata);
});

export const handler = resolver.getDefinitions();