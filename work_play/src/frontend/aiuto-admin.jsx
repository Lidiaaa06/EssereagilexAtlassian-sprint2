import React, { useState, useEffect } from 'react';
import ForgeReconciler, {
  Text, Stack, Button, Textfield, Heading, Inline
} from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  const [config, setConfig] = useState(null); // { puntiPerAiuto, isSupervisore }
  const [nuovoValore, setNuovoValore] = useState('');
  const [messaggio, setMessaggio] = useState('');
  const [loading, setLoading] = useState(false);

  const carica = () => {
    invoke('getConfigAiuto').then((c) => {
      setConfig(c);
      setNuovoValore(String(c.puntiPerAiuto));
    });
  };

  useEffect(() => {
    carica();
  }, []);

  if (!config) return <Text>Caricamento...</Text>;

  const handleSalva = async () => {
    setMessaggio('');
    setLoading(true);
    try {
      const res = await invoke('setConfigAiuto', { puntiPerAiuto: Number(nuovoValore) });
      if (res?.errore) {
        setMessaggio(res.errore);
      } else {
        setMessaggio('Punti aggiornati!');
        carica();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack space="space.200">
      <Heading>Configurazione Punti Aiuto</Heading>
      <Text>Punti assegnati per ogni aiuto segnalato tra colleghi. Vale dalla prossima segnalazione.</Text>
      {!config.isSupervisore && (
        <Text>Solo un supervisore può modificare questo valore.</Text>
      )}
      <Inline space="space.100" alignBlock="center">
        <Textfield
          type="number"
          value={nuovoValore}
          onChange={(e) => setNuovoValore(e.target.value)}
          isDisabled={!config.isSupervisore}
        />
        <Button
          appearance="primary"
          isDisabled={!config.isSupervisore || loading}
          onClick={handleSalva}
        >
          {loading ? 'Salvataggio...' : 'Salva'}
        </Button>
      </Inline>
      {messaggio !== '' && <Text>{messaggio}</Text>}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);