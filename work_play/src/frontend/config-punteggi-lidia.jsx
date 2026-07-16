import React, { useState, useEffect } from 'react';
import ForgeReconciler, {
  Text, Stack, Button, Textfield, Heading, Inline
} from '@forge/react';
import { invoke } from '@forge/bridge';

// Stessa griglia dell'admin, replicata qui per rendere la pagina autonoma.
const GRIGLIA_VAL = [
  { gruppo: 'risoluzione', titolo: 'Risoluzione', voci: [['autonomia', 'In autonomia'], ['collega', 'Con collega'], ['manager', 'Con manager']] },
  { gruppo: 'documentazione', titolo: 'Documentazione', voci: [['corretta', 'Corretta'], ['errata', 'Errata'], ['nessuna', 'Nessuna']] },
  { gruppo: 'feedback', titolo: 'Feedback', voci: [['positivo', 'Positivo'], ['negativo', 'Negativo'], ['nessuno', 'Nessuno']] },
];

const App = () => {
  const [caricato, setCaricato] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [messaggio, setMessaggio] = useState(null); // { tipo, testo }

  const [puntiPerTicket, setPuntiPerTicket] = useState('3');
  const [puntiPerAiuto, setPuntiPerAiuto] = useState('10');
  const [puntiVal, setPuntiVal] = useState(null);

  const carica = () =>
    Promise.all([
      invoke('getConfigPunti'),
      invoke('getConfigAiuto'),
      invoke('getConfigValutazione'),
    ]).then(([cPunti, cAiuto, cVal]) => {
      setPuntiPerTicket(String(cPunti.puntiPerTicket));
      setPuntiPerAiuto(String(cAiuto.puntiPerAiuto));
      const c = cVal.config;
      setPuntiVal({
        risoluzione: {
          autonomia: String(c.risoluzione.autonomia),
          collega: String(c.risoluzione.collega),
          manager: String(c.risoluzione.manager),
        },
        documentazione: {
          corretta: String(c.documentazione.corretta),
          errata: String(c.documentazione.errata),
          nessuna: String(c.documentazione.nessuna),
        },
        feedback: {
          positivo: String(c.feedback.positivo),
          negativo: String(c.feedback.negativo),
          nessuno: String(c.feedback.nessuno),
        },
      });
      setCaricato(true);
    });

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eseguiAzione = (nomeResolver, payload, testoSuccesso) => {
    if (inCorso) return;
    setInCorso(true);
    setMessaggio(null);
    invoke(nomeResolver, payload)
      .then((result) => {
        if (result && result.errore) {
          setMessaggio({ tipo: 'error', testo: result.errore });
          setInCorso(false);
          return;
        }
        setMessaggio({ tipo: 'success', testo: testoSuccesso });
        return carica().then(() => setInCorso(false));
      })
      .catch(() => {
        setMessaggio({ tipo: 'error', testo: 'Errore imprevisto. Riprova.' });
        setInCorso(false);
      });
  };

  const setPuntoVal = (gruppo, chiave, valore) => {
    setPuntiVal((prev) => ({ ...prev, [gruppo]: { ...prev[gruppo], [chiave]: valore } }));
  };

  const handleSalvaTicket = () =>
    eseguiAzione('setConfigPunti', { puntiPerTicket: Number(puntiPerTicket) }, `Punti per ticket impostati a ${puntiPerTicket}.`);

  const handleSalvaAiuto = () =>
    eseguiAzione('setConfigAiuto', { puntiPerAiuto: Number(puntiPerAiuto) }, `Punti per aiuto impostati a ${puntiPerAiuto}.`);

  const handleSalvaVal = () => {
    const config = {
      risoluzione: {
        autonomia: Number(puntiVal.risoluzione.autonomia),
        collega: Number(puntiVal.risoluzione.collega),
        manager: Number(puntiVal.risoluzione.manager),
      },
      documentazione: {
        corretta: Number(puntiVal.documentazione.corretta),
        errata: Number(puntiVal.documentazione.errata),
        nessuna: Number(puntiVal.documentazione.nessuna),
      },
      feedback: {
        positivo: Number(puntiVal.feedback.positivo),
        negativo: Number(puntiVal.feedback.negativo),
        nessuno: Number(puntiVal.feedback.nessuno),
      },
    };
    eseguiAzione('setConfigValutazione', { config }, 'Punteggi valutazione salvati.');
  };

  if (!caricato) return <Text>Caricamento configurazione punteggi...</Text>;

  return (
    <Stack space="space.400">
      <Heading>Configurazione Punteggi</Heading>
      <Text>Tutti i punteggi personalizzabili in un unico posto. La modifica è riservata al supervisore.</Text>

      {messaggio && (
        <Text color={messaggio.tipo === 'error' ? 'color.text.danger' : 'color.text.success'}>
          {messaggio.testo}
        </Text>
      )}

      <Stack space="space.100">
        <Heading size="small">🎯 Punti per ticket</Heading>
        <Text>Punti assegnati a ogni task completata. Vale dal prossimo aggiornamento.</Text>
        <Inline space="space.100" alignBlock="center">
          <Textfield type="number" value={puntiPerTicket} onChange={(e) => setPuntiPerTicket(e.target.value)} />
          <Button appearance="primary" isDisabled={inCorso} onClick={handleSalvaTicket}>Salva</Button>
        </Inline>
      </Stack>

      <Stack space="space.100">
        <Heading size="small">🤝 Punti per aiuto</Heading>
        <Text>Punti assegnati per ogni aiuto segnalato tra colleghi. Vale dalla prossima segnalazione.</Text>
        <Inline space="space.100" alignBlock="center">
          <Textfield type="number" value={puntiPerAiuto} onChange={(e) => setPuntiPerAiuto(e.target.value)} />
          <Button appearance="primary" isDisabled={inCorso} onClick={handleSalvaAiuto}>Salva</Button>
        </Inline>
      </Stack>

      {puntiVal && (
        <Stack space="space.100">
          <Heading size="small">⚖️ Punteggi autovalutazione</Heading>
          <Text>Punti reali per ogni scelta dell'autovalutazione. Ammessi decimali e negativi.</Text>
          {GRIGLIA_VAL.map((sez) => (
            <Stack key={sez.gruppo} space="space.050">
              <Text font={{ weight: 'bold' }}>{sez.titolo}</Text>
              <Inline space="space.200" shouldWrap>
                {sez.voci.map(([chiave, etichetta]) => (
                  <Stack key={chiave} space="space.050">
                    <Text>{etichetta}</Text>
                    <Textfield
                      type="number"
                      value={puntiVal[sez.gruppo][chiave]}
                      onChange={(e) => setPuntoVal(sez.gruppo, chiave, e.target.value)}
                    />
                  </Stack>
                ))}
              </Inline>
            </Stack>
          ))}
          <Inline>
            <Button appearance="primary" isDisabled={inCorso} onClick={handleSalvaVal}>
              Salva punteggi valutazione
            </Button>
          </Inline>
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