import React, { useState, useEffect } from 'react';
import ForgeReconciler, { Text, Heading, Stack, Button, RadioGroup, Select, Lozenge, Inline, SectionMessage, TextArea, Box } from '@forge/react';
import { invoke } from '@forge/bridge';

const Panel = () => {
  const [risoluzione, setRisoluzione] = useState(null);
  const [documentazione, setDocumentazione] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [inviato, setInviato] = useState(false);
  const [isDone, setIsDone] = useState(null);
  const [issueKey, setIssueKey] = useState(null);
  const [aggiuntoHOF, setAggiuntoHOF] = useState(false);
  const [erroreHOF, setErroreHOF] = useState(null);
  // Segnala aiuto
  const [membriAiuto, setMembriAiuto] = useState([]);
  const [mioAccountId, setMioAccountId] = useState(null);
  const [collegaAiuto, setCollegaAiuto] = useState(null);
  const [aiutoInviato, setAiutoInviato] = useState(false);
  const [erroreAiuto, setErroreAiuto] = useState(null);
  const [loadingAiuto, setLoadingAiuto] = useState(false);
  const [descrizioneAiuto, setDescrizioneAiuto] = useState('');
  const [aiutiTicket, setAiutiTicket] = useState([]);
  // Golden ticket
  const [gtState, setGtState] = useState(null);
  const [gtBusy, setGtBusy] = useState(false);
  const [gtMsg, setGtMsg] = useState(null);
  const [gtPending, setGtPending] = useState(false);

  useEffect(() => {
    invoke('getIssueStatus').then(result => {
      setIsDone(result.isDone);
      setIssueKey(result.issueKey);
      if (result.issueKey) {
        invoke('getAiutiTicket', { issueKey: result.issueKey }).then((r) => setAiutiTicket(r || []));
      }
    });
    invoke('getMembriPerAiuto').then((res) => {
      setMembriAiuto(res.membri || []);
      setMioAccountId(res.mioAccountId || null);
    });
    invoke('getGoldenTicketState').then((s) => {
      setGtState(s);
      // Se ha appena guadagnato un ticket, mostra il banner e azzera il flag lato server.
      if (s && s.pendingNotice) {
        setGtPending(true);
        invoke('dismissGoldenTicketNotice');
      }
    });
  }, []);

  const handleSubmit = () => {
    if (!risoluzione || !documentazione || !feedback) return;
    invoke('valutaTicket', { risoluzione, documentazione, feedback }).then(() => {
      setInviato(true);
    });
  };

  const handleHallOfFame = () => {
    invoke('richiediHallOfFame', { issueKey }).then((res) => {
      if (res && res.errore) {
        setErroreHOF(res.errore);
        return;
      }
      setAggiuntoHOF(true);
    });
  };

  const handleSegnalaAiuto = () => {
    if (!collegaAiuto || loadingAiuto) return;
    setLoadingAiuto(true);
    setErroreAiuto(null);
    invoke('segnalaAiuto', {
      collegaId: collegaAiuto.value,
      collegaNome: collegaAiuto.label,
      issueKey,
      descrizione: descrizioneAiuto.trim(),
    }).then((res) => {
      if (res && res.errore) {
        setErroreAiuto(res.errore);
        setLoadingAiuto(false);
        return;
      }
      setAiutoInviato(true);
      setLoadingAiuto(false);
      invoke('getAiutiTicket', { issueKey }).then((r) => setAiutiTicket(r || []));
    }).catch(() => {
      setErroreAiuto('Errore imprevisto. Riprova.');
      setLoadingAiuto(false);
    });
  };

  const handleRedeem = () => {
    if (gtBusy) return;
    setGtBusy(true);
    setGtMsg(null);
    invoke('redeemGoldenTicket').then((res) => {
      if (res.ok) {
        setGtState((s) => ({ ...s, balance: res.balance }));
        setGtMsg('✅ Golden ticket usato. Il supervisore è stato avvisato.');
      } else if (res.reason === 'no_tickets') {
        setGtMsg('⚠️ Nessun golden ticket disponibile.');
      } else if (res.reason === 'no_issue') {
        setGtMsg('⚠️ Nessuna issue rilevata.');
      } else {
        setGtMsg('⚠️ Non è stato possibile usare il ticket.');
      }
      setGtBusy(false);
    }).catch(() => {
      setGtMsg('⚠️ Errore imprevisto. Riprova.');
      setGtBusy(false);
    });
  };

  if (isDone === null) return <Text>Caricamento...</Text>;

  // Colleghi selezionabili: tutti i membri tranne me stesso.
  const opzioniColleghi = membriAiuto
    .filter((m) => m.accountId !== mioAccountId)
    .map((m) => ({ label: m.nome, value: m.accountId }));

  return (
    <Stack space="space.200">

      {/* Sezione Golden ticket — SEMPRE visibile, anche a ticket non Done:
          serve proprio quando sei bloccato e chiedi aiuto al supervisore. */}
      <Heading>🎫 Golden ticket</Heading>
      {gtState === null ? (
        <Text>Caricamento golden ticket...</Text>
      ) : (
        <Stack space="space.100">
          {gtPending && (
            <SectionMessage appearance="success">
              <Text>🎉 Hai guadagnato un golden ticket! Hai raggiunto la soglia stagionale.</Text>
            </SectionMessage>
          )}
          <Inline space="space.100" alignBlock="center">
            <Text>Golden ticket disponibili:</Text>
            <Lozenge appearance={gtState.balance > 0 ? 'success' : 'removed'}>{String(gtState.balance)}</Lozenge>
          </Inline>
          {gtMsg && <Text>{gtMsg}</Text>}
          <Button
            appearance="primary"
            isDisabled={gtState.balance <= 0 || gtBusy}
            onClick={handleRedeem}
          >
            {gtBusy ? 'Invio...' : '🎫 Usa golden ticket'}
          </Button>
        </Stack>
      )}

      {!isDone ? (
        <Text>🔒 Sblocca la valutazione portando il ticket in Done!</Text>
      ) : (
        <>

      {/* Sezione Hall of Fame */}
      <Heading>🏛️ Hall of Fame</Heading>
      {aggiuntoHOF ? (
        <Text>✅ Richiesta inviata! In attesa di approvazione del supervisore.</Text>
      ) : (
        <Stack space="space.100">
          <Button appearance="warning" onClick={handleHallOfFame}>
            🏛️ Richiedi inserimento in Hall of Fame
          </Button>
          {erroreHOF && <Text>⚠️ {erroreHOF}</Text>}
        </Stack>
      )}

      {/* Sezione Segnala aiuto */}
      <Heading>🤝 Segnala aiuto</Heading>
      {aiutoInviato ? (
        <Text>✅ Aiuto segnalato! Grazie per aver riconosciuto un collega.</Text>
      ) : (
        <Stack space="space.100">
          <Text>Un collega ti ha aiutato su questo ticket? Segnalalo (+10 punti aiuto per lui).</Text>
          <Select
            options={opzioniColleghi}
            value={collegaAiuto}
            onChange={setCollegaAiuto}
            placeholder="Seleziona un collega..."
          />
          <TextArea
            value={descrizioneAiuto}
            onChange={(e) => setDescrizioneAiuto(e.target.value)}
            placeholder="Descrivi l'aiuto ricevuto (facoltativo)..."
          />
          <Button
            appearance="primary"
            isDisabled={!collegaAiuto || loadingAiuto}
            onClick={handleSegnalaAiuto}
          >
            {loadingAiuto ? 'Invio...' : 'Segnala aiuto (+10)'}
          </Button>
          {erroreAiuto && <Text>⚠️ {erroreAiuto}</Text>}
        </Stack>
      )}
      {aiutiTicket.length > 0 && (
        <Stack space="space.100">
          <Text font={{ weight: 'bold' }}>Aiuti segnalati su questo ticket</Text>
          {aiutiTicket.map((a, i) => (
            <Box key={i} padding="space.150" backgroundColor="color.background.neutral">
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

      {/* Sezione Valutazione */}
      {inviato ? (
        <Stack space="space.200">
          <Heading>✅ Valutazione inviata!</Heading>
          <Text>I tuoi punti sono stati aggiornati.</Text>
        </Stack>
      ) : (
        <Stack space="space.200">
          <Heading>📋 Valutazione ticket (Rispondi sinceramente, il ticket verrà riesaminato dal tuo supervisore)</Heading>

          <Text>Come hai risolto il ticket?</Text>
          <RadioGroup
            name="risoluzione"
            options={[
              { label: '🧠 In autonomia (+3 punti)', value: 'autonomia' },
              { label: '🤝 Con aiuto di un collega (+2 punti)', value: 'collega' },
              { label: '👔 Con aiuto del manager (+0.5 punti)', value: 'manager' },
            ]}
            onChange={(e) => setRisoluzione(e.target.value)}
          />

          <Text>Hai documentato la soluzione?</Text>
          <RadioGroup
            name="documentazione"
            options={[
              { label: '✅ Sì, correttamente (+2 punti)', value: 'corretta' },
              { label: '⚠️ Sì, ma in modo errato (-1.5 punti)', value: 'errata' },
              { label: '❌ No (0 punti)', value: 'nessuna' },
            ]}
            onChange={(e) => setDocumentazione(e.target.value)}
          />

          <Text>Il cliente ha dato feedback?</Text>
          <RadioGroup
            name="feedback"
            options={[
              { label: '😊 Positivo (+3.5 punti)', value: 'positivo' },
              { label: '😞 Negativo (-2 punti)', value: 'negativo' },
              { label: '😐 Nessun feedback (0 punti)', value: 'nessuno' },
            ]}
            onChange={(e) => setFeedback(e.target.value)}
          />

          <Button
            appearance="primary"
            onClick={handleSubmit}
            isDisabled={!risoluzione || !documentazione || !feedback}
          >
            Invia valutazione
          </Button>
        </Stack>
      )}
        </>
      )}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <Panel />
  </React.StrictMode>
);