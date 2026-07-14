import React, { useState, useEffect } from 'react';
import ForgeReconciler, { Text, Heading, Stack, Button, RadioGroup } from '@forge/react';
import { invoke } from '@forge/bridge';

const Panel = () => {
    const [risoluzione, setRisoluzione] = useState(null);
    const [documentazione, setDocumentazione] = useState(null);
    const [feedback, setFeedback] = useState(null);
    const [inviato, setInviato] = useState(false);
    const [isDone, setIsDone] = useState(null);
    const [issueKey, setIssueKey] = useState(null);
    const [aggiuntoHOF, setAggiuntoHOF] = useState(false);

    useEffect(() => {
        invoke('getIssueStatus').then(result => {
            setIsDone(result.isDone);
            setIssueKey(result.issueKey);
        });
    }, []);

    const handleSubmit = () => {
        if (!risoluzione || !documentazione || !feedback) return;
        invoke('valutaTicket', { risoluzione, documentazione, feedback }).then(() => {
            setInviato(true);
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
        </Stack>
    );
};

ForgeReconciler.render(
    <React.StrictMode>
        <Panel />
    </React.StrictMode>
);