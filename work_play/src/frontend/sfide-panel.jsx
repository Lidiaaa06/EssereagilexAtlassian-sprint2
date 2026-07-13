import React, { useState, useEffect } from 'react';
import ForgeReconciler, { Text, Heading, Stack, Button, Inline, Lozenge } from '@forge/react';
import { invoke } from '@forge/bridge';

const SfidePanel = () => {
    const [sfideAttive, setSfideAttive] = useState(null);
    const [allSfide, setAllSfide] = useState([]);
    const [isDone, setIsDone] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        invoke('getUserStats').then(result => {
            const attive = result.sfideUtente.filter(s => !s.completata);
            setSfideAttive(attive);
            setAllSfide(result.allSfide);
        });
        invoke('getIssueStatus').then(result => {
            setIsDone(result.isDone);
        });
    };

    const handleCompletaSfida = (sfidaKey) => {
        invoke('completaSfida', { sfidaKey, descrizione: null }).then(() => {
            loadData();
        });
    };

    const getUrgenza = (scadenza) => {
        const ora = Date.now();
        const diff = scadenza - ora;
        const ore = diff / (1000 * 60 * 60);

        if (ore <= 8) return 'rosso';
        if (ore <= 15) return 'giallo';
        return 'verde';
    };

    const getTimer = (scadenza) => {
        const ora = Date.now();
        const diff = scadenza - ora;
        if (diff <= 0) return 'Scaduta';
        const ore = Math.floor(diff / (1000 * 60 * 60));
        const minuti = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        if (ore >= 24) {
            const giorni = Math.floor(ore / 24);
            return `${giorni}g rimanenti`;
        }
        return `${ore}h ${minuti}m`;
    };

    const getLozenge = (urgenza) => {
        if (urgenza === 'rosso') return 'removed';
        if (urgenza === 'giallo') return 'moved';
        return 'success';
    };

    const getSfidePertinenti = () => {
        if (!isDone || !sfideAttive) return [];
        return sfideAttive.filter(s => {
            const dettagli = allSfide.find(sf => sf.key === s.key);
            return dettagli;
        });
    };

    if (sfideAttive === null) return <Text>Caricamento...</Text>;

    if (sfideAttive.length === 0) {
        return (
            <Stack space="space.100">
                <Text>✅ Nessuna sfida attiva al momento!</Text>
            </Stack>
        );
    }

    return (
        <Stack space="space.200">

            {/* Messaggio contestuale se ticket è Done */}
            {isDone && (
                <Stack space="space.100">
                    <Lozenge appearance="success">✅ Ticket completato!</Lozenge>
                    <Text>Puoi usare questo ticket per completare le tue sfide attive?</Text>
                </Stack>
            )}

            {/* Messaggio se ticket non è Done */}
            {!isDone && (
                <Inline space="space.100" alignBlock="center">
                    <Lozenge appearance="moved">⚠️ Ricorda</Lozenge>
                    <Text>Hai queste sfide attive:</Text>
                </Inline>
            )}

            {/* Lista sfide attive */}
            <Stack space="space.100">
                {sfideAttive.map(sfida => {
                    const dettagli = allSfide.find(s => s.key === sfida.key);
                    if (!dettagli) return null;

                    const urgenza = getUrgenza(sfida.scadenza);
                    const timer = getTimer(sfida.scadenza);

                    return (
                        <Stack key={sfida.key} space="space.050">
                            <Inline space="space.100" alignBlock="center">
                                <Text>{dettagli.emoji} {dettagli.nome}</Text>
                                <Lozenge appearance={getLozenge(urgenza)}>
                                    ⏱ {timer}
                                </Lozenge>
                            </Inline>

                            {/* Bottone completa solo se ticket è Done */}
                            {isDone && (
                                <Button
                                    appearance="primary"
                                    onClick={() => handleCompletaSfida(sfida.key)}
                                >
                                    Segna come completata
                                </Button>
                            )}
                        </Stack>
                    );
                })}
            </Stack>

        </Stack>
    );
};

ForgeReconciler.render(
    <React.StrictMode>
        <SfidePanel />
    </React.StrictMode>
);