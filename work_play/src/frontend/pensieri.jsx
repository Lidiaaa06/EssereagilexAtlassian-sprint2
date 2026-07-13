import React, { useState, useEffect } from 'react';
import ForgeReconciler, { Text, Heading, Stack, Button, Inline, TextArea, Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@forge/react';
import { invoke } from '@forge/bridge';

const Pensieri = () => {
    const [pensieri, setPensieri] = useState(null);
    const [accountId, setAccountId] = useState(null);
    const [haGiaScritto, setHaGiaScritto] = useState(false);
    const [modalNuovo, setModalNuovo] = useState(false);
    const [modalCommento, setModalCommento] = useState(null);
    const [testoPensiero, setTestoPensiero] = useState('');
    const [testoCommento, setTestoCommento] = useState('');
    const [paginaCorrente, setPaginaCorrente] = useState(0);
    const PENSIERI_PER_PAGINA = 3;

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        invoke('getPensieri').then(result => {
            setPensieri(result);
        });
        invoke('getUserStats').then(result => {
            setAccountId(result.accountId);
        });
        invoke('getStatoPensiero').then(result => {
            setHaGiaScritto(result.haGiaScritto);
        });
    };

    const handleAggiungiPensiero = () => {
        if (!testoPensiero.trim()) return;
        invoke('aggiungiPensiero', { testo: testoPensiero }).then(result => {
            if (result.errore) return;
            setPensieri(result.pensieri);
            setHaGiaScritto(true);
            setModalNuovo(false);
            setTestoPensiero('');
            setPaginaCorrente(0);
        });
    };

    const handleReaction = (pensieroId, reaction) => {
        invoke('toggleReactionPensiero', { pensieroId, reaction }).then(result => {
            setPensieri(result);
        });
    };

    const handleAggiungiCommento = (pensieroId) => {
        if (!testoCommento.trim()) return;
        invoke('aggiungiCommentoPensiero', { pensieroId, testo: testoCommento }).then(result => {
            setPensieri(result);
            setModalCommento(null);
            setTestoCommento('');
        });
    };

    const handleEliminaCommento = (pensieroId, commentoId) => {
        invoke('eliminaCommentoPensiero', { pensieroId, commentoId }).then(result => {
            setPensieri(result);
        });
    };

    const handleEliminaPensiero = (pensieroId) => {
        invoke('eliminaPensiero', { pensieroId }).then(result => {
            setPensieri(result);
            setHaGiaScritto(false);
        });
    };

    const getTempoFa = (timestamp) => {
        const ora = Date.now();
        const diff = ora - timestamp;
        const minuti = Math.floor(diff / (1000 * 60));
        const ore = Math.floor(diff / (1000 * 60 * 60));

        if (minuti < 1) return 'Pubblicato ora';
        if (minuti < 60) return `Pubblicato ${minuti} minuti fa`;
        if (ore === 1) return 'Pubblicato 1 ora fa';
        return `Pubblicato ${ore} ore fa`;
    };

    const pensieriOrdinati = pensieri ? [...pensieri].reverse() : [];
    const totalePagine = Math.ceil(pensieriOrdinati.length / PENSIERI_PER_PAGINA);
    const pensieriPagina = pensieriOrdinati.slice(
        paginaCorrente * PENSIERI_PER_PAGINA,
        (paginaCorrente + 1) * PENSIERI_PER_PAGINA
    );

    return (
        <Stack space="space.200">
            {/* Modal nuovo pensiero */}
            {modalNuovo && (
                <Modal onClose={() => setModalNuovo(false)}>
                    <ModalHeader>
                        <ModalTitle>💭 Il tuo pensiero di oggi</ModalTitle>
                    </ModalHeader>
                    <ModalBody>
                        <TextArea
                            value={testoPensiero}
                            onChange={(e) => setTestoPensiero(e.target.value)}
                            placeholder="Come è andata oggi? Condividi un pensiero con il team..."
                        />
                    </ModalBody>
                    <ModalFooter>
                        <Button appearance="subtle" onClick={() => setModalNuovo(false)}>
                            Annulla
                        </Button>
                        <Button appearance="primary" onClick={handleAggiungiPensiero}>
                            Condividi
                        </Button>
                    </ModalFooter>
                </Modal>
            )}

            {/* Modal commento */}
            {modalCommento && (
                <Modal onClose={() => setModalCommento(null)}>
                    <ModalHeader>
                        <ModalTitle>💬 Aggiungi commento</ModalTitle>
                    </ModalHeader>
                    <ModalBody>
                        <TextArea
                            value={testoCommento}
                            onChange={(e) => setTestoCommento(e.target.value)}
                            placeholder="Scrivi un commento..."
                        />
                    </ModalBody>
                    <ModalFooter>
                        <Button appearance="subtle" onClick={() => setModalCommento(null)}>
                            Annulla
                        </Button>
                        <Button appearance="primary" onClick={() => handleAggiungiCommento(modalCommento)}>
                            Invia
                        </Button>
                    </ModalFooter>
                </Modal>
            )}

            {/* Header */}
            <Inline space="space.100" alignBlock="center">
                <Heading>💭 Pensieri di fine giornata</Heading>
                {haGiaScritto ? (
                    <Text>✅ Hai già condiviso il tuo pensiero oggi!</Text>
                ) : (
                    <Button appearance="primary" onClick={() => setModalNuovo(true)}>
                        + Aggiungi pensiero
                    </Button>
                )
                }


            </Inline>

            {pensieri === null ? (
                <Text>Caricamento...</Text>
            ) : pensieri.length === 0 ? (
                <Text>Nessun pensiero ancora! Sii il primo a condividere qualcosa.</Text>
            ) : (
                <Stack space="space.300">
                    {pensieriPagina.map(pensiero => (
                        <Stack key={pensiero.id} space="space.100">

                            {/* Header pensiero */}

                            <Text>👤 {pensiero.autore}</Text>
                            <Text>🕐 {getTempoFa(pensiero.data)}</Text>

                            {/* Testo pensiero */}
                            <Text>"{pensiero.testo}"</Text>

                            {pensiero.autoreId === accountId &&
                                (
                                    <Button
                                        appearance="danger"
                                        onClick={() => handleEliminaPensiero(pensiero.id)}
                                    >
                                        🗑️
                                    </Button>
                                )}



                            {/* Reactions */}
                            <Inline space="space.100">
                                <Button
                                    appearance={pensiero.reactions.fuoco.includes(accountId) ? 'primary' : 'default'}
                                    onClick={() => handleReaction(pensiero.id, 'fuoco')}
                                >
                                    🔥 {pensiero.reactions.fuoco.length}
                                </Button>
                                <Button
                                    appearance={pensiero.reactions.cervello.includes(accountId) ? 'primary' : 'default'}
                                    onClick={() => handleReaction(pensiero.id, 'cervello')}
                                >
                                    🧠 {pensiero.reactions.cervello.length}
                                </Button>
                                <Button
                                    appearance={pensiero.reactions.fulmine.includes(accountId) ? 'primary' : 'default'}
                                    onClick={() => handleReaction(pensiero.id, 'fulmine')}
                                >
                                    ⚡ {pensiero.reactions.fulmine.length}
                                </Button>
                                <Button
                                    appearance={pensiero.reactions.trofeo.includes(accountId) ? 'primary' : 'default'}
                                    onClick={() => handleReaction(pensiero.id, 'trofeo')}
                                >
                                    🏆 {pensiero.reactions.trofeo.length}
                                </Button>
                            </Inline>

                            {/* Commenti */}
                            <Text>💬 Commenti ({pensiero.commenti.length})</Text>
                            {pensiero.commenti.length > 0 && (
                                <Stack space="space.050">
                                    {pensiero.commenti.map(commento => (
                                        <Inline key={commento.id} space="space.100" alignBlock="center">
                                            <Text>👤 {commento.autore}: {commento.testo}</Text>
                                            {commento.autoreId === accountId && (
                                                <Button
                                                    appearance="danger"
                                                    onClick={() => handleEliminaCommento(pensiero.id, commento.id)}
                                                >
                                                    🗑️
                                                </Button>
                                            )}
                                        </Inline>
                                    ))}
                                </Stack>
                            )}
                            <Button
                                appearance="subtle"
                                onClick={() => {
                                    setModalCommento(pensiero.id);
                                    setTestoCommento('');
                                }}
                            >
                                💬 Aggiungi commento
                            </Button>

                        </Stack>
                    ))}

                    {/* Paginazione */}
                    {totalePagine > 1 && (
                        <Inline space="space.100" alignBlock="center">
                            <Button
                                appearance="subtle"
                                isDisabled={paginaCorrente === 0}
                                onClick={() => setPaginaCorrente(paginaCorrente - 1)}
                            >
                                ←
                            </Button>
                            <Text>{paginaCorrente + 1} / {totalePagine}</Text>
                            <Button
                                appearance="subtle"
                                isDisabled={paginaCorrente >= totalePagine - 1}
                                onClick={() => setPaginaCorrente(paginaCorrente + 1)}
                            >
                                →
                            </Button>
                        </Inline>
                    )}

                </Stack>
            )}
        </Stack>
    );
};

ForgeReconciler.render(
    <React.StrictMode>
        <Pensieri />
    </React.StrictMode>
);