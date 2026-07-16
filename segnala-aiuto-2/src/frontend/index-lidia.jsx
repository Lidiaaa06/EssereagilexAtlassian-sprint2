import React, { useState, useEffect } from 'react';
import ForgeReconciler, {
  Text, Stack, Button, Select, TextArea, Box, Heading, useProductContext
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
  const [descrizione, setDescrizione] = useState('');
  const [inviato, setInviato] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiutiTicket, setAiutiTicket] = useState([]);

  const issueKey = context?.extension?.issue?.key;
  const accountIdCorrente = context?.accountId;

  const caricaAiuti = () => {
    if (!issueKey) return;
    invoke('getAiutiTicket', { issueKey }).then((res) => setAiutiTicket(res || []));
  };

  useEffect(() => {
    caricaAiuti();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueKey]);

  if (!context) return <Text>Caricamento...</Text>;

  const teamFiltrato = TEAM.filter(m => m.value !== accountIdCorrente);

  const handleSegnala = async () => {
    if (!collegaSelezionato) return;
    setLoading(true);
    try {
      await invoke('segnalaAiuto', {
        collegaId: collegaSelezionato.value,
        collegaNome: collegaSelezionato.label,
        issueKey,
        descrizione: descrizione.trim(),
      });
      setInviato(true);
      caricaAiuti();
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
        {descrizione.trim() !== '' && (
          <Text>Descrizione aiuto: "{descrizione.trim()}"</Text>
        )}
        <Button onClick={() => {
          setInviato(false);
          setCollegaSelezionato(null);
          setDescrizione('');
        }}>
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

      <Text>Descrivi l'aiuto ricevuto (facoltativo)</Text>
      <TextArea
        value={descrizione}
        onChange={(e) => setDescrizione(e.target.value)}
        placeholder="Es. Mi ha aiutato a risolvere un bug sul login e a fare il deploy..."
        resize="vertical"
      />

      <Button
        appearance="primary"
        isDisabled={!collegaSelezionato || loading}
        onClick={handleSegnala}
      >
        {loading ? 'Invio...' : 'Segnala Aiuto (+10 punti)'}
      </Button>

      {aiutiTicket.length > 0 && (
        <Stack space="space.100">
          <Heading size="small">Aiuti segnalati su questo ticket</Heading>
          {aiutiTicket.map((a, i) => (
            <Box
              key={i}
              padding="space.150"
              backgroundColor="color.background.neutral"
            >
              <Stack space="space.050">
                <Text font={{ weight: 'bold' }}>{a.collegaNome}</Text>
                <Text>
                  {a.descrizione && a.descrizione.trim() !== ''
                    ? a.descrizione
                    : '(nessuna descrizione fornita)'}
                </Text>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);