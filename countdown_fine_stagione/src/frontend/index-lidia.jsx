import React, { useEffect, useMemo, useState } from 'react';
import ForgeReconciler, {
  Box,
  Heading,
  Inline,
  Lozenge,
  Stack,
  Strong,
  Text
} from '@forge/react';
import { invoke } from '@forge/bridge';

const fallbackConfig = {
  seasonStartIso: '2026-07-01T00:00:00+02:00',
  seasonName: 'Stagione corrente'
};

function getSeasonEndDate(seasonStart) {
  const result = new Date(seasonStart);

  // Esempio: inizio 1 luglio -> ultimo giorno di agosto.
  result.setMonth(result.getMonth() + 2);
  result.setDate(0);

  // Gli ultimi 2 giorni del mese restano fuori stagione.
  result.setDate(result.getDate() - 2);

  return result;
}

function getNextSeasonStartDate(seasonEnd) {
  const result = new Date(seasonEnd);

  // Vai al primo giorno del mese successivo alla fine stagione.
  result.setMonth(result.getMonth() + 1);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);

  return result;
}

function getRemaining(endDate, nowDate) {
  const diff = Math.max(0, endDate.getTime() - nowDate.getTime());
  const totalSeconds = Math.floor(diff / 1000);

  return {
    diff,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60
  };
}

function formatDate(date) {
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function Unit({ value, label }) {
  return (
    <Box padding="space.100">
      <Stack space="space.050">
        <Heading size="large">{String(value).padStart(2, '0')}</Heading>
        <Text>{label}</Text>
      </Stack>
    </Box>
  );
}

function App() {
  const [config, setConfig] = useState(fallbackConfig);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    invoke('getSeasonConfig')
      .then(setConfig)
      .catch(() => setConfig(fallbackConfig));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seasonStart = useMemo(
    () => new Date(config.seasonStartIso),
    [config.seasonStartIso]
  );

  const seasonEnd = useMemo(
    () => getSeasonEndDate(seasonStart),
    [seasonStart]
  );

  const nextSeasonStart = useMemo(
    () => getNextSeasonStartDate(seasonEnd),
    [seasonEnd]
  );

  const remaining = getRemaining(seasonEnd, now);
  const isFinished = remaining.diff === 0;

  return (
    <Box padding="space.200">
      <Stack space="space.200">
        <Inline alignBlock="center" spread="space-between">
          <Heading size="medium">{config.seasonName}</Heading>
          <Lozenge appearance={isFinished ? 'success' : 'inprogress'}>
            {isFinished ? 'Fuori stagione' : 'Attiva'}
          </Lozenge>
        </Inline>

        <Text>
          <Strong>{isFinished ? 'Stagione conclusa' : 'Tempo rimanente'}</Strong>
        </Text>

        <Inline space="space.200" shouldWrap>
          <Unit value={remaining.days} label="giorni" />
          <Unit value={remaining.hours} label="ore" />
          <Unit value={remaining.minutes} label="minuti" />
          <Unit value={remaining.seconds} label="secondi" />
        </Inline>

        <Text>Fine stagione: {formatDate(seasonEnd)}</Text>
        <Text>Prossima stagione: {formatDate(nextSeasonStart)}</Text>
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);