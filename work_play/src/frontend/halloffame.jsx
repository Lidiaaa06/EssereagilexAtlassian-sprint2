import React, { useState, useEffect } from 'react';
import ForgeReconciler, { Text, Heading, Stack, Button, Inline, TextArea, Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@forge/react';
import { invoke } from '@forge/bridge';

const HallOfFame = () => {
    const [tickets, setTickets] = useState(null);
    const [accountId, setAccountId] = useState(null);
    const [commentoAperto, setCommentoAperto] = useState(null);
    const [testoCommento, setTestoCommento] = useState('');
    const [paginaCorrente, setPaginaCorrente] = useState(0);
    const TICKET_PER_PAGINA = 3;

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        invoke('getHallOfFame').then(result => {
            setTickets(result);
        });
        invoke('getUserStats').then(result => {
            setAccountId(result.accountId);
        });
    };

    const handleReaction = (issueKey, reaction) => {
        invoke('toggleReaction', { issueKey, reaction }).then(result => {
            setTickets(result);
        });
    };

    const handleAggiungiCommento = (issueKey) => {
        if (!testoCommento.trim()) return;
        invoke('aggiungiCommento', { issueKey, testo: testoCommento }).then(result => {
            setTickets(result);
            setCommentoAperto(null);
            setTestoCommento('');
        });
    };

    const handleEliminaCommento = (issueKey, commentoId) => {
        invoke('eliminaCommento', { issueKey, commentoId }).then(result => {
            setTickets(result);
        });
    };

    const formatData = (timestamp) => {
        const data = new Date(timestamp);
        return `${data.getDate()}/${data.getMonth() + 1}/${data.getFullYear()}`;
    };

    const ticketsOrdinati = tickets ? [...tickets].reverse() : [];
    const totalePagine = Math.ceil(ticketsOrdinati.length / TICKET_PER_PAGINA);
    const ticketsPagina = ticketsOrdinati.slice(
        paginaCorrente * TICKET_PER_PAGINA,
        (paginaCorrente + 1) * TICKET_PER_PAGINA
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

            {tickets === null ? (
                <Text>Caricamento...</Text>
            ) : tickets.length === 0 ? (
                <Text>Nessun ticket nella Hall of Fame ancora! Nomina un ticket dalla pagina della issue.</Text>
            ) : (
                <Stack space="space.300">
                    {ticketsPagina.map(ticket => (
                        <Stack key={ticket.id} space="space.100">

                            {/* Header ticket */}
                            <Text>🎯 {ticket.id} — {ticket.titolo}</Text>
                            <Text>➕ {ticket.aggiuntoDA}</Text>
                            <Text>📅 {formatData(ticket.data)}</Text>
                            <Text>{ticket.descrizione}</Text>
                            <Text>👤 Completato da: {ticket.assignee}</Text>

                            {/* Reactions */}
                            <Inline space="space.100">
                                <Button
                                    appearance={ticket.reactions.fuoco.includes(accountId) ? 'primary' : 'default'}
                                    onClick={() => handleReaction(ticket.id, 'fuoco')}
                                >
                                    🔥 {ticket.reactions.fuoco.length}
                                </Button>
                                <Button
                                    appearance={ticket.reactions.cervello.includes(accountId) ? 'primary' : 'default'}
                                    onClick={() => handleReaction(ticket.id, 'cervello')}
                                >
                                    🧠 {ticket.reactions.cervello.length}
                                </Button>
                                <Button
                                    appearance={ticket.reactions.fulmine.includes(accountId) ? 'primary' : 'default'}
                                    onClick={() => handleReaction(ticket.id, 'fulmine')}
                                >
                                    ⚡ {ticket.reactions.fulmine.length}
                                </Button>
                                <Button
                                    appearance={ticket.reactions.trofeo.includes(accountId) ? 'primary' : 'default'}
                                    onClick={() => handleReaction(ticket.id, 'trofeo')}
                                >
                                    🏆 {ticket.reactions.trofeo.length}
                                </Button>
                            </Inline>

                            {/* Commenti */}
                            <Text>💬 Commenti ({ticket.commenti.length})</Text>
                            {ticket.commenti.length > 0 && (
                                <Stack space="space.050">
                                    {ticket.commenti.map(commento => (
                                        <Inline key={commento.id} space="space.100" alignBlock="center">
                                            <Text>👤 {commento.autore}: {commento.testo}</Text>
                                            {commento.autoreId === accountId && (
                                                <Button
                                                    appearance="danger"
                                                    onClick={() => handleEliminaCommento(ticket.id, commento.id)}
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
                                    setCommentoAperto(ticket.id);
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