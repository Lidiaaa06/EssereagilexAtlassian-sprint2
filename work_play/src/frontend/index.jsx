import React, { useState, useEffect } from 'react';
import ForgeReconciler, { Text, ProgressBar, Heading, Stack, Button, Inline, Lozenge, Toggle, Tooltip, Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter, TextArea, SectionMessage } from '@forge/react';
import { invoke } from '@forge/bridge';

const GamificationUser = () => {
  const [data, setData] = useState(null);
  const [mostraCompletate, setMostraCompletate] = useState(false);
  const [modalAperto, setModalAperto] = useState(false);
  const [sfidaSelezionata, setSfidaSelezionata] = useState(null);
  const [descrizione, setDescrizione] = useState('');
  const [modalDettagliAperto, setModalDettagliAperto] = useState(false);
  const [sfidaDettagli, setSfidaDettagli] = useState(null);

  const BADGE_DEMO = [
    { key: 'underdog', emoji: '🐶', name: 'Underdog', description: 'Assegnato per una grande rimonta in classifica.' },
    { key: 'streak', emoji: '🔥', name: 'Streak', description: 'Assegnato per aver chiuso ticket correttamente per 10 giorni di fila.' },
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    invoke('getUserStats').then(result => {
      setData(result);
    });
  };

  const handleAccettaSfida = (sfidaKey) => {
    invoke('accettaSfida', { sfidaKey }).then(() => {
      setModalDettagliAperto(false);
      loadData();
    });
  };

  const handleApriModal = (sfida) => {
    setSfidaSelezionata(sfida);
    setDescrizione('');
    setModalAperto(true);
  };

  const handleApriDettagli = (sfida) => {
    setSfidaDettagli(sfida);
    setModalDettagliAperto(true);
  };

  const handleCompletaConDescrizione = () => {
    invoke('completaSfida', { sfidaKey: sfidaSelezionata.key, descrizione }).then(() => {
      setModalAperto(false);
      setSfidaSelezionata(null);
      setDescrizione('');
      loadData();
    });
  };

  const handleCompletaSenzaDescrizione = () => {
    invoke('completaSfida', { sfidaKey: sfidaSelezionata.key, descrizione: null }).then(() => {
      setModalAperto(false);
      setSfidaSelezionata(null);
      setDescrizione('');
      loadData();
    });
  };

  const getTimer = (scadenza) => {
    const ora = Date.now();
    const diff = scadenza - ora;
    if (diff <= 0) return 'Scaduta';
    const ore = Math.floor(diff / (1000 * 60 * 60));
    const minuti = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${ore}h ${minuti}m`;
  };

  return (
    <Stack space="space.200">
      {data === null ? (
        <Text>Caricamento...</Text>
      ) : (
        <>
          {/* Modal completamento sfida */}
          {modalAperto && sfidaSelezionata && (
            <Modal onClose={() => setModalAperto(false)}>
              <ModalHeader>
                <ModalTitle>📝 Descrivi come hai completato la sfida</ModalTitle>
              </ModalHeader>
              <ModalBody>
                <Stack space="space.100">
                  <Text>{sfidaSelezionata.emoji} {sfidaSelezionata.nome}</Text>
                  <Text>Aggiungi una descrizione per ottenere {sfidaSelezionata.tipo === 'giornaliera' ? '+1' : sfidaSelezionata.tipo === 'settimanale' ? '+2' : '+4'} punti bonus!</Text>
                  <TextArea
                    value={descrizione}
                    onChange={(e) => setDescrizione(e.target.value)}
                    placeholder="Descrivi come hai completato la sfida..."
                  />
                </Stack>
              </ModalBody>
              <ModalFooter>
                <Button appearance="subtle" onClick={handleCompletaSenzaDescrizione}>
                  Completa senza descrizione
                </Button>
                <Button appearance="primary" onClick={handleCompletaConDescrizione}>
                  Completa con descrizione (+bonus)
                </Button>
              </ModalFooter>
            </Modal>
          )}

          {/* Modal dettagli sfida */}
          {modalDettagliAperto && sfidaDettagli && (
            <Modal onClose={() => setModalDettagliAperto(false)}>
              <ModalHeader>
                <ModalTitle>{sfidaDettagli.emoji} {sfidaDettagli.nome}</ModalTitle>
              </ModalHeader>
              <ModalBody>
                <Stack space="space.100">
                  <Text>{sfidaDettagli.descrizione}</Text>
                  <Inline space="space.100">
                    <Lozenge appearance="inprogress">
                      {sfidaDettagli.tipo === 'giornaliera' ? '🌅 Giornaliera' : sfidaDettagli.tipo === 'settimanale' ? '📅 Settimanale' : '📆 Mensile'}
                    </Lozenge>
                    <Lozenge appearance="success">
                      💰 {sfidaDettagli.punti} punti
                    </Lozenge>
                    <Lozenge appearance="moved">
                      🎁 Bonus: +{sfidaDettagli.tipo === 'giornaliera' ? '1' : sfidaDettagli.tipo === 'settimanale' ? '2' : '4'} con descrizione
                    </Lozenge>
                  </Inline>
                </Stack>
              </ModalBody>
              <ModalFooter>
                <Button appearance="subtle" onClick={() => setModalDettagliAperto(false)}>
                  Chiudi
                </Button>
                <Button appearance="primary" onClick={() => handleAccettaSfida(sfidaDettagli.key)}>
                  Accetta sfida
                </Button>
              </ModalFooter>
            </Modal>
          )}

          {/* Sezione utente */}
          <Heading>👤 {data.nome}</Heading>

          {/* Ruolo WorkPlay (distinto dal lozenge decorativo "Help Desk" sotto) */}
          <Inline space="space.100" alignBlock="center">
            <Text>🎭 Ruolo:</Text>
            <Lozenge appearance={data.ruolo === 'supervisore' ? 'new' : 'default'}>
              {data.ruolo === 'supervisore' ? '👔 Supervisore' : '🧑‍💻 Operatore'}
            </Lozenge>
          </Inline>

          {/* Scorciatoia visibile solo ai supervisori */}
          {data.ruolo === 'supervisore' && (
            <SectionMessage
              appearance={data.segnalazioniDaRivedere > 0 ? 'warning' : 'information'}
            >
              {data.segnalazioniDaRivedere > 0 ? (
                <Text>
                  🚩 Hai {data.segnalazioniDaRivedere} segnalazion{data.segnalazioniDaRivedere === 1 ? 'e' : 'i'} antifarming da rivedere.
                  Aprile da Impostazioni Jira → App → WorkPlay Admin.
                </Text>
              ) : (
                <Text>
                  ✅ Nessuna segnalazione da rivedere. Gestisci ruoli e badge da
                  Impostazioni Jira → App → WorkPlay Admin.
                </Text>
              )}
            </SectionMessage>
          )}

          {/* Badge competenza */}
          <Inline space="space.100" alignBlock="center">
            <Text>💼 Ruolo e Competenze:</Text>
            <Lozenge appearance="inprogress">🖥️ Help Desk</Lozenge>
          </Inline>

          {/* Stagione */}
          <Inline space="space.100" alignBlock="center">
            <Lozenge appearance="inprogress">🏟️ Stagione {data.numeroStagione}</Lozenge>
            {data.statoStagione === 'attiva' && (
              <Text>⏳ {data.giorniRimanenti} giorni rimanenti</Text>
            )}
            {data.statoStagione === 'pausa' && (
              <Lozenge appearance="moved">⏸️ Pausa — Nuova stagione tra: {data.countdownNuovaStagione}</Lozenge>
            )}
            {data.statoStagione === 'nuova' && (
              <Lozenge appearance="success">🆕 Nuova stagione iniziata!</Lozenge>
            )}
          </Inline>

          {/* Riepilogo stagione durante la pausa */}
          {data.statoStagione === 'pausa' && data.riepilogoStagione && (
            <Stack space="space.100">
              <Heading>🏁 Riepilogo Stagione {data.riepilogoStagione.numeroStagione}</Heading>
              <Text>🎫 Ticket chiusi: {data.riepilogoStagione.ticketChiusi}</Text>
              <Text>⭐ Punti guadagnati: {data.riepilogoStagione.puntiGuadagnati}</Text>
              <Text>{data.riepilogoStagione.badge.emoji} Badge raggiunto: {data.riepilogoStagione.badge.name}</Text>
              <Text>🥇 Posizione in classifica: {data.riepilogoStagione.posizione}° / {data.riepilogoStagione.totalePartecipanti}</Text>
            </Stack>
          )}

          {/* Punti */}
          <Text>🎫 Ticket chiusi questa stagione: {data.ticketChiusi}</Text>
          <Text>⭐ Punti stagione: {data.punti} (ticket: {data.puntiTicket} + sfide: {data.puntiSfide} + valutazioni: {data.puntiValutazione})</Text>
          <Text>📜 Punti legacy: {data.puntiLegacy}</Text>

          {/* Badge livello */}
          <Heading>🎖️ Badge livello</Heading>
          <Lozenge appearance="success">
            {data.badge.emoji} {data.badge.name}
          </Lozenge>
          {data.badge.nextPoints && (
            <>
              <Text>Prossimo badge: {data.badge.next} ({data.punti}/{data.badge.nextPoints} punti)</Text>
              <ProgressBar
                value={data.punti / data.badge.nextPoints}
                ariaLabel="Progressione verso il prossimo badge"
              />
            </>
          )}

          {/* Le sezioni seguenti (badge speciali, sfide) sono per gli operatori:
              il supervisore gestisce, non compete. In una release futura questo
              spazio ospiterà la creazione di nuove sfide da parte del supervisore. */}
          {data.ruolo !== 'supervisore' && (
            <>
              {/* Badge speciali */}
              <Text> </Text>
              <Heading>🏅 Badge speciali</Heading>
              <Inline space="space.100" shouldWrap>
                {BADGE_DEMO.map(badge => (
                  <Tooltip key={badge.key} content={badge.description} position="top">
                    <Lozenge appearance="inprogress">
                      {badge.emoji} {badge.name}
                    </Lozenge>
                  </Tooltip>
                ))}
              </Inline>

              {/* Sfide in corso */}
              <Text> </Text>
              <Heading>🔥 Sfide in corso</Heading>
              <Inline space="space.100" alignBlock="center">
                <Text>Mostra completate</Text>
                <Toggle
                  isChecked={mostraCompletate}
                  onChange={() => setMostraCompletate(!mostraCompletate)}
                />
              </Inline>
              {data.sfideUtente.length === 0 ? (
                <Text>Nessuna sfida accettata!</Text>
              ) : (
                <Stack space="space.100">
                  {data.sfideUtente
                    .filter(sfida => mostraCompletate ? true : !sfida.completata)
                    .map(sfida => {
                      const dettagli = data.allSfide.find(s => s.key === sfida.key);
                      return dettagli ? (
                        <Stack key={sfida.key} space="space.050">
                          <Inline space="space.100">
                            <Text>{dettagli.emoji} {dettagli.nome}</Text>
                            <Lozenge appearance={sfida.completata ? 'success' : 'default'}>
                              {sfida.completata ? '✅ Completata' : `⏱ ${getTimer(sfida.scadenza)}`}
                            </Lozenge>
                          </Inline>
                          {!sfida.completata && (
                            <Button
                              appearance="primary"
                              onClick={() => handleApriModal(dettagli)}
                            >
                              Segna come completata
                            </Button>
                          )}
                        </Stack>
                      ) : null;
                    })}
                </Stack>
              )}

              {/* Sfide disponibili */}
              <Text> </Text>
              <Heading>📋 Sfide disponibili</Heading>

              <Text>🌅 Giornaliere (+5 punti) — max 3</Text>
              <Stack space="space.050">
                {data.allSfide
                  .filter(s => s.tipo === 'giornaliera' && !data.sfideUtente.find(u => u.key === s.key))
                  .map(sfida => (
                    <Inline key={sfida.key} space="space.100" alignBlock="center">
                      <Button
                        appearance="default"
                        onClick={() => handleApriDettagli(sfida)}
                      >
                        {sfida.emoji} {sfida.nome}
                      </Button>
                    </Inline>
                  ))}
              </Stack>

              <Text>📅 Settimanali (+10 punti) — max 2</Text>
              <Stack space="space.050">
                {data.allSfide
                  .filter(s => s.tipo === 'settimanale' && !data.sfideUtente.find(u => u.key === s.key))
                  .map(sfida => (
                    <Inline key={sfida.key} space="space.100" alignBlock="center">
                      <Button
                        appearance="default"
                        onClick={() => handleApriDettagli(sfida)}
                      >
                        {sfida.emoji} {sfida.nome}
                      </Button>
                    </Inline>
                  ))}
              </Stack>

              <Text>📆 Mensili (+20 punti) — max 1</Text>
              <Stack space="space.050">
                {data.allSfide
                  .filter(s => s.tipo === 'mensile' && !data.sfideUtente.find(u => u.key === s.key))
                  .map(sfida => (
                    <Inline key={sfida.key} space="space.100" alignBlock="center">
                      <Button
                        appearance="default"
                        onClick={() => handleApriDettagli(sfida)}
                      >
                        {sfida.emoji} {sfida.nome}
                      </Button>
                    </Inline>
                  ))}
              </Stack>
            </>
          )}
        </>
      )}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <GamificationUser />
  </React.StrictMode>
);