import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Heading,
  Stack,
  Text
} from '@forge/react';
import { invoke } from '@forge/bridge';

function App() {
  const [data, setData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  async function loadData() {
    try {
      const result = await invoke('getLegacyPointsData');
      setData(result);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage('Errore nel caricamento dei punti legacy.');
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
          <Heading size="medium">Punti Legacy</Heading>
          <Text>{errorMessage}</Text>
        </Stack>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box padding="space.200">
        <Text>Caricamento punti totali...</Text>
      </Box>
    );
  }

  return (
    <Box padding="space.200">
      <Stack space="space.200">
        <Heading size="medium">Punti Legacy</Heading>
        <Heading size="large">{data.points} punti</Heading>
        <Text>Ogni task completata vale {data.pointsPerTask} punti</Text>
        <Text>Task totali completate: {data.completedCount}</Text>
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);