import React, { useState, useEffect } from 'react';
import ForgeReconciler, { Text, Heading, Stack, Button, RadioGroup } from '@forge/react';
import { invoke } from '@forge/bridge';

// Chiavi fisse delle opzioni per gruppo: il TESTO (domanda ed etichette) è
// configurabile dal supervisore, ma il numero di domande/opzioni resta fisso.
const CHIAVI_OPZIONI = {
    risoluzione: ['autonomia', 'collega', 'manager'],
    documentazione: ['corretta', 'errata', 'nessuna'],
    feedback: ['positivo', 'negativo', 'nessuno'],
};

const Panel = () => {
    const [risoluzione, setRisoluzione] = useState(null);
    const [documentazione, setDocumentazione] = useState(null);
    const [feedback, setFeedback] = useState(null);
    const [isDone, setIsDone] = useState(null);
    const [issueKey, setIssueKey] = useState(null);
    const [aggiuntoHOF, setAggiuntoHOF] = useState(false);
    // Stato valutazione su questo workitem: undefined = caricamento, null = non valutato,
    // altrimenti 'congelata' | 'confermata' | 'modificata' | 'rifiutata'
    const [statoVal, setStatoVal] = useState(undefined);
    // Domande ed etichette configurate dal supervisore (null finché non caricate)
    const [testi, setTesti] = useState(null);

    useEffect(() => {
        invoke('getIssueStatus').then(result => {
            setIsDone(result.isDone);
            setIssueKey(result.issueKey);
            invoke('getStatoValutazione', { issueKey: result.issueKey }).then(r => {
                setStatoVal(r.stato);
            });
        });
        invoke('getTestiValutazione').then(r => setTesti(r.testi));
    }, []);

    const handleSubmit = () => {
        if (!risoluzione || !documentazione || !feedback) return;
        invoke('valutaTicket', { issueKey, risoluzione, documentazione, feedback }).then((res) => {
            if (res && res.errore) return; // già valutato: lo stato verrà mostrato
            setStatoVal('congelata');
        });
    };

    const [erroreHOF, setErroreHOF] = useState(null);

    const handleHallOfFame = () => {
        invoke('richiediHallOfFame', { issueKey }).then((res) => {
            if (res && res.errore) {
                setErroreHOF(res.errore);
                return;
            }
            setAggiuntoHOF(true);
        });
    };

    if (isDone === null) return <Text>Caricamento...</Text>;

    if (!isDone) return <Text>🔒 Sblocca la valutazione portando il workitem in Done!</Text>;

    return (
        <Stack space="space.200">

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

            {/* Sezione Valutazione */}
            {statoVal === undefined ? (
                <Text>Caricamento valutazione...</Text>
            ) : statoVal === 'congelata' ? (
                <Stack space="space.200">
                    <Heading>📋 Valutazione inviata</Heading>
                    <Text>In attesa di revisione del supervisore. I punti verranno assegnati solo dopo l'approvazione.</Text>
                </Stack>
            ) : statoVal === 'confermata' ? (
                <Stack space="space.200">
                    <Heading>✅ Autovalutazione approvata</Heading>
                    <Text>Il supervisore ha approvato la tua autovalutazione. I punti sono stati assegnati.</Text>
                </Stack>
            ) : statoVal === 'modificata' ? (
                <Stack space="space.200">
                    <Heading>✏️ Autovalutazione rivista</Heading>
                    <Text>Il supervisore ha rivisto la tua autovalutazione. I punti aggiornati sono stati assegnati.</Text>
                </Stack>
            ) : statoVal === 'rifiutata' ? (
                <Stack space="space.200">
                    <Heading>❌ Autovalutazione non approvata</Heading>
                    <Text>Il supervisore non ha approvato questa autovalutazione. Nessun punto è stato assegnato.</Text>
                </Stack>
            ) : !testi ? (
                <Text>Caricamento domande...</Text>
            ) : (
                <Stack space="space.200">
                    <Heading>📋 Valutazione workitem (Rispondi sinceramente, il workitem verrà riesaminato dal tuo supervisore)</Heading>

                    <Text>{testi.risoluzione.domanda}</Text>
                    <RadioGroup
                        name="risoluzione"
                        options={CHIAVI_OPZIONI.risoluzione.map((chiave) => ({
                            label: testi.risoluzione.opzioni[chiave],
                            value: chiave,
                        }))}
                        onChange={(e) => setRisoluzione(e.target.value)}
                    />

                    <Text>{testi.documentazione.domanda}</Text>
                    <RadioGroup
                        name="documentazione"
                        options={CHIAVI_OPZIONI.documentazione.map((chiave) => ({
                            label: testi.documentazione.opzioni[chiave],
                            value: chiave,
                        }))}
                        onChange={(e) => setDocumentazione(e.target.value)}
                    />

                    <Text>{testi.feedback.domanda}</Text>
                    <RadioGroup
                        name="feedback"
                        options={CHIAVI_OPZIONI.feedback.map((chiave) => ({
                            label: testi.feedback.opzioni[chiave],
                            value: chiave,
                        }))}
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
        </Stack>
    );
};

ForgeReconciler.render(
    <React.StrictMode>
        <Panel />
    </React.StrictMode>
);