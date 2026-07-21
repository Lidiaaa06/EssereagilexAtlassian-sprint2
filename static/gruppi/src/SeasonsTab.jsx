import React, { useState } from 'react';
import Lozenge from '@atlaskit/lozenge';
import Button from '@atlaskit/button/new';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';

// Scheda "Season": il calendario delle stagioni, in albero per anno. Frame 80:2.
//
// Le stagioni arrivano già con lo `stato` calcolato dal backend
// (conclusa / corrente / futura): il frontend non ricalcola la regola, così
// non può divergere.

// Data UTC leggibile: "1 gen 2026". In UTC per non slittare di un giorno a
// seconda del fuso di chi guarda (le date sono confini UTC lato backend).
const fmtData = (ms) =>
  new Date(ms).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });

const LOZENGE = {
  conclusa: { appearance: 'default', testo: 'conclusa' },
  corrente: { appearance: 'success', testo: '▶ in corso' },
  futura: { appearance: 'new', testo: 'futura' },
};

export default function SeasonsTab({ stagioni, onApriModale, onElimina }) {
  const [chiusi, setChiusi] = useState({});
  const [confermaElimina, setConfermaElimina] = useState(null);

  // Raggruppa per anno UTC della data d'inizio, ordinato.
  const perAnno = {};
  stagioni.forEach((s) => {
    const anno = new Date(s.inizioMs).getUTCFullYear();
    (perAnno[anno] = perAnno[anno] || []).push(s);
  });
  const anni = Object.keys(perAnno).map(Number).sort((a, b) => a - b);

  return (
    <div style={albero}>
      {anni.length === 0 && (
        <div style={{ ...riga(0) }}>
          <span style={{ fontSize: 13, color: token('color.text.subtlest') }}>
            Nessuna stagione. Aggiungine una per iniziare.
          </span>
        </div>
      )}

      {anni.map((anno) => {
        const elenco = perAnno[anno];
        const aperto = !chiusi[anno];

        return (
          <div key={anno}>
            <div
              onClick={() => setChiusi((c) => ({ ...c, [anno]: !c[anno] }))}
              style={{ ...riga(0), cursor: 'pointer' }}
            >
              <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>
                {aperto ? '▾' : '▸'}
              </span>
              <strong style={{ fontSize: 15, color: token('color.text') }}>
                {`📅 ${anno}`}
              </strong>
              <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>
                {`${elenco.length} ${elenco.length === 1 ? 'stagione' : 'stagioni'}`}
              </span>
            </div>

            {aperto && (
              <>
                <div
                  onClick={() => onApriModale(null)}
                  style={{ ...riga(1), cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 13, color: token('color.link') }}>
                    + Aggiungi stagione
                  </span>
                </div>

                {elenco.map((s) => {
                  const corrente = s.stato === 'corrente';
                  const loz = LOZENGE[s.stato] || LOZENGE.futura;

                  return (
                    <div
                      key={s.id}
                      style={{
                        ...riga(1),
                        backgroundColor: corrente
                          ? token('color.background.success')
                          : 'transparent',
                      }}
                    >
                      <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>·</span>

                      <span style={{ width: 200, fontSize: 14, color: token('color.text') }}>
                        {`${s.nome} '${String(anno).slice(2)}`}
                      </span>

                      <Lozenge appearance={loz.appearance}>{loz.testo}</Lozenge>

                      <span style={{ width: 150, fontSize: 13, color: token('color.text.subtlest') }}>
                        {`Inizio: ${fmtData(s.inizioMs)}`}
                      </span>
                      <span style={{ width: 150, fontSize: 13, color: token('color.text.subtlest') }}>
                        {`Fine: ${fmtData(s.fineMs)}`}
                      </span>

                      {/* Solo per la stagione in corso: quanto manca alla fine. */}
                      {corrente && s.giorniRimanenti != null && (
                        <span style={{ fontSize: 13, fontWeight: 600, color: token('color.text.success') }}>
                          {`⏳ ${s.giorniRimanenti} ${s.giorniRimanenti === 1 ? 'giorno' : 'giorni'} rimanenti`}
                        </span>
                      )}

                      <span style={{ flex: 1 }} />

                      {/* Le concluse sono storia: non si modificano né si
                          eliminano dalla treeview. L'occhio apre la modale in
                          sola lettura, da cui si può comunque eliminare (con
                          doppia conferma), così un errore di clic non cancella
                          una stagione passata. */}
                      {s.stato === 'conclusa' ? (
                        <span
                          onClick={() => onApriModale(s, true)}
                          title="Sola lettura — apri per visualizzare"
                          style={{ fontSize: 13, color: token('color.text.subtlest'), cursor: 'pointer' }}
                        >
                          🔍
                        </span>
                      ) : (
                        <>
                          <span
                            onClick={() => onApriModale(s, false)}
                            title="Modifica nome e date"
                            style={{ fontSize: 13, color: token('color.text.subtlest'), cursor: 'pointer' }}
                          >
                            ✎
                          </span>

                          {corrente ? (
                            <span
                              title='Stagione in corso: per chiuderla in anticipo usa "Termina stagione"'
                              style={{ fontSize: 12 }}
                            >
                              🔒
                            </span>
                          ) : (
                            <span
                              onClick={() => setConfermaElimina(s)}
                              title="Elimina questa stagione"
                              style={{ fontSize: 12, color: token('color.text.danger'), cursor: 'pointer' }}
                            >
                              ✕
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })}

      {confermaElimina && (
        <div style={{ padding: token('space.200') }}>
          <SectionMessage
            appearance="warning"
            title={`Eliminare "${confermaElimina.nome} '${String(new Date(confermaElimina.inizioMs).getUTCFullYear()).slice(2)}"?`}
          >
            <div style={{ display: 'flex', gap: token('space.100'), marginTop: token('space.100') }}>
              <Button
                appearance="danger"
                onClick={() => { onElimina(confermaElimina.id); setConfermaElimina(null); }}
              >
                Sì, elimina
              </Button>
              <Button appearance="subtle" onClick={() => setConfermaElimina(null)}>
                Annulla
              </Button>
            </div>
          </SectionMessage>
        </div>
      )}
    </div>
  );
}

const albero = {
  border: `1px solid ${token('color.border')}`,
  borderRadius: 8,
  paddingTop: token('space.100'),
  paddingBottom: token('space.100'),
};

const riga = (livello) => ({
  display: 'flex',
  alignItems: 'center',
  gap: token('space.100'),
  paddingLeft: livello === 0 ? token('space.200') : 48,
  paddingRight: token('space.200'),
  paddingTop: token('space.100'),
  paddingBottom: token('space.100'),
});
