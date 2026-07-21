import React, { useState, useEffect } from "react";
import { Text, Heading, Stack, Box, Inline, Lozenge, SectionMessage } from "@forge/react";
import { invoke } from "@forge/bridge";

// Formatta un timestamp (ms) come data leggibile in italiano.
// Formatto in UTC di proposito: i confini di stagione sono calcolati dal backend
// in UTC (vedi calcolaFineStagione in stagione.js), quindi mostrarli nel fuso
// locale li sfaserebbe di 1-2 ore facendo "scivolare" il giorno. In UTC la
// stringa combacia con i valori reali (es. fine = 29 ago 23:59, non 30 ago 01:59).
const formatData = (ms) =>
  new Intl.DateTimeFormat('it-IT', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(ms));

// Scompone il tempo rimanente (fino a fineMs) in giorni/ore/minuti/secondi.
const getRemaining = (fineMs, nowMs) => {
  const diff = Math.max(0, fineMs - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  return {
    diff,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
};

// Singola cella del countdown (numero grande + etichetta).
const Unit = ({ value, label }) => (
  <Box padding="space.150" backgroundColor="color.background.neutral">
    <Stack space="space.050" alignInline="center">
      <Heading>{String(value).padStart(2, '0')}</Heading>
      <Text>{label}</Text>
    </Stack>
  </Box>
);

export const CountdownView = () => {
  const [dati, setDati] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Dati stagione reali (una volta).
  useEffect(() => {
    invoke('getDatiStagioneCountdown').then(setDati);
  }, []);

  // Tick locale ogni secondo: aggiorna solo "now", i calcoli derivano da lì.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!dati) return <Text>Caricamento countdown...</Text>;
  if (!dati.attiva) return <Text>Nessuna stagione attiva al momento.</Text>;

  // Tre fasi ricavate dai timestamp (restano corrette mentre il timer scorre):
  // attiva → conto verso la fine; pausa (i 2 giorni tra fine e nuova stagione) →
  // conto verso l'inizio della prossima; conclusa → in attesa dell'avvio.
  let fase;
  if (now <= dati.fineMs) fase = 'attiva';
  else if (now < dati.inizioProssimaMs) fase = 'pausa';
  else fase = 'conclusa';

  // Countdown: in fase attiva verso la fine, in pausa verso la nuova stagione.
  const target = fase === 'pausa' ? dati.inizioProssimaMs : dati.fineMs;
  const remaining = getRemaining(target, now);

  // Banner colorato solo in fase attiva, in base ai giorni alla fine (soglie ≤).
  let banner = null;
  if (fase === 'attiva') {
    if (remaining.days < 1) {
      banner = { appearance: 'error', testo: `Ultime ore! La stagione termina il ${formatData(dati.fineMs)}.` };
    } else if (remaining.days <= 3) {
      banner = { appearance: 'warning', testo: `Mancano meno di 3 giorni alla fine della stagione (${formatData(dati.fineMs)}).` };
    } else if (remaining.days <= 7) {
      banner = { appearance: 'success', testo: `Ultima settimana: la stagione termina il ${formatData(dati.fineMs)}.` };
    }
  }

  const etichettaStato =
    fase === 'attiva' ? 'Attiva' : fase === 'pausa' ? 'In pausa' : 'Fuori stagione';
  const titoloConto =
    fase === 'attiva' ? 'Tempo rimanente'
    : fase === 'pausa' ? 'Stagione in pausa — la nuova stagione inizia tra'
    : 'Stagione conclusa';

  return (
    <Stack space="space.200">
      <Inline space="space.100" alignBlock="center">
        <Heading>⏳ Fine stagione — Stagione {dati.numero}</Heading>
        <Lozenge appearance={fase === 'attiva' ? 'inprogress' : fase === 'pausa' ? 'moved' : 'success'}>
          {etichettaStato}
        </Lozenge>
      </Inline>

      {banner && (
        <SectionMessage appearance={banner.appearance}>
          <Text>{banner.testo}</Text>
        </SectionMessage>
      )}

      <Text font={{ weight: 'bold' }}>{titoloConto}</Text>

      {fase !== 'conclusa' && (
        <Inline space="space.200" shouldWrap>
          <Unit value={remaining.days} label="giorni" />
          <Unit value={remaining.hours} label="ore" />
          <Unit value={remaining.minutes} label="minuti" />
          <Unit value={remaining.seconds} label="secondi" />
        </Inline>
      )}

      <Text>Fine stagione: {formatData(dati.fineMs)}</Text>
      <Text>Prossima stagione: {formatData(dati.inizioProssimaMs)}</Text>
    </Stack>
  );
};
