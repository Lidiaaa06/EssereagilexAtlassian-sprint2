import React, { useState, useEffect, useRef } from 'react';
import ForgeReconciler, {
  Text,
  Heading,
  Stack,
  Box,
  Inline,
  Lozenge,
  Select,
  Button,
  Textfield,
  Tooltip,
  SectionMessage,
} from '@forge/react';
import { invoke } from '@forge/bridge';

// Etichetta leggibile per ogni tipo di flag prodotto da antifarming.js
const ETICHETTE_FLAG = {
  TROPPO_VELOCE: '⚡ Chiuso troppo in fretta',
  SALTO_IN_PROGRESS: '⏭️ Mai passato da In Progress',
  DECANTER: '⏳ Fermo troppo a lungo',
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
  // Persona scelta nel picker: { label: 'Nome Cognome', value: accountId }
  const [personaScelta, setPersonaScelta] = useState(null);
  // Risultati della ricerca utenti Jira, già in forma di option per il Select
  const [risultatiRicerca, setRisultatiRicerca] = useState([]);
  const [cercando, setCercando] = useState(false);
  // Timer del debounce: senza, ogni tasto premuto sarebbe una chiamata a Jira
  const timerRicerca = useRef(null);
  // Form nuova sfida custom
  const [sfideCustom, setSfideCustom] = useState([]);
  const [nuovaSfida, setNuovaSfida] = useState({ nome: '', emoji: '', tipo: 'giornaliera', descrizione: '' });
  // Valore configurabile: punti assegnati a ogni ticket completato
  const [puntiPerTicket, setPuntiPerTicket] = useState('3');
  // Richieste di inserimento in Hall of Fame, in attesa di approvazione
  const [richiesteHOF, setRichiesteHOF] = useState([]);
  // Config golden ticket: soglia "guadagnato", max accumulabili, ticket di partenza
  const [sogliaGT, setSogliaGT] = useState('100');
  const [maxGT, setMaxGT] = useState('3');
  const [partenzaGT, setPartenzaGT] = useState('1');
  // Golden ticket usati (elenco per il supervisore)
  const [gtUsati, setGtUsati] = useState([]);

  useEffect(() => {
    caricaDati();
  }, []);

  const caricaDati = () => {
    // Chiamate indipendenti: le lanciamo insieme.
    return Promise.all([
      invoke('getAdminData'),
      invoke('getSegnalazioni'),
      invoke('getSfideCustom'),
      invoke('getConfigPunti'),
      invoke('getRichiesteHallOfFame'),
      invoke('getConfigGoldenTicket'),
      invoke('getGoldenTicketUsati'),
    ]).then(([adminData, risultatoSegnalazioni, risultatoSfide, config, risultatoHOF, configGT, risultatoUsati]) => {
      setData(adminData);
      // Se l'utente non è supervisore il resolver risponde { errore }
      setSegnalazioni(risultatoSegnalazioni.segnalazioni || []);
      setSfideCustom(risultatoSfide.sfideCustom || []);
      setPuntiPerTicket(String(config.puntiPerTicket));
      setRichiesteHOF(risultatoHOF.richieste || []);
      setSogliaGT(String(configGT.soglia));
      setMaxGT(String(configGT.max));
      setPartenzaGT(String(configGT.partenza));
      setGtUsati(risultatoUsati.usati || []);
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

  // Cerca utenti Jira mentre l'admin digita.
  // Il debounce a 300ms accorpa la raffica di tasti in una sola chiamata:
  // senza, scrivere "Roberto" farebbe 7 invoke e 7 richieste REST.
  const cercaUtenti = (testo) => {
    if (timerRicerca.current) clearTimeout(timerRicerca.current);

    if (testo.trim().length < 2) {
      setRisultatiRicerca([]);
      setCercando(false);
      return;
    }

    setCercando(true);
    timerRicerca.current = setTimeout(() => {
      invoke('cercaUtentiJira', { query: testo.trim() })
        .then((result) => {
          setRisultatiRicerca(
            result.errore
              ? []
              : result.utenti.map((u) => ({ label: u.nome, value: u.accountId }))
          );
          setCercando(false);
        })
        .catch(() => {
          setRisultatiRicerca([]);
          setCercando(false);
        });
    }, 300);
  };

  // Aggiunge il membro scelto nel picker. Il backend rivalida comunque
  // l'accountId: il picker è comodità per l'admin, non un controllo di sicurezza.
  const handleAggiungiMembro = () => {
    if (inCorso || !personaScelta) return;
    setInCorso(true);
    setMessaggio(null);
    invoke('aggiungiMembroAdmin', { accountId: personaScelta.value })
      .then((result) => {
        if (result.errore) {
          setMessaggio({ tipo: 'error', testo: result.errore });
          setInCorso(false);
          return;
        }
        setMessaggio({ tipo: 'success', testo: `${result.nome} aggiunto al team.` });
        setPersonaScelta(null);
        setRisultatiRicerca([]);
        return caricaDati().then(() => setInCorso(false));
      })
      .catch(() => {
        setMessaggio({ tipo: 'error', testo: 'Errore imprevisto. Riprova.' });
        setInCorso(false);
      });
  };

  const handleRimuoviMembro = (membro) => {
    eseguiAzione(
      'rimuoviMembroAdmin',
      { accountId: membro.accountId },
      `${membro.nome} rimosso dal team.`
    );
  };

  // Crea una sfida custom. Messaggio dinamico, quindi non usa eseguiAzione.
  const handleCreaSfida = () => {
    if (inCorso || !nuovaSfida.nome.trim()) return;
    setInCorso(true);
    setMessaggio(null);
    invoke('aggiungiSfidaAdmin', nuovaSfida)
      .then((result) => {
        if (result.errore) {
          setMessaggio({ tipo: 'error', testo: result.errore });
          setInCorso(false);
          return;
        }
        setMessaggio({ tipo: 'success', testo: `Sfida "${result.sfida.nome}" creata.` });
        setNuovaSfida({ nome: '', emoji: '', tipo: 'giornaliera', descrizione: '' });
        return caricaDati().then(() => setInCorso(false));
      })
      .catch(() => {
        setMessaggio({ tipo: 'error', testo: 'Errore imprevisto. Riprova.' });
        setInCorso(false);
      });
  };

  const handleRimuoviSfida = (sfida) => {
    eseguiAzione(
      'rimuoviSfidaAdmin',
      { key: sfida.key },
      `Sfida "${sfida.nome}" rimossa.`
    );
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

  const handleSalvaGoldenTicket = () => {
    eseguiAzione(
      'setConfigGoldenTicket',
      { soglia: Number(sogliaGT), max: Number(maxGT), partenza: Number(partenzaGT) },
      'Configurazione golden ticket salvata.'
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

  if (data === null) return <Text>Caricamento pannello admin...</Text>;

  // Chi non è né supervisore né amministratore Jira non ha nulla da fare qui.
  // I due permessi aprono sezioni diverse: admin Jira → gestione membri;
  // supervisore → ruoli, badge, segnalazioni.
  if (!data.isSupervisore && !data.isAdminJira) {
    return (
      <SectionMessage appearance="warning">
        <Text>
          Accesso riservato. Contatta un amministratore o il supervisore del team
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

      {/* --- Gestione membri (solo amministratori Jira) --- */}
      {data.isAdminJira && (
        <Stack space="space.100">
          <Heading>👥 Gestione membri</Heading>
          <Text>
            Cerca una persona per nome fra gli utenti del sito Jira e aggiungila al team.
          </Text>
          <Inline space="space.100" alignBlock="end">
            <Box xcss={{ width: '360px' }}>
              <Select
                isSearchable
                isClearable
                placeholder="Digita almeno 2 lettere del nome..."
                isLoading={cercando}
                options={risultatiRicerca}
                value={personaScelta}
                onInputChange={(testo) => cercaUtenti(testo)}
                onChange={(opzione) => setPersonaScelta(opzione)}
              />
            </Box>
            <Button
              appearance="primary"
              isDisabled={inCorso || !personaScelta}
              onClick={handleAggiungiMembro}
            >
              ➕ Aggiungi
            </Button>
          </Inline>

          {data.profili.length === 0 ? (
            <Text>Nessun membro ancora. Aggiungi il primo per iniziare.</Text>
          ) : (
            <Stack space="space.050">
              {data.profili.map((p) => (
                <Inline key={p.accountId} space="space.100" alignBlock="center">
                  <Box xcss={{ width: '200px' }}><Text>{p.nome}</Text></Box>
                  <Button
                    appearance="danger"
                    isDisabled={inCorso}
                    onClick={() => handleRimuoviMembro(p)}
                  >
                    🗑️ Rimuovi
                  </Button>
                </Inline>
              ))}
            </Stack>
          )}
        </Stack>
      )}

      {/* Le sezioni seguenti sono per i supervisori del sistema interno.
          Un admin Jira che NON è supervisore vede solo la gestione membri sopra. */}
      {data.isSupervisore && (
        <>
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
                    {/* Decanter: mostra il dettaglio (stato + giorni) invece del
                        tempo In Progress, che per queste segnalazioni non c'è. */}
                    {s.dettaglio
                      ? <Text>⏳ {s.dettaglio}</Text>
                      : <Text>⏱ In Progress: {formatDurata(s.secondiInProgress)}</Text>}
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

      {/* --- Golden ticket --- */}
      <Stack space="space.100">
        <Heading>🎫 Golden ticket</Heading>
        <Text>
          Soglia = punti totali stagionali per guadagnare un ticket. Max = quanti
          se ne possono accumulare in una stagione. Partenza = quanti se ne ricevono
          a inizio stagione.
        </Text>
        <Inline space="space.200" alignBlock="end" shouldWrap>
          <Stack space="space.050">
            <Text font={{ weight: 'bold' }}>Soglia "guadagnato"</Text>
            <Box xcss={{ width: '160px' }}>
              <Textfield type="number" value={sogliaGT} onChange={(e) => setSogliaGT(e.target.value)} />
            </Box>
          </Stack>
          <Stack space="space.050">
            <Text font={{ weight: 'bold' }}>Max accumulabili</Text>
            <Box xcss={{ width: '120px' }}>
              <Textfield type="number" value={maxGT} onChange={(e) => setMaxGT(e.target.value)} />
            </Box>
          </Stack>
          <Stack space="space.050">
            <Text font={{ weight: 'bold' }}>Ticket di partenza</Text>
            <Box xcss={{ width: '120px' }}>
              <Textfield type="number" value={partenzaGT} onChange={(e) => setPartenzaGT(e.target.value)} />
            </Box>
          </Stack>
        </Inline>
        <Inline>
          <Button appearance="primary" isDisabled={inCorso} onClick={handleSalvaGoldenTicket}>
            Salva
          </Button>
        </Inline>
      </Stack>

      {/* --- Golden ticket usati --- */}
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center">
          <Heading>🎫 Golden ticket usati</Heading>
          {gtUsati.length > 0 && (
            <Lozenge appearance="new">{gtUsati.length}</Lozenge>
          )}
        </Inline>
        <Text>Richieste di supporto degli operatori tramite golden ticket.</Text>
        {gtUsati.length === 0 ? (
          <Text>Nessun golden ticket usato finora. 👍</Text>
        ) : (
          <Stack space="space.050">
            {gtUsati.map((u, i) => (
              <Box
                key={`${u.issueKey}-${u.ts}-${i}`}
                padding="space.150"
                backgroundColor="color.background.neutral"
              >
                <Inline space="space.100" alignBlock="center" shouldWrap>
                  <Text font={{ weight: 'bold' }}>{u.issueKey}</Text>
                  <Text>👤 {u.nome}</Text>
                  <Text>🕐 {formatData(u.ts)}</Text>
                </Inline>
              </Box>
            ))}
          </Stack>
        )}
      </Stack>

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

      {/* --- Sfide personalizzate --- */}
      <Stack space="space.100">
        <Heading>🎲 Sfide personalizzate</Heading>
        <Text>
          Crea sfide extra per il team. Seguono le stesse regole di tipo e punti
          delle sfide standard (giornaliera 5, settimanale 10, mensile 20).
        </Text>

        <Inline space="space.100" alignBlock="end" shouldWrap>
          <Box xcss={{ width: '80px' }}>
            <Textfield
              placeholder="Emoji"
              value={nuovaSfida.emoji}
              onChange={(e) => setNuovaSfida({ ...nuovaSfida, emoji: e.target.value })}
            />
          </Box>
          <Box xcss={{ width: '260px' }}>
            <Textfield
              placeholder="Nome della sfida"
              value={nuovaSfida.nome}
              onChange={(e) => setNuovaSfida({ ...nuovaSfida, nome: e.target.value })}
            />
          </Box>
          <Box xcss={{ width: '160px' }}>
            <Select
              options={[
                { label: '🌅 Giornaliera', value: 'giornaliera' },
                { label: '📅 Settimanale', value: 'settimanale' },
                { label: '📆 Mensile', value: 'mensile' },
              ]}
              value={
                [
                  { label: '🌅 Giornaliera', value: 'giornaliera' },
                  { label: '📅 Settimanale', value: 'settimanale' },
                  { label: '📆 Mensile', value: 'mensile' },
                ].find((o) => o.value === nuovaSfida.tipo)
              }
              onChange={(opt) => setNuovaSfida({ ...nuovaSfida, tipo: opt.value })}
            />
          </Box>
        </Inline>
        <Box xcss={{ width: '520px' }}>
          <Textfield
            placeholder="Descrizione (opzionale)"
            value={nuovaSfida.descrizione}
            onChange={(e) => setNuovaSfida({ ...nuovaSfida, descrizione: e.target.value })}
          />
        </Box>
        <Inline>
          <Button
            appearance="primary"
            isDisabled={inCorso || !nuovaSfida.nome.trim()}
            onClick={handleCreaSfida}
          >
            ➕ Crea sfida
          </Button>
        </Inline>

        {sfideCustom.length === 0 ? (
          <Text>Nessuna sfida personalizzata.</Text>
        ) : (
          <Stack space="space.050">
            {sfideCustom.map((s) => (
              <Inline key={s.key} space="space.100" alignBlock="center">
                <Lozenge appearance="new">
                  {s.emoji} {s.nome} · {s.tipo} · {s.punti}pt
                </Lozenge>
                <Button
                  appearance="danger"
                  isDisabled={inCorso}
                  onClick={() => handleRimuoviSfida(s)}
                >
                  🗑️
                </Button>
              </Inline>
            ))}
          </Stack>
        )}
      </Stack>
        </>
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