import React, { useState, useEffect } from 'react';
import ForgeReconciler, { Text, Heading, Stack, Button, Inline, TextArea, Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@forge/react';
import { invoke } from '@forge/bridge';

const HallOfFame = () => {
    const [workitems, setWorkitems] = useState(null);
    const [accountId, setAccountId] = useState(null);
    const [commentoAperto, setCommentoAperto] = useState(null);
    const [testoCommento, setTestoCommento] = useState('');
    const [paginaCorrente, setPaginaCorrente] = useState(0);
    const WORKITEM_PER_PAGINA = 3;

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        invoke('getHallOfFame').then(result => {
            setWorkitems(result);
        });
        invoke('getUserStats').then(result => {
            setAccountId(result.accountId);
        });
    };

    const handleReaction = (issueKey, reaction) => {
        invoke('toggleReaction', { issueKey, reaction }).then(result => {
            setWorkitems(result);
        });
    };

    const handleAggiungiCommento = (issueKey) => {
        if (!testoCommento.trim()) return;
        invoke('aggiungiCommento', { issueKey, testo: testoCommento }).then(result => {
            setWorkitems(result);
            setCommentoAperto(null);
            setTestoCommento('');
        });
    };

    const handleEliminaCommento = (issueKey, commentoId) => {
        invoke('eliminaCommento', { issueKey, commentoId }).then(result => {
            setWorkitems(result);
        });
    };

    const formatData = (timestamp) => {
        const data = new Date(timestamp);
        return `${data.getDate()}/${data.getMonth() + 1}/${data.getFullYear()}`;
    };

    const workitemsOrdinati = workitems ? [...workitems].reverse() : [];
    const totalePagine = Math.ceil(workitemsOrdinati.length / WORKITEM_PER_PAGINA);
    const workitemsPagina = workitemsOrdinati.slice(
        paginaCorrente * WORKITEM_PER_PAGINA,
        (paginaCorrente + 1) * WORKITEM_PER_PAGINA
    );

    return (
        <Stack space="space.200">
            {/* Modal commento */}
            {commentoAperto && (
                <Modal onClose={() => setCommentoAperto(null)}>
                    <ModalHeader>
                        <ModalTitle>💬 Aggiungi commento</ModalTitle>
                    </ModalHeader>
                    <ModalBody>
                        <TextArea
                            value={testoCommento}
                            onChange={(e) => setTestoCommento(e.target.value)}
                            placeholder="Scrivi un commento... (max 3 righe)"
                            resize="vertical"
                        />
                    </ModalBody>
                    <ModalFooter>
                        <Button appearance="subtle" onClick={() => setCommentoAperto(null)}>
                            Annulla
                        </Button>
                        <Button appearance="primary" onClick={() => handleAggiungiCommento(commentoAperto)}>
                            Invia
                        </Button>
                    </ModalFooter>
                </Modal>
            )}

            <Heading>🏛️ Hall of Fame</Heading>

            {workitems === null ? (
                <Text>Caricamento...</Text>
            ) : workitems.length === 0 ? (
                <Text>Nessun workitem nella Hall of Fame ancora! Nomina un workitem dalla pagina della issue.</Text>
            ) : (
                <Stack space="space.300">
                    {workitemsPagina.map(workitem => (
                        <Stack key={workitem.id} space="space.100">

                            {/* Header workitem */}
                            <Text>🎯 {workitem.id} — {workitem.titolo}</Text>
                            <Text>➕ {workitem.aggiuntoDA}</Text>
                            <Text>📅 {formatData(workitem.data)}</Text>
                            <Text>{workitem.descrizione}</Text>
                            <Text>👤 Completato da: {workitem.assignee}</Text>

                            {/* Reactions */}
                            <Inline space="space.100">
                                <Button
                                    appearance={workitem.reactions.fuoco.includes(accountId) ? 'primary' : 'default'}
                                    onClick={() => handleReaction(workitem.id, 'fuoco')}
                                >
                                    🔥 {workitem.reactions.fuoco.length}
                                </Button>
                                <Button
                                    appearance={workitem.reactions.cervello.includes(accountId) ? 'primary' : 'default'}
                                    onClick={() => handleReaction(workitem.id, 'cervello')}
                                >
                                    🧠 {workitem.reactions.cervello.length}
                                </Button>
                                <Button
                                    appearance={workitem.reactions.fulmine.includes(accountId) ? 'primary' : 'default'}
                                    onClick={() => handleReaction(workitem.id, 'fulmine')}
                                >
                                    ⚡ {workitem.reactions.fulmine.length}
                                </Button>
                                <Button
                                    appearance={workitem.reactions.trofeo.includes(accountId) ? 'primary' : 'default'}
                                    onClick={() => handleReaction(workitem.id, 'trofeo')}
                                >
                                    🏆 {workitem.reactions.trofeo.length}
                                </Button>
                            </Inline>

                            {/* Commenti */}
                            <Text>💬 Commenti ({workitem.commenti.length})</Text>
                            {workitem.commenti.length > 0 && (
                                <Stack space="space.050">
                                    {workitem.commenti.map(commento => (
                                        <Inline key={commento.id} space="space.100" alignBlock="center">
                                            <Text>👤 {commento.autore}: {commento.testo}</Text>
                                            {commento.autoreId === accountId && (
                                                <Button
                                                    appearance="danger"
                                                    onClick={() => handleEliminaCommento(workitem.id, commento.id)}
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
                                    setCommentoAperto(workitem.id);
                                    setTestoCommento('');
                                }}
                            >
                                💬 Aggiungi commento
                            </Button>

                        </Stack>
                    ))}

                    {/* Paginazione */}
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

                </Stack>
            )}
        </Stack>
    );
};

ForgeReconciler.render(
    <React.StrictMode>
        <HallOfFame />
    </React.StrictMode>
);