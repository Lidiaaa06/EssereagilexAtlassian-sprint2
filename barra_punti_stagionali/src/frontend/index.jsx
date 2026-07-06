import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Heading,
  Inline,
  Lozenge,
  ProgressBar,
  Stack,
  Strong,
  Text
} from '@forge/react';
import { invoke } from '@forge/bridge';

function formatDate(dateIso) {
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date(dateIso));
}

function App() {
  const [data, setData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  async function loadData() {
    try {
      const result = await invoke('getSeasonPointsData');
      setData(result);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage('Errore nel caricamento dei punti personali.');
    }
  }

  useEffect(() => {
    loadData();

    const timer = setInterval(loadData, 15000);
    return () => clearInterval(timer);
  }, []);

  if (errorMessage) {
    return (
      <Box padding="space.200">
        <Stack space="space.100">
          <Heading size="medium">Punti stagionali</Heading>
          <Text>{errorMessage}</Text>
        </Stack>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box padding="space.200">
        <Text>Caricamento punti personali...</Text>
      </Box>
    );
  }

  const progress = data.nextMilestone > 0
    ? Math.min(data.points / data.nextMilestone, 1)
    : 0;

  return (
    <Box padding="space.200">
      <Stack space="space.200">
        <Inline alignBlock="center" spread="space-between">
          <Heading size="medium">Punti stagionali</Heading>
          <Lozenge appearance={data.isActive ? 'inprogress' : 'default'}>
            {data.isActive ? 'Attiva' : 'Fuori stagione'}
          </Lozenge>
        </Inline>

        <Text>
          <Strong>{data.seasonName}</Strong>
        </Text>

        <Heading size="large">{data.points} punti</Heading>

        <ProgressBar
          value={progress}
          ariaLabel="Accumulo punti personali stagionali"
        />

        <Text>Ogni task completata vale {data.pointsPerTask} punti</Text>
        <Text>Prossimo traguardo visuale: {data.nextMilestone} punti</Text>
        <Text>Fine stagione: {formatDate(data.seasonEndIso)}</Text>
        <Text>Reset automatico: {formatDate(data.nextSeasonStartIso)}</Text>
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);