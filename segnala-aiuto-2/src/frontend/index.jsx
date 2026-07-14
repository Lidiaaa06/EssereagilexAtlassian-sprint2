import React, { useState } from 'react';
import ForgeReconciler, {
  Text, Stack, Button, Select, useProductContext
} from '@forge/react';
import { invoke } from '@forge/bridge';

const TEAM = [
  { label: 'Roberto', value: '712020:a4ccdea1-0bb3-408f-9623-93c19691d980' },
  { label: 'Alessandro', value: '712020:48b975fc-daa2-4bc8-92dd-f8bf751a454a' },
  { label: 'Ludovica', value: '712020:c82776d1-c22b-4b85-ae3c-0110c541520f' },
  { label: 'Matthia', value: '712020:68180304-900d-4cbe-ad8e-73695ad5b96d' },
  { label: 'Lidia', value: '712020:5930294d-413c-434a-ae40-db82633bff30' },
];

const App = () => {
  const context = useProductContext();
  const [collegaSelezionato, setCollegaSelezionato] = useState(null);
  const [inviato, setInviato] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!context) return <Text>Caricamento...</Text>;

  const issueKey = context?.extension?.issue?.key;
  const accountIdCorrente = context?.accountId;
  const teamFiltrato = TEAM.filter(m => m.value !== accountIdCorrente);

  const handleSegnala = async () => {
    if (!collegaSelezionato) return;
    setLoading(true);
    try {
      await invoke('segnalaAiuto', {
        collegaId: collegaSelezionato.value,
        collegaNome: collegaSelezionato.label,
        issueKey,
      });
      setInviato(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (inviato) {
    return (
      <Stack space="space.200">
        <Text>Aiuto segnalato a {collegaSelezionato.label}! +10 punti assegnati.</Text>
        <Button onClick={() => { setInviato(false); setCollegaSelezionato(null); }}>
          Segnala un altro
        </Button>
      </Stack>
    );
  }

  return (
    <Stack space="space.200">
      <Text>Chi ti ha aiutato su questo ticket?</Text>
      <Select
        options={teamFiltrato}
        value={collegaSelezionato}
        onChange={setCollegaSelezionato}
        placeholder="Seleziona un collega..."
      />
      <Button
        appearance="primary"
        isDisabled={!collegaSelezionato || loading}
        onClick={handleSegnala}
      >
        {loading ? 'Invio...' : 'Segnala Aiuto (+10 punti)'}
      </Button>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);