import React, { useEffect, useState } from 'react';
import Button from '@atlaskit/button/new';
import Lozenge from '@atlaskit/lozenge';
import Textfield from '@atlaskit/textfield';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';

// Scheda "Extra": categorie fuori dalle challenge. Clone grafico di Challenges
// (stesso albero master-detail), filtrato sulle categorie `gruppo: extra`.
//
// Due categorie, di natura diversa:
//   • Feedback   — categoria-azione con item, identica a come stava in
//                  Challenges (aiuti.js legge getCategoria('feedback').puntiDefault).
//   • Golden WorkItem — l'ex Golden Ticket, rinominato con la terminologia work
//                  item di Jira/JSM. È una categoria di sola CONFIG (`config:
//                  true`): niente item, i suoi numeri (soglia/max/dotazione)
//                  vivono in golden-ticket.js e si modificano nel dettaglio qui.

const Stepper = ({ valore, onChange, min = 0, max = 999 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: token('space.050') }}>
    <Button spacing="compact" isDisabled={valore <= min} onClick={() => onChange(valore - 1)}>−</Button>
    <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 600, fontSize: 13, color: token('color.text') }}>
      {valore}
    </span>
    <Button spacing="compact" isDisabled={valore >= max} onClick={() => onChange(valore + 1)}>+</Button>
  </div>
);

const riga = (livello) => ({
  display: 'flex',
  alignItems: 'center',
  gap: token('space.100'),
  paddingLeft: livello === 0 ? token('space.200') : 48,
  paddingRight: token('space.200'),
  paddingTop: token('space.075'),
  paddingBottom: token('space.075'),
});

export default function ExtraTab({
  categorie,
  sfide,
  selezionata,
  onSeleziona,
  onApriModaleSfida,
  onModificaCategoria,
  onElimina,
  goldenConfig,
  onSalvaGolden,
}) {
  const [chiuse, setChiuse] = useState({});
  const [modificaCat, setModificaCat] = useState(null);
  const [bozzaCat, setBozzaCat] = useState({ puntiDefault: '' });
  const [confermaElimina, setConfermaElimina] = useState(null);

  // Bozza locale della config Golden WorkItem: si salva col pulsante dedicato.
  const [bozzaGolden, setBozzaGolden] = useState(goldenConfig);
  useEffect(() => { setBozzaGolden(goldenConfig); }, [goldenConfig]);
  const goldenModificato = JSON.stringify(bozzaGolden) !== JSON.stringify(goldenConfig);

  const perTipo = (tipo) => sfide.filter((s) => s.tipo === tipo);
  const categoria = categorie.find((c) => c.tipo === selezionata);

  const apriModificaCategoria = (cat) => {
    setModificaCat(cat.tipo);
    setBozzaCat({ puntiDefault: String(cat.puntiDefault) });
  };

  const confermaModificaCategoria = (tipo) => {
    onModificaCategoria({
      tipo,
      puntiDefault: parseInt(bozzaCat.puntiDefault, 10),
      limite: 1,
    });
    setModificaCat(null);
  };

  const setGolden = (campo) => (valore) => setBozzaGolden((b) => ({ ...b, [campo]: valore }));

  return (
    <div style={{ display: 'flex', gap: token('space.250'), alignItems: 'flex-start' }}>
      {/* ------------------------------------------------------------ albero */}
      <div style={albero}>
        {categorie.map((cat) => {
          // Golden WorkItem: categoria di config, foglia senza item.
          if (cat.config) {
            const scelta = selezionata === cat.tipo;
            return (
              <div
                key={cat.tipo}
                onClick={() => onSeleziona(cat.tipo)}
                style={{
                  ...riga(0),
                  cursor: 'pointer',
                  backgroundColor: scelta ? token('color.background.selected') : 'transparent',
                }}
              >
                <span style={{ width: 12 }} />
                <strong style={{ fontSize: 14, color: token('color.text') }}>
                  {`${cat.emoji} ${cat.nome}`}
                </strong>
                <Lozenge appearance="moved">config</Lozenge>
                <span style={{ flex: 1 }} />
              </div>
            );
          }

          const elenco = perTipo(cat.tipo);
          const aperta = !chiuse[cat.tipo];
          const scelta = selezionata === cat.tipo;

          return (
            <div key={cat.tipo}>
              <div
                onClick={() => onSeleziona(cat.tipo)}
                style={{
                  ...riga(0),
                  cursor: 'pointer',
                  backgroundColor: scelta ? token('color.background.selected') : 'transparent',
                }}
              >
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setChiuse((c) => ({ ...c, [cat.tipo]: !c[cat.tipo] }));
                  }}
                  style={{ fontSize: 12, color: token('color.text.subtlest'), cursor: 'pointer' }}
                >
                  {aperta ? '▾' : '▸'}
                </span>

                <strong style={{ fontSize: 14, color: token('color.text') }}>
                  {`${cat.emoji} ${cat.nome}`}
                </strong>

                <Lozenge appearance="inprogress">
                  {`default +${cat.puntiDefault} punti-aiuto`}
                </Lozenge>

                <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>
                  {`${elenco.length} azione`}
                </span>

                <span style={{ flex: 1 }} />

                <span
                  onClick={(e) => { e.stopPropagation(); onSeleziona(cat.tipo); apriModificaCategoria(cat); }}
                  title="Modifica i punti-aiuto della categoria"
                  style={{ fontSize: 13, color: token('color.text.subtlest'), cursor: 'pointer' }}
                >
                  ✎
                </span>
              </div>

              {aperta && (
                <>
                  <div
                    style={{ ...riga(1), cursor: 'pointer' }}
                    onClick={() => onApriModaleSfida(cat, null)}
                  >
                    <span style={{ fontSize: 13, color: token('color.link') }}>
                      + Aggiungi Item
                    </span>
                  </div>

                  {elenco.map((s) => (
                    <div key={s.key} style={riga(1)}>
                      <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>·</span>
                      <span style={{ fontSize: 13, color: token('color.text') }}>
                        {`${s.emoji} ${s.nome}`}
                      </span>
                      {s.punti !== cat.puntiDefault && (
                        <Lozenge appearance="new">{`+${s.punti}`}</Lozenge>
                      )}
                      <span style={{ flex: 1 }} />

                      <span
                        onClick={() => onApriModaleSfida(cat, s)}
                        title="Modifica titolo, descrizione e punteggio"
                        style={{ fontSize: 13, color: token('color.text.subtlest'), cursor: 'pointer' }}
                      >
                        ✎
                      </span>

                      <span
                        onClick={() => setConfermaElimina(s)}
                        title="Elimina questo item"
                        style={{ fontSize: 12, color: token('color.text.danger'), cursor: 'pointer' }}
                      >
                        ✕
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ---------------------------------------------------------- dettaglio */}
      <div style={pannello}>
        {!categoria ? (
          <span style={{ fontSize: 13, color: token('color.text.subtlest') }}>
            Seleziona una voce per vederne il dettaglio.
          </span>
        ) : categoria.config ? (
          /* ------------------------------------------ Golden WorkItem: config */
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: token('space.100') }}>
              <strong style={{ fontSize: 17, color: token('color.text') }}>
                {`${categoria.emoji} ${categoria.nome}`}
              </strong>
            </div>
            <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>
              L'ex Golden Ticket, con la terminologia work item di Jira/JSM. Quanti se
              ne accumulano, quanti a inizio stagione, e da quanti punti se ne guadagna
              uno extra.
            </span>

            <div style={rigaConfig}>
              <span style={{ flex: 1, fontSize: 13, color: token('color.text') }}>
                Soglia punti per guadagnarne uno
              </span>
              <Stepper valore={bozzaGolden.soglia} onChange={setGolden('soglia')} min={1} max={999} />
            </div>
            <div style={rigaConfig}>
              <span style={{ flex: 1, fontSize: 13, color: token('color.text') }}>
                Massimo accumulabile
              </span>
              <Stepper valore={bozzaGolden.max} onChange={setGolden('max')} min={1} max={20} />
            </div>
            <div style={rigaConfig}>
              <span style={{ flex: 1, fontSize: 13, color: token('color.text') }}>
                Assegnati a inizio stagione
              </span>
              <Stepper valore={bozzaGolden.partenza} onChange={setGolden('partenza')} min={0} max={20} />
            </div>

            <div style={{ display: 'flex', gap: token('space.100') }}>
              <Button appearance="primary" isDisabled={!goldenModificato} onClick={() => onSalvaGolden(bozzaGolden)}>
                Salva
              </Button>
              <Button appearance="subtle" isDisabled={!goldenModificato} onClick={() => setBozzaGolden(goldenConfig)}>
                Annulla
              </Button>
            </div>
          </>
        ) : (
          /* -------------------------------------------------- Feedback: azione */
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: token('space.100') }}>
              <strong style={{ fontSize: 17, color: token('color.text') }}>
                {`${categoria.emoji} ${categoria.nome}`}
              </strong>
              <span style={{ flex: 1 }} />
              {modificaCat !== categoria.tipo && (
                <Button appearance="subtle" onClick={() => apriModificaCategoria(categoria)}>
                  ✎ Modifica
                </Button>
              )}
            </div>

            <span style={{ fontSize: 11, color: token('color.text.subtlest') }}>
              Categoria fissa · non eliminabile
            </span>

            {modificaCat === categoria.tipo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: token('space.100') }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Punti-aiuto assegnati</label>
                <Textfield
                  type="number"
                  value={bozzaCat.puntiDefault}
                  onChange={(e) => setBozzaCat({ puntiDefault: e.target.value })}
                />
                <div style={{ display: 'flex', gap: token('space.100') }}>
                  <Button appearance="primary" onClick={() => confermaModificaCategoria(categoria.tipo)}>
                    Salva
                  </Button>
                  <Button appearance="subtle" onClick={() => setModificaCat(null)}>Annulla</Button>
                </div>
              </div>
            ) : (
              <strong style={{ fontSize: 13, color: token('color.text') }}>
                {`Punti-aiuto: +${categoria.puntiDefault} al collega segnalato`}
              </strong>
            )}

            <strong style={{ fontSize: 13, color: token('color.text.subtlest') }}>
              {`Azioni (${perTipo(categoria.tipo).length})`}
            </strong>

            <div
              onClick={() => onApriModaleSfida(categoria, null)}
              style={{ cursor: 'pointer', fontSize: 13, color: token('color.link') }}
            >
              + Aggiungi Item
            </div>

            {perTipo(categoria.tipo).map((s) => (
              <div
                key={s.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: token('space.100'),
                  paddingTop: token('space.050'), paddingBottom: token('space.050'),
                }}
              >
                <span style={{ flex: 1, fontSize: 13, color: token('color.text') }}>
                  {`${s.emoji} ${s.nome}`}
                </span>
                <Lozenge appearance={s.punti === categoria.puntiDefault ? 'default' : 'new'}>
                  {`+${s.punti}`}
                </Lozenge>
                <span
                  onClick={() => onApriModaleSfida(categoria, s)}
                  title="Modifica titolo, descrizione e punteggio"
                  style={{ fontSize: 13, color: token('color.text.subtlest'), cursor: 'pointer' }}
                >
                  ✎
                </span>
                <span
                  onClick={() => setConfermaElimina(s)}
                  title="Elimina questo item"
                  style={{ fontSize: 12, color: token('color.text.danger'), cursor: 'pointer' }}
                >
                  ✕
                </span>
              </div>
            ))}

            {confermaElimina && (
              <SectionMessage appearance="warning" title={`Eliminare "${confermaElimina.nome}"?`}>
                <span style={{ fontSize: 13 }}>
                  Rimuove questa voce dall'elenco. I punti-aiuto già accreditati non
                  vengono toccati.
                </span>
                <div style={{ display: 'flex', gap: token('space.100'), marginTop: token('space.150') }}>
                  <Button
                    appearance="danger"
                    onClick={() => { onElimina(confermaElimina.key); setConfermaElimina(null); }}
                  >
                    Sì, elimina
                  </Button>
                  <Button appearance="subtle" onClick={() => setConfermaElimina(null)}>Annulla</Button>
                </div>
              </SectionMessage>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const albero = {
  flex: 1,
  minWidth: 0,
  border: `1px solid ${token('color.border')}`,
  borderRadius: 8,
  paddingTop: token('space.100'),
  paddingBottom: token('space.100'),
};

const pannello = {
  width: 430,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: token('space.150'),
  border: `1px solid ${token('color.border')}`,
  borderRadius: 8,
  padding: `${token('space.200')} ${token('space.250')}`,
};

const rigaConfig = {
  display: 'flex',
  alignItems: 'center',
  gap: token('space.150'),
  paddingTop: token('space.050'),
  paddingBottom: token('space.050'),
};
