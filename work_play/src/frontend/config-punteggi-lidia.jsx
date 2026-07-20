import React, { useState, useEffect } from 'react';
import ForgeReconciler, {
  Text, Stack, Button, Textfield, Heading, Inline
} from '@forge/react';
import { invoke } from '@forge/bridge';

// Stessa griglia dell'admin, replicata qui per rendere la pagina autonoma.
// Solo le CHIAVI sono fisse: domanda ed etichette si modificano da testiVal.
const GRIGLIA_VAL = [
  { gruppo: 'risoluzione', titolo: 'Risoluzione', chiavi: ['autonomia', 'collega', 'manager'] },
  { gruppo: 'documentazione', titolo: 'Documentazione', chiavi: ['corretta', 'errata', 'nessuna'] },
  { gruppo: 'feedback', titolo: 'Feedback', chiavi: ['positivo', 'negativo', 'nessuno'] },
];

const App = () => {
  const [caricato, setCaricato] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [messaggio, setMessaggio] = useState(null); // { tipo, testo }

  const [puntiPerWorkitem, setPuntiPerWorkitem] = useState('3');
  const [puntiPerAiuto, setPuntiPerAiuto] = useState('10');
  const [puntiVal, setPuntiVal] = useState(null);
  // Domande ed etichette configurabili: { gruppo: { domanda, opzioni: { chiave: etichetta } } }
  const [testiVal, setTestiVal] = useState(null);

  const carica = () =>
    Promise.all([
      invoke('getConfigPunti'),
      invoke('getConfigAiuto'),
      invoke('getConfigValutazione'),
      invoke('getTestiValutazione'),
    ]).then(([cPunti, cAiuto, cVal, cTesti]) => {
      setPuntiPerWorkitem(String(cPunti.puntiPerTicket));
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
      setTestiVal(cTesti.testi);
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

  const setDomanda = (gruppo, valore) => {
    setTestiVal((prev) => ({ ...prev, [gruppo]: { ...prev[gruppo], domanda: valore } }));
  };

  const setEtichetta = (gruppo, chiave, valore) => {
    setTestiVal((prev) => ({
      ...prev,
      [gruppo]: { ...prev[gruppo], opzioni: { ...prev[gruppo].opzioni, [chiave]: valore } },
    }));
  };

  const handleSalvaWorkitem = () =>
    eseguiAzione('setConfigPunti', { puntiPerTicket: Number(puntiPerWorkitem) }, `Punti per workitem impostati a ${puntiPerWorkitem}.`);

  const handleSalvaAiuto = () =>
    eseguiAzione('setConfigAiuto', { puntiPerAiuto: Number(puntiPerAiuto) }, `Punti per aiuto impostati a ${puntiPerAiuto}.`);

  const handleSalvaVal = () => {
    if (inCorso) return;
    setInCorso(true);
    setMessaggio(null);

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

    Promise.all([
      invoke('setConfigValutazione', { config }),
      invoke('setTestiValutazione', { testi: testiVal }),
    ])
      .then(([resConfig, resTesti]) => {
        const errore = resConfig?.errore || resTesti?.errore;
        if (errore) {
          setMessaggio({ tipo: 'error', testo: errore });
          setInCorso(false);
          return;
        }
        setMessaggio({ tipo: 'success', testo: 'Domande e punteggi valutazione salvati.' });
        return carica().then(() => setInCorso(false));
      })
      .catch(() => {
        setMessaggio({ tipo: 'error', testo: 'Errore imprevisto. Riprova.' });
        setInCorso(false);
      });
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
        <Heading size="small">🎯 Punti per workitem</Heading>
        <Text>Punti assegnati a ogni task completata. Vale dal prossimo aggiornamento.</Text>
        <Inline space="space.100" alignBlock="center">
          <Textfield type="number" value={puntiPerWorkitem} onChange={(e) => setPuntiPerWorkitem(e.target.value)} />
          <Button appearance="primary" isDisabled={inCorso} onClick={handleSalvaWorkitem}>Salva</Button>
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

      {puntiVal && testiVal && (
        <Stack space="space.200">
          <Heading size="small">⚖️ Domande e punteggi autovalutazione</Heading>
          <Text>Testo delle domande, etichette delle risposte e punti reali assegnati a ogni scelta. Ammessi decimali e negativi per i punti.</Text>
          {GRIGLIA_VAL.map((sez) => (
            <Stack key={sez.gruppo} space="space.100">
              <Text font={{ weight: 'bold' }}>{sez.titolo}</Text>

              <Text>Domanda mostrata all'operatore</Text>
              <Textfield
                value={testiVal[sez.gruppo].domanda}
                onChange={(e) => setDomanda(sez.gruppo, e.target.value)}
              />

              <Inline space="space.200" shouldWrap>
                {sez.chiavi.map((chiave) => (
                  <Stack key={chiave} space="space.050">
                    <Text>Etichetta risposta</Text>
                    <Textfield
                      value={testiVal[sez.gruppo].opzioni[chiave]}
                      onChange={(e) => setEtichetta(sez.gruppo, chiave, e.target.value)}
                    />
                    <Text>Punti</Text>
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
              Salva domande e punteggi valutazione
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