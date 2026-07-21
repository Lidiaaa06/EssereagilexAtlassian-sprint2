import React, { useEffect, useState } from 'react';
import Button from '@atlaskit/button/new';
import Lozenge from '@atlaskit/lozenge';
import Avatar from '@atlaskit/avatar';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';
import UserPicker from './UserPicker';

// Pannello di destra: dettaglio del gruppo selezionato nell'albero.
export default function DettaglioGruppo({
  gruppo,
  persone,
  gruppoPadre,
  gruppiPerTeamLeader,
  onModifica,
  onElimina,
  onAggiungiDeveloper,
  onRimuoviDeveloper,
}) {
  const [aggiungendo, setAggiungendo] = useState(false);
  const [confermaElimina, setConfermaElimina] = useState(false);

  // Cambiando gruppo la conferma va azzerata: altrimenti si selezionerebbe un
  // altro gruppo trovandosi già il pulsante rosso armato, pronto a colpire
  // qualcosa che non si intendeva eliminare.
  useEffect(() => {
    setConfermaElimina(false);
    setAggiungendo(false);
  }, [gruppo?.id]);

  // persone[accountId] = { nome, avatar } — stessa forma usata dall'albero.
  const nome = (accountId) => persone[accountId]?.nome || accountId;
  const avatar = (accountId) => persone[accountId]?.avatar || '';

  if (!gruppo) {
    return (
      <div style={pannello}>
        <span style={{ color: token('color.text.subtlest'), fontSize: 13 }}>
          Seleziona un gruppo nell'albero per vederne il dettaglio.
        </span>
      </div>
    );
  }

  // I figli arrivano già annidati da getAlberoGruppi: non serve ricalcolarli.
  const haFigli = Boolean(gruppo.figli && gruppo.figli.length > 0);

  return (
    <div style={pannello}>
      <div style={{ display: 'flex', alignItems: 'center', gap: token('space.100') }}>
        <strong style={{ fontSize: 17, color: token('color.text') }}>
          {gruppo.nome}
        </strong>
        <span style={{ flex: 1 }} />
        <Button appearance="subtle" onClick={() => onModifica(gruppo)}>
          ✎ Modifica
        </Button>

        {/* REGOLA 1: con sotto-gruppi il pulsante è disabilitato, col motivo
            nel tooltip. La regola si vede PRIMA di cliccare, non dopo. */}
        {!confermaElimina && (
          <Button
            appearance="subtle"
            isDisabled={haFigli}
            title={
              haFigli
                ? `Ha ${gruppo.figli.length} sotto-gruppi: eliminali prima, partendo dai più bassi`
                : 'Elimina il gruppo'
            }
            onClick={() => setConfermaElimina(true)}
          >
            🗑 Elimina
          </Button>
        )}
      </div>

      {/* REGOLA 3: la conferma è un secondo passaggio esplicito. Sta qui, sotto
          il nome del gruppo, così è chiaro QUALE gruppo sta per sparire. */}
      {confermaElimina && (
        <SectionMessage appearance="warning" title={`Eliminare "${gruppo.nome}"?`}>
          <span style={{ fontSize: 13 }}>
            I {gruppo.developers.length} developers resteranno senza gruppo.
            Punti, badge e storico non vengono toccati.
          </span>
          <div style={{ display: 'flex', gap: token('space.100'), marginTop: token('space.150') }}>
            <Button appearance="danger" onClick={() => onElimina(gruppo.id)}>
              Sì, elimina
            </Button>
            <Button appearance="subtle" onClick={() => setConfermaElimina(false)}>
              Annulla
            </Button>
          </div>
        </SectionMessage>
      )}

      <span style={{ display: 'flex', alignItems: 'center', gap: token('space.100') }}>
        <Avatar
          size="small"
          src={avatar(gruppo.teamLeaderId) || undefined}
          name={nome(gruppo.teamLeaderId)}
        />
        <strong style={{ fontSize: 14, color: token('color.text') }}>
          {`👔 Team Leader: ${nome(gruppo.teamLeaderId)}`}
        </strong>
      </span>

      <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>
        {gruppoPadre
          ? `Riporta a: ${nome(gruppoPadre.teamLeaderId)} (${gruppoPadre.nome})`
          : 'Gruppo di primo livello'}
      </span>

      <strong style={{ fontSize: 13, color: token('color.text.subtlest') }}>
        {`Developers (${gruppo.developers.length})`}
      </strong>

      {gruppo.developers.map((accountId) => {
        // Se questa persona guida un suo gruppo non è rimovibile da qui:
        // toglierla staccherebbe l'intero sottoalbero. Il backend lo rifiuta
        // comunque, ma mostrarlo qui evita all'admin un errore inutile.
        const suoGruppo = gruppiPerTeamLeader[accountId];

        return (
          <div
            key={accountId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: token('space.100'),
              paddingTop: token('space.075'),
              paddingBottom: token('space.075'),
            }}
          >
            <Avatar
              size="xsmall"
              src={avatar(accountId) || undefined}
              name={nome(accountId)}
            />
            <span style={{ fontSize: 14, color: token('color.text') }}>
              {nome(accountId)}
            </span>

            {suoGruppo && (
              <Lozenge appearance="new">
                {`Team Leader · ${suoGruppo.nome}`}
              </Lozenge>
            )}

            <span style={{ flex: 1 }} />

            {suoGruppo ? (
              <span
                title="Non eliminabile: è Team Leader di un gruppo"
                style={{ fontSize: 12 }}
              >
                🔒
              </span>
            ) : (
              <span
                onClick={() => onRimuoviDeveloper(gruppo.id, accountId)}
                title="Rimuovi dal gruppo"
                style={{
                  fontSize: 12,
                  color: token('color.text.danger'),
                  cursor: 'pointer',
                }}
              >
                ✕
              </span>
            )}
          </div>
        );
      })}

      {gruppo.developers.some((d) => gruppiPerTeamLeader[d]) && (
        <span style={{ fontSize: 11, color: token('color.text.subtlest') }}>
          🔒 = non eliminabile: è Team Leader di un gruppo. Prima riassegna o
          elimina il suo gruppo.
        </span>
      )}

      {aggiungendo ? (
        <UserPicker
          autoFocus
          onChange={(opzione) => {
            if (!opzione) return;
            setAggiungendo(false);
            onAggiungiDeveloper(gruppo.id, opzione.value);
          }}
        />
      ) : (
        <Button appearance="default" onClick={() => setAggiungendo(true)}>
          + Aggiungi developer…
        </Button>
      )}
    </div>
  );
}

const pannello = {
  width: 400,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: token('space.150'),
  border: `1px solid ${token('color.border')}`,
  borderRadius: 8,
  padding: `${token('space.200')} ${token('space.250')}`,
};
