import React, { useState } from 'react';
import Button from '@atlaskit/button/new';
import Lozenge from '@atlaskit/lozenge';
import Textfield from '@atlaskit/textfield';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';

// Scheda "Challenges": il catalogo delle sfide, in albero per categoria.
// Frame Figma 73:2. Struttura master-detail come la pagina Groups.
//
// Le categorie sono FISSE: si modificano (punteggio di default, limite) ma non
// si creano né si eliminano. Le sfide invece sono libere.
//
// Le categorie con `azione: true` (Feedback) non sono sfide che il developer
// accetta: descrivono azioni dell'app. Cambia solo il fatto che non hanno un
// limite per periodo — aggiunta, modifica ed eliminazione degli item valgono
// anche lì.
//
// ⚠️ Per Feedback i punti effettivi vengono dalla CATEGORIA (aiuti.js legge
// getCategoria('feedback').puntiDefault): gli item sono documentazione di cosa
// fa guadagnare quei punti, non ognuno un valore a sé.

const riga = (livello) => ({
  display: 'flex',
  alignItems: 'center',
  gap: token('space.100'),
  paddingLeft: livello === 0 ? token('space.200') : 48,
  paddingRight: token('space.200'),
  paddingTop: token('space.075'),
  paddingBottom: token('space.075'),
});

export default function ChallengesTab({
  categorie,
  sfide,
  selezionata,
  onSeleziona,
  onApriModaleSfida,
  onModificaCategoria,
  onElimina,
}) {
  const [chiuse, setChiuse] = useState({});
  const [modificaCat, setModificaCat] = useState(null);
  const [bozzaCat, setBozzaCat] = useState({ puntiDefault: '', limite: '' });
  const [confermaElimina, setConfermaElimina] = useState(null);

  const perTipo = (tipo) => sfide.filter((s) => s.tipo === tipo);
  const categoria = categorie.find((c) => c.tipo === selezionata);

  const apriModificaCategoria = (cat) => {
    setModificaCat(cat.tipo);
    setBozzaCat({ puntiDefault: String(cat.puntiDefault), limite: String(cat.limite) });
  };

  const confermaModificaCategoria = (tipo) => {
    onModificaCategoria({
      tipo,
      puntiDefault: parseInt(bozzaCat.puntiDefault, 10),
      limite: parseInt(bozzaCat.limite, 10),
    });
    setModificaCat(null);
  };

  return (
    <div style={{ display: 'flex', gap: token('space.250'), alignItems: 'flex-start' }}>
      {/* ------------------------------------------------------------ albero */}
      <div style={albero}>
        {categorie.map((cat) => {
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
                  {cat.azione
                    ? `default +${cat.puntiDefault} punti-aiuto`
                    : `default +${cat.puntiDefault} · max ${cat.limite}/${cat.periodo}`}
                </Lozenge>

                <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>
                  {cat.azione
                    ? `${elenco.length} azione`
                    : `${elenco.length} ${elenco.length === 1 ? 'sfida' : 'sfide'}`}
                </span>

                <span style={{ flex: 1 }} />

                <span
                  onClick={(e) => { e.stopPropagation(); onSeleziona(cat.tipo); apriModificaCategoria(cat); }}
                  title="Modifica default e limite della categoria"
                  style={{ fontSize: 13, color: token('color.text.subtlest'), cursor: 'pointer' }}
                >
                  ✎
                </span>
              </div>

              {aperta && (
                <>
                  {/* In TESTA, non in coda: con elenchi lunghi il pulsante
                      finirebbe fuori schermo e l'admin dovrebbe scorrere tutta
                      la categoria per aggiungere una voce. */}
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
            Seleziona una categoria per vederne il dettaglio.
          </span>
        ) : (
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
                <label style={{ fontSize: 13, fontWeight: 600 }}>
                  {categoria.azione ? 'Punti-aiuto assegnati' : 'Punteggio di default'}
                </label>
                <Textfield
                  type="number"
                  value={bozzaCat.puntiDefault}
                  onChange={(e) => setBozzaCat((b) => ({ ...b, puntiDefault: e.target.value }))}
                />
                {!categoria.azione && (
                  <>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>
                      {`Massimo per developer al ${categoria.periodo}`}
                    </label>
                    <Textfield
                      type="number"
                      value={bozzaCat.limite}
                      onChange={(e) => setBozzaCat((b) => ({ ...b, limite: e.target.value }))}
                    />
                  </>
                )}
                <div style={{ display: 'flex', gap: token('space.100') }}>
                  <Button
                    appearance="primary"
                    onClick={() => confermaModificaCategoria(categoria.tipo)}
                  >
                    Salva
                  </Button>
                  <Button appearance="subtle" onClick={() => setModificaCat(null)}>
                    Annulla
                  </Button>
                </div>
              </div>
            ) : (
              <strong style={{ fontSize: 13, color: token('color.text') }}>
                {categoria.azione
                  ? `Punti-aiuto: +${categoria.puntiDefault} al collega segnalato`
                  : `Punteggio default: +${categoria.puntiDefault} punti · Limite: max ${categoria.limite} per developer al ${categoria.periodo}`}
              </strong>
            )}

            <strong style={{ fontSize: 13, color: token('color.text.subtlest') }}>
              {categoria.azione
                ? `Azioni (${perTipo(categoria.tipo).length})`
                : `Sfide (${perTipo(categoria.tipo).length})`}
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: token('space.100'),
                  paddingTop: token('space.050'),
                  paddingBottom: token('space.050'),
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

            <span style={{ fontSize: 11, color: token('color.text.subtlest') }}>
              Gli item con punteggio diverso da quello di default della categoria
              sono evidenziati.
            </span>

            {/* Conferma esplicita: l'eliminazione ha una conseguenza che
                l'admin non può indovinare guardando questa schermata. */}
            {confermaElimina && (
              <SectionMessage
                appearance="warning"
                title={`Eliminare "${confermaElimina.nome}"?`}
              >
                <span style={{ fontSize: 13 }}>
                  I punti già guadagnati da chi ha completato questa sfida
                  <strong> spariranno dalle classifiche</strong>, anche a stagione
                  in corso.
                </span>
                <div style={{ display: 'flex', gap: token('space.100'), marginTop: token('space.150') }}>
                  <Button
                    appearance="danger"
                    onClick={() => { onElimina(confermaElimina.key); setConfermaElimina(null); }}
                  >
                    Sì, elimina
                  </Button>
                  <Button appearance="subtle" onClick={() => setConfermaElimina(null)}>
                    Annulla
                  </Button>
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
