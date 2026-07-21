import React, { useState } from 'react';
import Button from '@atlaskit/button/new';
import Textfield from '@atlaskit/textfield';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';
import UserPicker from './UserPicker';

// Contenuto della modale Crea / Modifica gruppo.
//
// NON contiene un <Modal> Atlaskit: la cornice, il titolo e il pulsante di
// chiusura li disegna il prodotto, perché questa entry viene aperta dal Modal
// di @forge/bridge. Qui c'è solo il form.
//
// In creazione raccoglie nome + Team Leader + N developers e li invia in UNA
// chiamata (creaGruppoCompletoAdmin): creare il gruppo e poi aggiungere i
// developers uno a uno lascerebbe gruppi a metà se una validazione fallisce.
//
// In modifica il backend sa solo rinominare: Team Leader e developers si
// gestiscono dall'albero, quindi quei campi sono nascosti invece che finti.
export default function FormGruppo({ gruppo, onConferma, onAnnulla }) {
  const inModifica = Boolean(gruppo);

  const [nome, setNome] = useState(gruppo ? gruppo.nome : '');
  const [teamLeader, setTeamLeader] = useState(null);
  const [developers, setDevelopers] = useState([]);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState(null);

  const conferma = () => {
    if (inCorso) return;
    setInCorso(true);
    setErrore(null);

    Promise.resolve(
      onConferma({
        nome: nome.trim(),
        teamLeaderId: teamLeader ? teamLeader.value : null,
        developers: developers.map((d) => d.value),
      })
    ).catch((e) => {
      setErrore(e?.message || 'Errore imprevisto. Riprova.');
      setInCorso(false);
    });
  };

  const puoConfermare = inModifica
    ? nome.trim().length > 0
    : nome.trim().length > 0 && teamLeader !== null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: token('space.200') }}>
      {errore && <SectionMessage appearance="error">{errore}</SectionMessage>}

      <div>
        <label style={etichetta}>Nome team</label>
        <Textfield
          autoFocus
          placeholder="es. Team AMS Atlassian"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </div>

      {!inModifica && (
        <>
          <div>
            <label style={etichetta}>Team Leader</label>
            <UserPicker value={teamLeader} onChange={setTeamLeader} />
          </div>

          <div>
            <label style={etichetta}>Aggiungi Developers</label>
            <UserPicker
              value={null}
              onChange={(opzione) => {
                if (!opzione) return;
                // Niente doppioni: il backend li rifiuterebbe comunque, ma è
                // meglio non farli nemmeno comparire fra i chip.
                setDevelopers((precedenti) =>
                  precedenti.some((d) => d.value === opzione.value)
                    ? precedenti
                    : [...precedenti, opzione]
                );
              }}
            />
          </div>

          <div>
            <span style={etichetta}>{`Membri del team (${developers.length})`}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: token('space.100') }}>
              {developers.map((d) => (
                <span key={d.value} style={chip}>
                  {d.label}
                  <span
                    onClick={() =>
                      setDevelopers((p) => p.filter((x) => x.value !== d.value))
                    }
                    style={{ cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                  >
                    ✕
                  </span>
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {inModifica && (
        <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>
          Team Leader e developers si gestiscono direttamente nell'albero.
        </span>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: token('space.100'),
          paddingTop: token('space.100'),
        }}
      >
        <Button appearance="subtle" onClick={onAnnulla}>Annulla</Button>
        <Button
          appearance="primary"
          isDisabled={!puoConfermare || inCorso}
          onClick={conferma}
        >
          {inModifica ? 'Salva' : 'Crea gruppo'}
        </Button>
      </div>
    </div>
  );
}

const etichetta = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: token('color.text'),
  marginBottom: token('space.075'),
};

const chip = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: token('space.075'),
  backgroundColor: token('color.background.selected'),
  color: token('color.text'),
  borderRadius: 12,
  padding: `${token('space.050')} ${token('space.100')}`,
  fontSize: 13,
};
