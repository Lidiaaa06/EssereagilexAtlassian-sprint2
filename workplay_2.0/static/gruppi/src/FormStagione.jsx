import React, { useState } from 'react';
import Button from '@atlaskit/button/new';
import Textfield from '@atlaskit/textfield';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';

// Contenuto della modale "Aggiungi/Modifica/Visualizza stagione". Aperta dal
// Modal di @forge/bridge, come le modali di gruppi e sfide.
//
// `soloLettura` = stagione conclusa: i campi sono bloccati e non si salva. Si
// può però ELIMINARE, con una conferma in più (le concluse sono storia: un
// clic distratto non deve cancellarle).
//
// Le date sono in UTC per stare coerenti col resto dell'app.

const msToInput = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
const inizioToMs = (v) => (v ? Date.parse(`${v}T00:00:00.000Z`) : NaN);
const fineToMs = (v) => (v ? Date.parse(`${v}T23:59:59.999Z`) : NaN);

export default function FormStagione({
  stagione,
  soloLettura = false,
  onConferma,
  onElimina,
  onAnnulla,
}) {
  const inModifica = Boolean(stagione);

  const [nome, setNome] = useState(stagione?.nome || '');
  const [inizio, setInizio] = useState(msToInput(stagione?.inizioMs));
  const [fine, setFine] = useState(msToInput(stagione?.fineMs));
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState(null);
  const [confermaElimina, setConfermaElimina] = useState(false);

  const valido = nome.trim() && inizio && fine;

  const conferma = () => {
    if (inCorso || !valido) return;
    setInCorso(true);
    setErrore(null);
    Promise.resolve(
      onConferma({ nome: nome.trim(), inizioMs: inizioToMs(inizio), fineMs: fineToMs(fine) })
    ).catch((e) => {
      setErrore(e?.message || 'Errore imprevisto. Riprova.');
      setInCorso(false);
    });
  };

  const elimina = () => {
    if (inCorso) return;
    setInCorso(true);
    setErrore(null);
    Promise.resolve(onElimina()).catch((e) => {
      setErrore(e?.message || 'Errore imprevisto. Riprova.');
      setInCorso(false);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: token('space.200') }}>
      {errore && <SectionMessage appearance="error">{errore}</SectionMessage>}

      {soloLettura && (
        <SectionMessage appearance="information">
          <span style={{ fontSize: 13 }}>
            Stagione conclusa: i dati sono in sola lettura.
          </span>
        </SectionMessage>
      )}

      <div>
        <label style={etichetta}>Nome stagione</label>
        <Textfield
          autoFocus={!soloLettura}
          isDisabled={soloLettura}
          placeholder="es. 1° trimestre"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: token('space.200') }}>
        <div style={{ flex: 1 }}>
          <label style={etichetta}>Inizio</label>
          <input
            type="date"
            disabled={soloLettura}
            value={inizio}
            onChange={(e) => setInizio(e.target.value)}
            style={inputData(soloLettura)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={etichetta}>Fine</label>
          <input
            type="date"
            disabled={soloLettura}
            value={fine}
            onChange={(e) => setFine(e.target.value)}
            style={inputData(soloLettura)}
          />
        </div>
      </div>

      {!soloLettura && (
        <span style={{ fontSize: 11, color: token('color.text.subtlest') }}>
          Le stagioni non possono sovrapporsi. I giorni scoperti tra una e l'altra
          sono la pausa.
        </span>
      )}

      {/* Conferma di eliminazione: secondo passaggio esplicito, come chiesto,
          perché stiamo cancellando una stagione storica. */}
      {confermaElimina && (
        <SectionMessage appearance="warning" title="Eliminare questa stagione conclusa?">
          <span style={{ fontSize: 13 }}>
            L'operazione non è reversibile. La stagione sparirà dal calendario.
          </span>
          <div style={{ display: 'flex', gap: token('space.100'), marginTop: token('space.150') }}>
            <Button appearance="danger" isDisabled={inCorso} onClick={elimina}>
              Sì, elimina
            </Button>
            <Button appearance="subtle" onClick={() => setConfermaElimina(false)}>
              Annulla
            </Button>
          </div>
        </SectionMessage>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: token('space.100'),
          paddingTop: token('space.100'),
        }}
      >
        {/* In sola lettura l'Elimina rosso sta a sinistra, staccato dalle azioni
            neutre a destra: è distruttivo, non deve stare accanto a "Chiudi". */}
        {soloLettura && !confermaElimina && (
          <Button appearance="danger" onClick={() => setConfermaElimina(true)}>
            Elimina stagione
          </Button>
        )}

        <span style={{ flex: 1 }} />

        <Button appearance="subtle" onClick={onAnnulla}>
          {soloLettura ? 'Chiudi' : 'Annulla'}
        </Button>

        {!soloLettura && (
          <Button appearance="primary" isDisabled={!valido || inCorso} onClick={conferma}>
            {inModifica ? 'Salva' : 'Aggiungi stagione'}
          </Button>
        )}
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

const inputData = (disabilitato) => ({
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 8px',
  fontSize: 14,
  borderRadius: 3,
  border: `1px solid ${token('color.border.input')}`,
  background: disabilitato ? token('color.background.disabled') : token('elevation.surface'),
  color: disabilitato ? token('color.text.disabled') : token('color.text'),
});
