import React, { useState } from 'react';
import Lozenge from '@atlaskit/lozenge';
import Avatar from '@atlaskit/avatar';
import Textfield from '@atlaskit/textfield';
import Button from '@atlaskit/button/new';
import { token } from '@atlaskit/tokens';
import UserPicker from './UserPicker';

// Albero dell'organizzazione.
//
// L'albero è IMPLICITO (vedi src/resolvers/gruppi.js): un gruppo figlio compare
// alla stessa profondità dei developers del padre, perché il suo Team Leader
// È un developer del padre. Nel mockup è Fortuna Conte: developer di Anna
// Lombardi e insieme TL del Team AMS Windchill.
//
// Indentazione: 16px alla radice, +32px per livello, come da Figma.
const indent = (livello) => 16 + livello * 32;

const RigaBase = ({ livello, selezionata, onClick, children }) => (
  <div
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: token('space.100'),
      paddingLeft: indent(livello),
      paddingRight: token('space.200'),
      paddingTop: token('space.100'),
      paddingBottom: token('space.100'),
      cursor: onClick ? 'pointer' : 'default',
      backgroundColor: selezionata
        ? token('color.background.selected')
        : 'transparent',
    }}
  >
    {children}
  </div>
);

// Riga di un gruppo: il nodo è la PERSONA che lo guida, con accanto il nome del team.
function RigaGruppo({
  gruppo,
  livello,
  nomePersona,
  avatarPersona,
  nomeTlPadre,
  espanso,
  onToggle,
  selezionato,
  onSeleziona,
  onModifica,
}) {
  return (
    <RigaBase livello={livello} selezionata={selezionato} onClick={onSeleziona}>
      <span
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        style={{
          color: token('color.text.subtlest'),
          fontSize: 12,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {espanso ? '▾' : '▸'}
      </span>

      <Avatar size="xsmall" src={avatarPersona || undefined} name={nomePersona} />

      <strong style={{ color: token('color.text'), fontSize: 14 }}>
        {nomePersona}
      </strong>

      <Lozenge appearance="inprogress">
        {`👔 Team Leader · ${gruppo.nome}`}
      </Lozenge>

      {/* Doppio ruolo: guida un gruppo ED è developer di quello sopra.
          È la relazione che crea la gerarchia, quindi va resa esplicita. */}
      {nomeTlPadre && (
        <Lozenge appearance="new">{`anche developer di ${nomeTlPadre}`}</Lozenge>
      )}

      <span style={{ color: token('color.text.subtlest'), fontSize: 12 }}>
        {gruppo.developers.length === 1
          ? '1 developer'
          : `${gruppo.developers.length} developers`}
      </span>

      <span style={{ flex: 1 }} />

      <span
        onClick={(e) => { e.stopPropagation(); onModifica(gruppo); }}
        title="Modifica gruppo"
        style={{ color: token('color.text.subtlest'), fontSize: 13, cursor: 'pointer' }}
      >
        ✎
      </span>
    </RigaBase>
  );
}

// Riga di un developer semplice (non guida alcun gruppo).
function RigaDeveloper({ livello, nome, avatar, onRimuovi }) {
  return (
    <RigaBase livello={livello}>
      <span style={{ color: token('color.text.subtlest'), fontSize: 12 }}>·</span>
      <Avatar size="xsmall" src={avatar || undefined} name={nome} />
      <span style={{ color: token('color.text'), fontSize: 14 }}>{nome}</span>
      <span style={{ flex: 1 }} />
      <span
        onClick={onRimuovi}
        title="Rimuovi dal gruppo"
        style={{ color: token('color.text.subtlest'), fontSize: 12, cursor: 'pointer' }}
      >
        ✕
      </span>
    </RigaBase>
  );
}

// Inline-add: da riga fantasma a picker attivo.
// L'etichetta dice sempre DOVE finirà la persona, così l'admin non deve
// ricostruire mentalmente l'ereditarietà guardando l'indentazione.
function InlineAdd({ livello, gruppo, attivo, onAttiva, onAggiungi }) {
  if (!attivo) {
    return (
      <RigaBase livello={livello} onClick={onAttiva}>
        <span style={{ color: token('color.link'), fontSize: 13 }}>
          {`+ Aggiungi developer al ${gruppo.nome}…`}
        </span>
      </RigaBase>
    );
  }

  return (
    <RigaBase livello={livello}>
      <span style={{ color: token('color.link'), fontSize: 14, fontWeight: 600 }}>+</span>
      <div style={{ width: 280 }}>
        <UserPicker
          autoFocus
          placeholder="Cerca utente Jira…"
          onChange={(opzione) => opzione && onAggiungi(gruppo.id, opzione.value)}
        />
      </div>
      <span style={{ color: token('color.text.subtlest'), fontSize: 12 }}>
        {`→ verrà aggiunto a ${gruppo.nome}`}
      </span>
    </RigaBase>
  );
}

export default function TreeView({
  albero,
  persone,
  organizzazione,
  selezionato,
  onSeleziona,
  onAggiungiDeveloper,
  onRimuoviDeveloper,
  onModifica,
  onCreaRadice,
  onRinominaOrganizzazione,
}) {
  const [chiusi, setChiusi] = useState({});
  const [addAttivo, setAddAttivo] = useState(null);
  const [rinominando, setRinominando] = useState(false);
  const [bozzaOrg, setBozzaOrg] = useState('');

  const salvaOrg = () => {
    const pulito = bozzaOrg.trim();
    if (pulito === '' || pulito === organizzazione) {
      setRinominando(false);
      return;
    }
    setRinominando(false);
    onRinominaOrganizzazione(pulito);
  };

  // persone[accountId] = { nome, avatar }. Chi non si riesce a risolvere
  // ricade sull'accountId: meglio una riga brutta che una persona sparita.
  const nome = (accountId) => persone[accountId]?.nome || accountId;
  const avatar = (accountId) => persone[accountId]?.avatar || '';

  const toggle = (id) =>
    setChiusi((c) => ({ ...c, [id]: !c[id] }));

  const renderGruppo = (gruppo, livello, nomeTlPadre) => {
    const espanso = !chiusi[gruppo.id];
    const idFigli = gruppo.figli.map((f) => f.teamLeaderId);
    // I developers che guidano un sotto-team vengono resi come nodi di gruppo,
    // non come righe semplici: sono lo stesso oggetto visto da due lati.
    const semplici = gruppo.developers.filter((d) => !idFigli.includes(d));

    return (
      <div key={gruppo.id}>
        <RigaGruppo
          gruppo={gruppo}
          livello={livello}
          nomePersona={nome(gruppo.teamLeaderId)}
          avatarPersona={avatar(gruppo.teamLeaderId)}
          nomeTlPadre={nomeTlPadre}
          espanso={espanso}
          onToggle={() => toggle(gruppo.id)}
          selezionato={selezionato === gruppo.id}
          onSeleziona={() => onSeleziona(gruppo.id)}
          onModifica={onModifica}
        />

        {espanso && (
          <>
            {semplici.map((accountId) => (
              <RigaDeveloper
                key={accountId}
                livello={livello + 1}
                nome={nome(accountId)}
                avatar={avatar(accountId)}
                onRimuovi={() => onRimuoviDeveloper(gruppo.id, accountId)}
              />
            ))}

            {gruppo.figli.map((figlio) =>
              renderGruppo(figlio, livello + 1, nome(gruppo.teamLeaderId))
            )}

            <InlineAdd
              livello={livello + 1}
              gruppo={gruppo}
              attivo={addAttivo === gruppo.id}
              onAttiva={() => setAddAttivo(gruppo.id)}
              onAggiungi={(gruppoId, accountId) => {
                setAddAttivo(null);
                onAggiungiDeveloper(gruppoId, accountId);
              }}
            />
          </>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        border: `1px solid ${token('color.border')}`,
        borderRadius: 8,
        paddingTop: token('space.100'),
        paddingBottom: token('space.100'),
      }}
    >
      <RigaBase livello={0}>
        <span style={{ color: token('color.text.subtlest'), fontSize: 12 }}>▾</span>

        {rinominando ? (
          <>
            <div style={{ width: 260 }}>
              <Textfield
                autoFocus
                value={bozzaOrg}
                onChange={(e) => setBozzaOrg(e.target.value)}
                // Invio salva, Esc annulla: rinominare è l'unica cosa che si fa
                // qui dentro, costringere al mouse sarebbe gratuito.
                onKeyDown={(e) => {
                  if (e.key === 'Enter') salvaOrg();
                  if (e.key === 'Escape') setRinominando(false);
                }}
              />
            </div>
            <Button appearance="primary" spacing="compact" onClick={salvaOrg}>
              Salva
            </Button>
            <Button
              appearance="subtle"
              spacing="compact"
              onClick={() => setRinominando(false)}
            >
              Annulla
            </Button>
          </>
        ) : (
          <>
            <span style={{ color: token('color.text'), fontSize: 14 }}>
              {`🏢 ${organizzazione}`}
            </span>
            <span
              onClick={() => { setBozzaOrg(organizzazione); setRinominando(true); }}
              title="Rinomina l'organizzazione"
              style={{ color: token('color.text.subtlest'), fontSize: 13, cursor: 'pointer' }}
            >
              ✎
            </span>
          </>
        )}
      </RigaBase>

      {albero.length === 0 ? (
        <RigaBase livello={1}>
          <span style={{ color: token('color.text.subtlest'), fontSize: 13 }}>
            Nessun gruppo ancora. Creane uno per iniziare.
          </span>
        </RigaBase>
      ) : (
        albero.map((gruppo) => renderGruppo(gruppo, 1, null))
      )}

      <RigaBase livello={1} onClick={onCreaRadice}>
        <span style={{ color: token('color.text.subtlest'), fontSize: 13 }}>
          + Crea gruppo di primo livello…
        </span>
      </RigaBase>
    </div>
  );
}
