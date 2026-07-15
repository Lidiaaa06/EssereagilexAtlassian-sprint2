import React, { useState, useEffect } from 'react';
import ForgeReconciler, {
    Text,
    Heading,
    Stack,
    Box,
    Inline,
    Lozenge,
    Select,
    Button,
    Tooltip,
    SectionMessage,
    Textfield,
} from '@forge/react';
import { invoke } from '@forge/bridge';

// Etichetta leggibile per ogni tipo di flag prodotto da antifarming.js
// Opzioni per la modifica delle autovalutazioni (stessi valori del panel operatore)
const OPZIONI_RISOLUZIONE = [
    { label: '🧠 In autonomia', value: 'autonomia' },
    { label: '🤝 Con collega', value: 'collega' },
    { label: '👔 Con manager', value: 'manager' },
];
const OPZIONI_DOCUMENTAZIONE = [
    { label: '✅ Corretta', value: 'corretta' },
    { label: '⚠️ Errata', value: 'errata' },
    { label: '❌ Nessuna', value: 'nessuna' },
];
const OPZIONI_FEEDBACK = [
    { label: '😊 Positivo', value: 'positivo' },
    { label: '😞 Negativo', value: 'negativo' },
    { label: '😐 Nessuno', value: 'nessuno' },
];

// Struttura della griglia punteggi valutazione (per generare il form nell'admin)
const GRIGLIA_VAL = [
    { gruppo: 'risoluzione', titolo: 'Risoluzione', voci: [['autonomia', 'In autonomia'], ['collega', 'Con collega'], ['manager', 'Con manager']] },
    { gruppo: 'documentazione', titolo: 'Documentazione', voci: [['corretta', 'Corretta'], ['errata', 'Errata'], ['nessuna', 'Nessuna']] },
    { gruppo: 'feedback', titolo: 'Feedback', voci: [['positivo', 'Positivo'], ['negativo', 'Negativo'], ['nessuno', 'Nessuno']] },
];

const ETICHETTE_FLAG = {
    TROPPO_VELOCE: '⚡ Chiuso troppo in fretta',
    SALTO_IN_PROGRESS: '⏭️ Mai passato da In Progress',
};

// antifarming.js salva -1 quando la durata non è misurabile (KVS non accetta null)
const formatDurata = (secondi) => {
    if (secondi < 0) return '—';
    if (secondi < 60) return `${secondi}s`;
    const minuti = Math.floor(secondi / 60);
    return `${minuti}m ${secondi % 60}s`;
};

const formatData = (timestamp) => {
    const d = new Date(timestamp);
    const ora = `${d.getHours()}`.padStart(2, '0') + ':' + `${d.getMinutes()}`.padStart(2, '0');
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${ora}`;
};

// Una segnalazione vista viene cancellata 24 ore dopo l'archiviazione.
// Mostriamo quanto manca, così la sparizione non arriva a sorpresa.
const DURATA_RISOLTA_MS = 24 * 60 * 60 * 1000;

// Testo BREVE per il lozenge: oltre poche lettere viene troncato con "..."
const residuoBreve = (risoltaIl) => {
    if (!risoltaIl) return null;
    const rimanenti = risoltaIl + DURATA_RISOLTA_MS - Date.now();
    if (rimanenti <= 0) return null;
    const ore = Math.floor(rimanenti / (1000 * 60 * 60));
    if (ore >= 1) return `${ore}h`;
    return `${Math.floor(rimanenti / (1000 * 60))}m`;
};

// Testo COMPLETO per il tooltip, dove non c'è limite di larghezza
const residuoEsteso = (risoltaIl) => {
    const breve = residuoBreve(risoltaIl);
    if (!breve) return 'Archiviata. Verrà cancellata a breve.';
    return `Archiviata il ${formatData(risoltaIl)}. Verrà cancellata definitivamente tra ${breve}.`;
};

// Etichetta grafica del ruolo, usata in più punti
const RuoloLozenge = ({ ruolo }) => (
    <Lozenge appearance={ruolo === 'supervisore' ? 'new' : 'default'}>
        {ruolo === 'supervisore' ? '👔 Supervisore' : '🧑‍💻 Operatore'}
    </Lozenge>
);

// Riga di intestazione della tabella
const Intestazione = () => (
    <Box padding="space.150" backgroundColor="color.background.neutral.bold">
        <Inline space="space.0" alignBlock="center">
            <Box xcss={{ width: '130px' }}>
                <Text font={{ weight: 'bold' }} color="color.text.inverse">Nome</Text>
            </Box>
            <Box xcss={{ width: '160px' }}>
                <Text font={{ weight: 'bold' }} color="color.text.inverse">Ruolo</Text>
            </Box>
            <Box xcss={{ width: '170px' }}>
                <Text font={{ weight: 'bold' }} color="color.text.inverse">Badge livello</Text>
            </Box>
            <Box xcss={{ width: '90px' }}>
                <Text font={{ weight: 'bold' }} color="color.text.inverse">Punti</Text>
            </Box>
            <Box xcss={{ width: '90px' }}>
                <Text font={{ weight: 'bold' }} color="color.text.inverse">Legacy</Text>
            </Box>
            <Box xcss={{ width: '80px' }}>
                <Text font={{ weight: 'bold' }} color="color.text.inverse">Ticket</Text>
            </Box>
            <Box xcss={{ width: '110px' }}>
                <Text font={{ weight: 'bold' }} color="color.text.inverse">Badge speciali</Text>
            </Box>
        </Inline>
    </Box>
);

// Una riga per membro del team
const Riga = ({ profilo, allBadges }) => {
    // Traduce le key dei badge speciali in emoji leggibili
    const emojiBadge = profilo.specialBadges
        .map((key) => allBadges.find((b) => b.key === key)?.emoji)
        .filter(Boolean)
        .join(' ');

    return (
        <Box padding="space.150" backgroundColor="color.background.neutral">
            <Inline space="space.0" alignBlock="center">
                <Box xcss={{ width: '130px' }}>
                    <Text font={{ weight: 'bold' }}>{profilo.nome}</Text>
                </Box>
                <Box xcss={{ width: '160px' }}>
                    <RuoloLozenge ruolo={profilo.ruolo} />
                </Box>
                <Box xcss={{ width: '170px' }}>
                    <Text>{profilo.badge.emoji} {profilo.badge.name}</Text>
                </Box>
                <Box xcss={{ width: '90px' }}>
                    <Text>{profilo.punti}</Text>
                </Box>
                <Box xcss={{ width: '90px' }}>
                    <Text>{profilo.puntiLegacy}</Text>
                </Box>
                <Box xcss={{ width: '80px' }}>
                    <Text>{profilo.ticketChiusi}</Text>
                </Box>
                <Box xcss={{ width: '110px' }}>
                    <Text>{emojiBadge || '—'}</Text>
                </Box>
            </Inline>
        </Box>
    );
};

const AdminPage = () => {
    // { isSupervisore, profili, allBadges } oppure null mentre carica
    const [data, setData] = useState(null);
    // Elenco delle chiusure sospette segnalate dal trigger
    const [segnalazioni, setSegnalazioni] = useState([]);
    // Paginazione delle segnalazioni: la freccia indietro mostra le più vecchie
    const [paginaCorrente, setPaginaCorrente] = useState(0);
    const SEGNALAZIONI_PER_PAGINA = 3;
    // accountId del membro scelto nel menu a tendina
    const [utenteSelezionato, setUtenteSelezionato] = useState(null);
    // Esito dell'ultima azione: { tipo: 'success' | 'error', testo: '...' }
    const [messaggio, setMessaggio] = useState(null);
    // Disabilita i pulsanti mentre una chiamata è in volo (evita doppi click)
    const [inCorso, setInCorso] = useState(false);
    // Valore configurabile: punti assegnati a ogni ticket completato
    const [puntiPerTicket, setPuntiPerTicket] = useState('3');

    const [puntiPerAiuto, setPuntiPerAiuto] = useState('10');
    // Richieste di inserimento in Hall of Fame, in attesa di approvazione
    const [richiesteHOF, setRichiesteHOF] = useState([]);
    // Autovalutazioni congelate in attesa di conferma
    const [valutazioni, setValutazioni] = useState([]);
    // Scelte editate dal supervisore per ogni valutazione: { [id]: {risoluzione, documentazione, feedback} }
    const [valModifiche, setValModifiche] = useState({});
    // Griglia punteggi valutazione configurabile (valori reali, come stringhe per l'input)
    const [puntiVal, setPuntiVal] = useState(null);

    useEffect(() => {
        caricaDati();
    }, []);

    const caricaDati = () => {
        // Le due chiamate sono indipendenti: le lanciamo insieme.
        return Promise.all([
            invoke('getAdminData'),
            invoke('getSegnalazioni'),
            invoke('getConfigPunti'),
            invoke('getRichiesteHallOfFame'),
            invoke('getValutazioniCongelate'),
            invoke('getConfigValutazione'),
            invoke('getConfigAiuto'),
        ]).then(([adminData, risultatoSegnalazioni, config, risultatoHOF, risultatoVal, configVal, configAiuto]) => {
            setData(adminData);
            // Se l'utente non è supervisore il resolver risponde { errore }
            setSegnalazioni(risultatoSegnalazioni.segnalazioni || []);
            setPuntiPerTicket(String(config.puntiPerTicket));
            setPuntiPerAiuto(String(configAiuto.puntiPerAiuto));
            setRichiesteHOF(risultatoHOF.richieste || []);
            const listaVal = risultatoVal.valutazioni || [];
            setValutazioni(listaVal);
            // Pre-compila le scelte editabili con quelle originali dell'operatore
            const modificheIniziali = {};
            listaVal.forEach((v) => {
                modificheIniziali[v.id] = {
                    risoluzione: v.risoluzione,
                    documentazione: v.documentazione,
                    feedback: v.feedback,
                };
            });
            setValModifiche(modificheIniziali);
            // Griglia punteggi valutazione → in stringhe per gli input
            const c = configVal.config;
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
            return adminData;
        });
    };

    // Profilo completo del membro selezionato (undefined finché non si sceglie)
    const profiloSelezionato = data?.profili.find(
        (p) => p.accountId === utenteSelezionato
    );

    // Tutte le azioni admin seguono lo stesso schema:
    // blocca i pulsanti → invoca → mostra errore oppure ricarica e conferma.
    // Un solo posto da correggere se cambia la gestione degli errori.
    const eseguiAzione = (nomeResolver, payload, testoSuccesso) => {
        if (inCorso) return;

        setInCorso(true);
        setMessaggio(null);

        invoke(nomeResolver, payload)
            .then((result) => {
                if (result.errore) {
                    setMessaggio({ tipo: 'error', testo: result.errore });
                    setInCorso(false);
                    return;
                }
                setMessaggio({ tipo: 'success', testo: testoSuccesso });
                // Ricarico: aggiorna tabella, pulsanti e badge posseduti
                return caricaDati().then(() => setInCorso(false));
            })
            .catch(() => {
                setMessaggio({ tipo: 'error', testo: 'Errore imprevisto. Riprova.' });
                setInCorso(false);
            });
    };

    const handleCambiaRuolo = (nuovoRuolo) => {
        if (!utenteSelezionato) return;
        eseguiAzione(
            'assegnaRuolo',
            { accountIdTarget: utenteSelezionato, nuovoRuolo },
            `${profiloSelezionato.nome} è ora ${nuovoRuolo}.`
        );
    };

    const handleAssegnaBadge = (badge) => {
        if (!utenteSelezionato) return;
        eseguiAzione(
            'assegnaBadge',
            { accountIdTarget: utenteSelezionato, badgeKey: badge.key },
            `Badge "${badge.name}" assegnato a ${profiloSelezionato.nome}.`
        );
    };

    const handleRimuoviBadge = (badge) => {
        if (!utenteSelezionato) return;
        eseguiAzione(
            'rimuoviBadge',
            { accountIdTarget: utenteSelezionato, badgeKey: badge.key },
            `Badge "${badge.name}" rimosso a ${profiloSelezionato.nome}.`
        );
    };

    const handleMarcaVista = (segnalazione) => {
        eseguiAzione(
            'marcaSegnalazioneVista',
            { segnalazioneId: segnalazione.id },
            `Segnalazione su ${segnalazione.issueKey} archiviata.`
        );
    };

    const handleSalvaPunti = () => {
        eseguiAzione(
            'setConfigPunti',
            { puntiPerTicket: Number(puntiPerTicket) },
            `Punti per ticket impostati a ${puntiPerTicket}.`
        );
    };

    const handleSalvaPuntiAiuto = () => {
        eseguiAzione(
            'setConfigAiuto',
            { puntiPerAiuto: Number(puntiPerAiuto) },
            `Punti per aiuto impostati a ${puntiPerAiuto}.`
        );
    };

    const handleApprovaHOF = (r) => {
        eseguiAzione(
            'approvaRichiestaHOF',
            { issueKey: r.id },
            `${r.id} aggiunto alla Hall of Fame.`
        );
    };

    const handleRifiutaHOF = (r) => {
        eseguiAzione(
            'rifiutaRichiestaHOF',
            { issueKey: r.id },
            `Richiesta su ${r.id} rifiutata.`
        );
    };

    // Aggiorna una scelta editata dal supervisore per una valutazione
    const setScelta = (id, campo, valore) => {
        setValModifiche((prev) => ({
            ...prev,
            [id]: { ...prev[id], [campo]: valore },
        }));
    };

    const handleConfermaVal = (v) => {
        const scelte = valModifiche[v.id] || {
            risoluzione: v.risoluzione,
            documentazione: v.documentazione,
            feedback: v.feedback,
        };
        eseguiAzione(
            'confermaValutazione',
            { id: v.id, ...scelte },
            `Valutazione di ${v.nome} su ${v.issueKey || '—'} confermata.`
        );
    };

    const handleRifiutaVal = (v) => {
        eseguiAzione(
            'rifiutaValutazione',
            { id: v.id },
            `Valutazione di ${v.nome} rifiutata (nessun punto assegnato).`
        );
    };

    // Aggiorna un valore della griglia punteggi valutazione
    const setPuntoVal = (gruppo, chiave, valore) => {
        setPuntiVal((prev) => ({
            ...prev,
            [gruppo]: { ...prev[gruppo], [chiave]: valore },
        }));
    };

    const handleSalvaPuntiVal = () => {
        // Converte le stringhe in numeri reali prima di inviare
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

    if (data === null) return <Text>Caricamento pannello admin...</Text>;

    // Secondo controllo, oltre a quello di Jira sugli amministratori del sito:
    // qui blocchiamo chi non è supervisore secondo il NOSTRO sistema di ruoli.
    if (!data.isSupervisore) {
        return (
            <SectionMessage appearance="warning">
                <Text>
                    Accesso riservato ai supervisori. Contatta il supervisore del team
                    se pensi di dover avere accesso a questa pagina.
                </Text>
            </SectionMessage>
        );
    }

    // Opzioni del menu a tendina: una per membro del team
    const opzioniUtenti = data.profili.map((p) => ({
        label: `${p.nome} — ${p.ruolo === 'supervisore' ? 'Supervisore' : 'Operatore'}`,
        value: p.accountId,
    }));

    // Badge che il membro selezionato NON ha ancora
    const badgeDisponibili = profiloSelezionato
        ? data.allBadges.filter(
            (b) => !profiloSelezionato.specialBadges.includes(b.key)
        )
        : [];

    // Segnalazioni che il supervisore non ha ancora archiviato
    const segnalazioniAperte = segnalazioni.filter((s) => !s.risolta);

    // Le segnalazioni arrivano già ordinate dal backend (più recenti prima),
    // quindi pagina 0 = le 3 più recenti, la freccia ← porta alle più vecchie.
    const totalePagine = Math.ceil(segnalazioni.length / SEGNALAZIONI_PER_PAGINA);
    // Clamp: se la lista si accorcia mentre siamo su un'ultima pagina ormai
    // inesistente, ripieghiamo sull'ultima valida invece di mostrare il vuoto.
    const paginaValida = Math.min(paginaCorrente, Math.max(0, totalePagine - 1));
    const segnalazioniPagina = segnalazioni.slice(
        paginaValida * SEGNALAZIONI_PER_PAGINA,
        (paginaValida + 1) * SEGNALAZIONI_PER_PAGINA
    );

    return (
        <Stack space="space.300">
            <Heading>🛠️ WorkPlay Admin</Heading>

            {/* Esito dell'ultima azione */}
            {messaggio && (
                <SectionMessage
                    appearance={messaggio.tipo === 'success' ? 'success' : 'error'}
                >
                    <Text>{messaggio.testo}</Text>
                </SectionMessage>
            )}

            {/* --- Segnalazioni antifarming --- */}
            <Stack space="space.100">
                <Inline space="space.100" alignBlock="center">
                    <Heading>🚩 Segnalazioni</Heading>
                    {segnalazioniAperte.length > 0 && (
                        <Lozenge appearance="removed">
                            {segnalazioniAperte.length} da rivedere
                        </Lozenge>
                    )}
                </Inline>

                <Text>
                    I punti sono stati assegnati comunque. Questa è solo una lista di
                    chiusure da controllare.
                </Text>

                {segnalazioni.length === 0 ? (
                    <Text>Nessuna segnalazione. 👍</Text>
                ) : (
                    <Stack space="space.100">
                        {segnalazioniPagina.map((s) => (
                            <Box
                                key={s.id}
                                padding="space.150"
                                backgroundColor={
                                    s.risolta
                                        ? 'color.background.neutral'
                                        : 'color.background.accent.red.subtlest'
                                }
                            >
                                <Stack space="space.050">
                                    <Inline space="space.100" alignBlock="center" shouldWrap>
                                        <Text font={{ weight: 'bold' }}>{s.issueKey}</Text>
                                        <Text>👤 {s.nome}</Text>
                                        <Text>🕐 {formatData(s.data)}</Text>
                                        <Text>⏱ In Progress: {formatDurata(s.secondiInProgress)}</Text>
                                    </Inline>

                                    <Inline space="space.100" alignBlock="center" shouldWrap>
                                        {s.flags.map((flag) => (
                                            <Lozenge key={flag} appearance="removed">
                                                {ETICHETTE_FLAG[flag] || flag}
                                            </Lozenge>
                                        ))}

                                        {s.risolta ? (
                                            <Tooltip content={residuoEsteso(s.risoltaIl)} position="top">
                                                <Lozenge appearance="success">
                                                    ✅ Vista{residuoBreve(s.risoltaIl) ? ` · ${residuoBreve(s.risoltaIl)}` : ''}
                                                </Lozenge>
                                            </Tooltip>
                                        ) : (
                                            <Button
                                                appearance="default"
                                                isDisabled={inCorso}
                                                onClick={() => handleMarcaVista(s)}
                                            >
                                                Segna come vista
                                            </Button>
                                        )}
                                    </Inline>
                                </Stack>
                            </Box>
                        ))}

                        {/* Paginazione, stesso comportamento di pensieri.jsx e halloffame.jsx:
                pagina 1 = le più recenti, → porta alle più vecchie. */}
                        {totalePagine > 1 && (
                            <Inline space="space.100" alignBlock="center">
                                <Button
                                    appearance="subtle"
                                    isDisabled={paginaValida === 0}
                                    onClick={() => setPaginaCorrente(paginaValida - 1)}
                                >
                                    ←
                                </Button>
                                <Text>{paginaValida + 1} / {totalePagine}</Text>
                                <Button
                                    appearance="subtle"
                                    isDisabled={paginaValida >= totalePagine - 1}
                                    onClick={() => setPaginaCorrente(paginaValida + 1)}
                                >
                                    →
                                </Button>
                            </Inline>
                        )}
                    </Stack>
                )}
            </Stack>

            {/* --- Punti per ticket --- */}
            <Stack space="space.100">
                <Heading>🎯 Punti per ticket</Heading>
                <Text>Punti assegnati a ogni task completata. Vale dal prossimo aggiornamento.</Text>
                <Inline space="space.100" alignBlock="center">
                    <Textfield
                        type="number"
                        value={puntiPerTicket}
                        onChange={(e) => setPuntiPerTicket(e.target.value)}
                    />
                    <Button appearance="primary" isDisabled={inCorso} onClick={handleSalvaPunti}>
                        Salva
                    </Button>
                </Inline>
            </Stack>

            {/* --- Punti per aiuto --- */}
            <Stack space="space.100">
                <Heading>🤝 Punti per aiuto</Heading>
                <Text>Punti assegnati per ogni aiuto segnalato tra colleghi. Vale dalla prossima segnalazione.</Text>
                <Inline space="space.100" alignBlock="center">
                    <Textfield
                        type="number"
                        value={puntiPerAiuto}
                        onChange={(e) => setPuntiPerAiuto(e.target.value)}
                    />
                    <Button appearance="primary" isDisabled={inCorso} onClick={handleSalvaPuntiAiuto}>
                        Salva
                    </Button>
                </Inline>
            </Stack>

            {/* --- Punteggi valutazione (griglia configurabile) --- */}
            {puntiVal && (
                <Stack space="space.100">
                    <Heading>⚖️ Punteggi autovalutazione</Heading>
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
                        <Button appearance="primary" isDisabled={inCorso} onClick={handleSalvaPuntiVal}>
                            Salva punteggi valutazione
                        </Button>
                    </Inline>
                </Stack>
            )}

            {/* --- Richieste Hall of Fame --- */}
            <Stack space="space.100">
                <Inline space="space.100" alignBlock="center">
                    <Heading>🏛️ Richieste Hall of Fame</Heading>
                    {richiesteHOF.length > 0 && (
                        <Lozenge appearance="new">{richiesteHOF.length} da valutare</Lozenge>
                    )}
                </Inline>

                {richiesteHOF.length === 0 ? (
                    <Text>Nessuna richiesta in attesa. 👍</Text>
                ) : (
                    <Stack space="space.100">
                        {richiesteHOF.map((r) => (
                            <Box
                                key={r.id}
                                padding="space.150"
                                backgroundColor="color.background.neutral"
                            >
                                <Stack space="space.050">
                                    <Inline space="space.100" alignBlock="center" shouldWrap>
                                        <Text font={{ weight: 'bold' }}>{r.id}</Text>
                                        <Text>— {r.titolo}</Text>
                                    </Inline>
                                    <Text>👤 Completato da: {r.assignee}</Text>
                                    <Text>➕ Proposto da: {r.aggiuntoDA}</Text>
                                    <Text>{r.descrizione}</Text>
                                    <Inline space="space.100">
                                        <Button
                                            appearance="primary"
                                            isDisabled={inCorso}
                                            onClick={() => handleApprovaHOF(r)}
                                        >
                                            ✅ Approva
                                        </Button>
                                        <Button
                                            appearance="danger"
                                            isDisabled={inCorso}
                                            onClick={() => handleRifiutaHOF(r)}
                                        >
                                            ❌ Nega
                                        </Button>
                                    </Inline>
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                )}
            </Stack>

            {/* --- Autovalutazioni da confermare --- */}
            <Stack space="space.100">
                <Inline space="space.100" alignBlock="center">
                    <Heading>📋 Autovalutazioni da confermare</Heading>
                    {valutazioni.length > 0 && (
                        <Lozenge appearance="new">{valutazioni.length} in attesa</Lozenge>
                    )}
                </Inline>
                <Text>
                    I punti NON sono ancora assegnati. Conferma per applicarli, oppure
                    modifica le scelte (il punteggio si ricalcola) prima di confermare.
                </Text>

                {valutazioni.length === 0 ? (
                    <Text>Nessuna autovalutazione in attesa. 👍</Text>
                ) : (
                    <Stack space="space.100">
                        {valutazioni.map((v) => {
                            const scelte = valModifiche[v.id] || {};
                            return (
                                <Box key={v.id} padding="space.150" backgroundColor="color.background.neutral">
                                    <Stack space="space.100">
                                        <Inline space="space.100" alignBlock="center" shouldWrap>
                                            <Text font={{ weight: 'bold' }}>{v.nome}</Text>
                                            <Text>— {v.issueKey || 'ticket n/d'}</Text>
                                            <Lozenge>proposti: {(v.puntiProposti / 10)} pt</Lozenge>
                                        </Inline>

                                        <Text>Risoluzione</Text>
                                        <Select
                                            options={OPZIONI_RISOLUZIONE}
                                            value={OPZIONI_RISOLUZIONE.find((o) => o.value === scelte.risoluzione) || null}
                                            onChange={(o) => setScelta(v.id, 'risoluzione', o ? o.value : null)}
                                        />
                                        <Text>Documentazione</Text>
                                        <Select
                                            options={OPZIONI_DOCUMENTAZIONE}
                                            value={OPZIONI_DOCUMENTAZIONE.find((o) => o.value === scelte.documentazione) || null}
                                            onChange={(o) => setScelta(v.id, 'documentazione', o ? o.value : null)}
                                        />
                                        <Text>Feedback</Text>
                                        <Select
                                            options={OPZIONI_FEEDBACK}
                                            value={OPZIONI_FEEDBACK.find((o) => o.value === scelte.feedback) || null}
                                            onChange={(o) => setScelta(v.id, 'feedback', o ? o.value : null)}
                                        />

                                        <Inline space="space.100">
                                            <Button
                                                appearance="primary"
                                                isDisabled={inCorso}
                                                onClick={() => handleConfermaVal(v)}
                                            >
                                                ✅ Conferma e assegna punti
                                            </Button>
                                            <Button
                                                appearance="danger"
                                                isDisabled={inCorso}
                                                onClick={() => handleRifiutaVal(v)}
                                            >
                                                ❌ Rifiuta
                                            </Button>
                                        </Inline>
                                    </Stack>
                                </Box>
                            );
                        })}
                    </Stack>
                )}
            </Stack>

            {/* --- Gestione ruolo --- */}
            <Stack space="space.100">
                <Heading>🎭 Gestione ruolo</Heading>

                <Select
                    options={opzioniUtenti}
                    value={opzioniUtenti.find((o) => o.value === utenteSelezionato) || null}
                    onChange={(opzione) => {
                        setUtenteSelezionato(opzione ? opzione.value : null);
                        setMessaggio(null);
                    }}
                    placeholder="Scegli un membro del team..."
                />

                {profiloSelezionato && (
                    <Stack space="space.100">
                        <Inline space="space.100" alignBlock="center">
                            <Text>Ruolo attuale di {profiloSelezionato.nome}:</Text>
                            <RuoloLozenge ruolo={profiloSelezionato.ruolo} />
                        </Inline>

                        <Inline space="space.100">
                            <Button
                                appearance="primary"
                                isDisabled={inCorso || profiloSelezionato.ruolo === 'supervisore'}
                                onClick={() => handleCambiaRuolo('supervisore')}
                            >
                                👔 Rendi supervisore
                            </Button>
                            <Button
                                appearance="default"
                                isDisabled={inCorso || profiloSelezionato.ruolo === 'operatore'}
                                onClick={() => handleCambiaRuolo('operatore')}
                            >
                                🧑‍💻 Rendi operatore
                            </Button>
                        </Inline>
                    </Stack>
                )}
            </Stack>

            {/* --- Badge speciali --- */}
            {profiloSelezionato && (
                <Stack space="space.100">
                    <Heading>🏅 Badge speciali di {profiloSelezionato.nome}</Heading>

                    {/* Badge già posseduti, con pulsante per toglierli */}
                    <Text font={{ weight: 'bold' }}>Assegnati</Text>
                    {profiloSelezionato.specialBadges.length === 0 ? (
                        <Text>Nessun badge speciale.</Text>
                    ) : (
                        <Inline space="space.200" shouldWrap alignBlock="center">
                            {profiloSelezionato.specialBadges.map((key) => {
                                const badge = data.allBadges.find((b) => b.key === key);
                                // Badge presente in KVS ma non più in BADGES: lo ignoriamo
                                if (!badge) return null;
                                return (
                                    <Inline key={key} space="space.050" alignBlock="center">
                                        <Tooltip content={badge.description} position="top">
                                            <Lozenge appearance="success">
                                                {badge.emoji} {badge.name}
                                            </Lozenge>
                                        </Tooltip>
                                        <Button
                                            appearance="danger"
                                            isDisabled={inCorso}
                                            onClick={() => handleRimuoviBadge(badge)}
                                        >
                                            🗑️
                                        </Button>
                                    </Inline>
                                );
                            })}
                        </Inline>
                    )}

                    {/* Badge non ancora posseduti, cliccabili per assegnarli */}
                    <Text font={{ weight: 'bold' }}>Disponibili</Text>
                    {badgeDisponibili.length === 0 ? (
                        <Text>Ha già tutti i badge. 🎉</Text>
                    ) : (
                        <Inline space="space.100" shouldWrap>
                            {badgeDisponibili.map((badge) => (
                                <Tooltip key={badge.key} content={badge.description} position="top">
                                    <Button
                                        appearance="default"
                                        isDisabled={inCorso}
                                        onClick={() => handleAssegnaBadge(badge)}
                                    >
                                        ➕ {badge.emoji} {badge.name}
                                    </Button>
                                </Tooltip>
                            ))}
                        </Inline>
                    )}
                </Stack>
            )}

            <Stack space="space.100">
                <Heading>📊 Profili del team</Heading>
                <Stack space="space.0">
                    <Intestazione />
                    {data.profili.map((profilo) => (
                        <Riga
                            key={profilo.accountId}
                            profilo={profilo}
                            allBadges={data.allBadges}
                        />
                    ))}
                </Stack>
            </Stack>
        </Stack>
    );
};

ForgeReconciler.render(
    <React.StrictMode>
        <AdminPage />
    </React.StrictMode>
);