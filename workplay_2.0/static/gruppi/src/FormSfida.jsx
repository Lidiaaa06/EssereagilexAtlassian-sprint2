import React, { useState } from 'react';
import Button from '@atlaskit/button/new';
import Textfield from '@atlaskit/textfield';
import TextArea from '@atlaskit/textarea';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';

// Contenuto della modale "Nuova sfida" / "Modifica sfida". Frame Figma 73:140.
//
// Come per FormGruppo, qui NON c'è un <Modal> Atlaskit: cornice, titolo e
// chiusura le disegna il prodotto, perché la modale è aperta dal Modal di
// @forge/bridge (una modale Atlaskit resterebbe confinata nell'iframe).
//
// La categoria non è modificabile: cambiarla sposterebbe la sfida di limiti e
// scadenze, mentre utenti potrebbero averla già accettata con quelle vecchie.
// Per questo compare nel titolo della modale, non come campo.
export default function FormSfida({ categoria, sfida, onConferma, onAnnulla }) {
  const inModifica = Boolean(sfida);

  const [nome, setNome] = useState(sfida?.nome || '');
  const [emoji, setEmoji] = useState(sfida?.emoji || '');
  const [descrizione, setDescrizione] = useState(sfida?.descrizione || '');
  const [punti, setPunti] = useState(
    sfida ? sfida.punti : (categoria?.puntiDefault ?? 5)
  );
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState(null);

  const conferma = () => {
    if (inCorso || !nome.trim()) return;
    setInCorso(true);
    setErrore(null);

    Promise.resolve(
      onConferma({
        nome: nome.trim(),
        emoji: emoji.trim(),
        descrizione: descrizione.trim(),
        punti,
      })
    ).catch((e) => {
      setErrore(e?.message || 'Errore imprevisto. Riprova.');
      setInCorso(false);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: token('space.200') }}>
      {errore && <SectionMessage appearance="error">{errore}</SectionMessage>}

      <div style={{ display: 'flex', gap: token('space.100'), alignItems: 'flex-end' }}>
        <div style={{ width: 72 }}>
          <label style={etichetta}>Icona</label>
          <Textfield
            placeholder="🎯"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={etichetta}>Titolo</label>
          <Textfield
            autoFocus
            placeholder="es. Chiudi un ticket con 5 stelle"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') conferma(); }}
          />
        </div>
      </div>

      <div>
        <label style={etichetta}>Descrizione</label>
        <TextArea
          minimumRows={3}
          placeholder="Cosa deve fare il developer per completarla, visibile nel catalogo…"
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: token('space.150') }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 13, color: token('color.text') }}>Punteggio</strong>
          <div style={{ fontSize: 11, color: token('color.text.subtlest') }}>
            {inModifica
              ? `Default della categoria: +${categoria?.puntiDefault}. Cambialo solo se questo item vale di più o di meno.`
              : `Precompilato col default della categoria (+${categoria?.puntiDefault}). Modificalo solo se questo item vale di più o di meno.`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: token('space.050') }}>
          <Button
            spacing="compact"
            isDisabled={punti <= 1}
            onClick={() => setPunti((p) => p - 1)}
          >
            −
          </Button>
          <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 600, fontSize: 13 }}>
            {punti}
          </span>
          <Button
            spacing="compact"
            isDisabled={punti >= 999}
            onClick={() => setPunti((p) => p + 1)}
          >
            +
          </Button>
        </div>
      </div>

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
          isDisabled={!nome.trim() || inCorso}
          onClick={conferma}
        >
          {inModifica ? 'Salva' : 'Aggiungi Item'}
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
