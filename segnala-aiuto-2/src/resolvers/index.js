import Resolver from '@forge/resolver';
import { asUser, route } from '@forge/api';

const resolver = new Resolver();

const TEAM = [
  { nome: 'Roberto', accountId: '712020:a4ccdea1-0bb3-408f-9623-93c19691d980' },
  { nome: 'Alessandro', accountId: '712020:48b975fc-daa2-4bc8-92dd-f8bf751a454a' },
  { nome: 'Ludovica', accountId: '712020:c82776d1-c22b-4b85-ae3c-0110c541520f' },
  { nome: 'Matthia', accountId: '712020:68180304-900d-4cbe-ad8e-73695ad5b96d' },
  { nome: 'Lidia', accountId: '712020:5930294d-413c-434a-ae40-db82633bff30' },
];

resolver.define('segnalaAiuto', async (req) => {
  const { collegaId, issueKey } = req.payload;
  const segnalatoDa = req.context.accountId;


  const response = await asUser().requestJira(
    route`/rest/api/3/issue/ITS-193/properties/punti-aiuto-${collegaId}`
  );


  let puntiAttuali = 0;
  if (response.status === 200) {
    const data = await response.json();
    puntiAttuali = data.value?.punti || 0;
  }

  const putResponse = await asUser().requestJira(
    route`/rest/api/3/issue/ITS-193/properties/punti-aiuto-${collegaId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        punti: puntiAttuali + 10,
        segnalatoDa,
        ultimoTicket: issueKey,
      }),
    }
  );


  return { success: true, nuoviPunti: puntiAttuali + 10 };
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
        punti,
        numeroAiuti,
      };
    })
  );

  return classifica.sort((a, b) => b.punti - a.punti);
});

export const handler = resolver.getDefinitions();