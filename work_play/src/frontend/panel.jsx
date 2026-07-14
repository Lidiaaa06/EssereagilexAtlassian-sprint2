import React, { useState, useEffect } from 'react';
import ForgeReconciler, { Text, Heading, Stack, Button, RadioGroup } from '@forge/react';
import { invoke } from '@forge/bridge';

const Panel = () => {
    const [risoluzione, setRisoluzione] = useState(null);
    const [documentazione, setDocumentazione] = useState(null);
    const [feedback, setFeedback] = useState(null);
    const [isDone, setIsDone] = useState(null);
    const [issueKey, setIssueKey] = useState(null);
    const [aggiuntoHOF, setAggiuntoHOF] = useState(false);
    // Stato valutazione su questo ticket: undefined = caricamento, null = non valutato,
    // altrimenti 'congelata' | 'confermata' | 'modificata' | 'rifiutata'
    const [statoVal, setStatoVal] = useState(undefined);

    useEffect(() => {
        invoke('getIssueStatus').then(result => {
            setIsDone(result.isDone);
            setIssueKey(result.issueKey);
            invoke('getStatoValutazione', { issueKey: result.issueKey }).then(r => {
                setStatoVal(r.stato);
            });
        });
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

    if (!isDone) return <Text>🔒 Sblocca la valutazione portando il ticket in Done!</Text>;

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
            ) : (
                <Stack space="space.200">
                    <Heading>📋 Valutazione ticket (Rispondi sinceramente, il ticket verrà riesaminato dal tuo supervisore)</Heading>

                    <Text>Come hai risolto il ticket?</Text>
                    <RadioGroup
                        name="risoluzione"
                        options={[
                            { label: '🧠 In autonomia ', value: 'autonomia' },
                            { label: '🤝 Con aiuto di un collega ', value: 'collega' },
                            { label: '👔 Con aiuto del manager', value: 'manager' },
                        ]}
                        onChange={(e) => setRisoluzione(e.target.value)}
                    />

                    <Text>Hai documentato la soluzione?</Text>
                    <RadioGroup
                        name="documentazione"
                        options={[
                            { label: '✅ Sì, correttamente ', value: 'corretta' },
                            { label: '⚠️ Sì, ma in modo errato ', value: 'errata' },
                            { label: '❌ No ', value: 'nessuna' },
                        ]}
                        onChange={(e) => setDocumentazione(e.target.value)}
                    />

                    <Text>Il cliente ha dato feedback?</Text>
                    <RadioGroup
                        name="feedback"
                        options={[
                            { label: '😊 Positivo', value: 'positivo' },
                            { label: '😞 Negativo', value: 'negativo' },
                            { label: '😐 Nessun feedback', value: 'nessuno' },
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
        </Stack>
    );
};

ForgeReconciler.render(
    <React.StrictMode>
        <Panel />
    </React.StrictMode>
);