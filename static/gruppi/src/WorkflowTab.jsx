import React, { useState } from 'react';
import Button from '@atlaskit/button/new';
import Lozenge from '@atlaskit/lozenge';
import Textfield from '@atlaskit/textfield';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';
import { formattaDurata } from './durata';

// Data/ora compatta per la colonna "Ultima esecuzione" (es. "20/07 15:40").
const formatTs = (ms) => {
  const d = new Date(ms);
  const gg = `${d.getDate()}`.padStart(2, '0');
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mi = `${d.getMinutes()}`.padStart(2, '0');
  return `${gg}/${mm} ${hh}:${mi}`;
};

// Scheda "Workflow": le regole di monitoraggio, in treeview a DUE famiglie.
// Frame Figma 81:2, poi esteso il 20/07 con la famiglia a tempo.
//
//   ⚡ Regole a Evento — scattano su un evento Jira in tempo reale (trigger.js).
//                        Es. WorkItem Completato → assegna punti.
//   ⏳ Regole a Tempo  — maturano nel silenzio, le valuta lo scheduled trigger di
//                        manutenzione (manutenzione.js → decanter.js).
//                        Es. Work Item Decanter → segnala al TL.
//
// Sotto ogni famiglia le regole sono raggruppate per Jira Space; sotto uno Space
// si possono abilitare più trigger (uno per set di stati).

// Stati di una regola, normalizzati ad array {id, nome}: forma nuova (`stati: []`)
// o vecchia a stato singolo (`statoId/statoNome`).
const statiDi = (r) =>
  Array.isArray(r.stati)
    ? r.stati
    : (r.statoId ? [{ id: String(r.statoId), nome: r.statoNome || '' }] : []);

const famigliaDi = (r) => r.famiglia || (r.trigger === 'workitem-decanter' ? 'tempo' : 'evento');

const FAMIGLIE = [
  {
    key: 'evento',
    emoji: '⚡',
    titolo: 'Regole a Evento',
    descr: 'Scattano su un evento Jira in tempo reale (es. WorkItem Completato → punti).',
  },
  {
    key: 'tempo',
    emoji: '⏳',
    titolo: 'Regole a Tempo',
    descr: 'Le valuta una scansione periodica: osservano da quanto un work item è fermo (es. Decanter → segnala al Team Leader).',
  },
];

export default function WorkflowTab({
  regole,
  trigger,
  puntiWorkItem,
  onApriModale,
  onElimina,
  onSalvaTrigger,
  onEseguiTempo,
}) {
  const [confermaElimina, setConfermaElimina] = useState(null);
  const [chiuse, setChiuse] = useState({});
  // Trigger in modifica (key) + bozza dei suoi campi editabili.
  const [modificaTrigger, setModificaTrigger] = useState(null);
  const [bozzaTrigger, setBozzaTrigger] = useState({ nome: '', descrizione: '', punti: puntiWorkItem });

  // Nome corrente di un trigger dal catalogo (riflette le personalizzazioni).
  const nomeTrigger = (key, fallback) => (trigger.find((t) => t.key === key)?.nome) || fallback;

  const regolePerFamiglia = (fam) => regole.filter((r) => famigliaDi(r) === fam);

  // Raggruppa per Space preservando l'ordine di prima apparizione.
  const perSpace = (elenco) => {
    const spaces = [];
    const indice = {};
    elenco.forEach((r) => {
      if (indice[r.progettoKey] === undefined) {
        indice[r.progettoKey] = spaces.length;
        spaces.push({ key: r.progettoKey, nome: r.progettoNome, regole: [] });
      }
      spaces[indice[r.progettoKey]].regole.push(r);
    });
    return spaces;
  };

  const apriModificaTrigger = (t) => {
    setModificaTrigger(t.key);
    setBozzaTrigger({ nome: t.nome, descrizione: t.descrizione, punti: puntiWorkItem });
  };
  const salvaTrigger = (key) => {
    onSalvaTrigger({
      key,
      nome: bozzaTrigger.nome,
      descrizione: bozzaTrigger.descrizione,
      // Il punteggio si tocca solo per il trigger a evento (completato).
      ...(key === 'workitem-completato' ? { puntiPerTicket: bozzaTrigger.punti } : {}),
    });
    setModificaTrigger(null);
  };

  const numEvento = regolePerFamiglia('evento').length;

  return (
    <>
      {numEvento === 0 && (
        <SectionMessage appearance="warning" title="Nessuna regola a evento attiva">
          <span style={{ fontSize: 13 }}>
            Senza almeno una regola a evento (WorkItem Completato), WorkPlay non assegna
            punti. Le regole a tempo (Decanter) non assegnano punti: solo segnalazioni.
          </span>
        </SectionMessage>
      )}

      {/* ---------------------------------------------- treeview a due famiglie */}
      <div style={card}>
        {FAMIGLIE.map((fam) => {
          const elenco = regolePerFamiglia(fam.key);
          const spaces = perSpace(elenco);
          const aperta = !chiuse[fam.key];

          return (
            <div key={fam.key} style={{ borderTop: `1px solid ${token('color.border')}` }}>
              {/* nodo padre: la famiglia */}
              <div style={rigaFamiglia}>
                <span
                  onClick={() => setChiuse((c) => ({ ...c, [fam.key]: !c[fam.key] }))}
                  style={{ fontSize: 12, color: token('color.text.subtlest'), cursor: 'pointer' }}
                >
                  {aperta ? '▾' : '▸'}
                </span>
                <strong style={{ fontSize: 15, color: token('color.text') }}>
                  {`${fam.emoji} ${fam.titolo} (${elenco.length})`}
                </strong>
                <span style={{ flex: 1 }} />
                {fam.key === 'tempo' && onEseguiTempo && (
                  <span
                    onClick={onEseguiTempo}
                    title="Esegui subito la scansione dei trigger a tempo (senza aspettare il giro giornaliero)"
                    style={{ fontSize: 13, color: token('color.text.subtlest'), cursor: 'pointer', marginRight: token('space.150') }}
                  >
                    ▶ Esegui ora
                  </span>
                )}
                <span
                  onClick={() => onApriModale(null, null, fam.key)}
                  style={{ fontSize: 13, color: token('color.link'), cursor: 'pointer' }}
                >
                  + Aggiungi regola…
                </span>
              </div>

              {aperta && (
                <div style={{ paddingBottom: token('space.100') }}>
                  <div style={{ padding: `0 ${token('space.250')} ${token('space.100')} 40px` }}>
                    <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>{fam.descr}</span>
                  </div>

                  {spaces.length === 0 && (
                    <div style={{ padding: `0 ${token('space.250')} ${token('space.100')} 40px` }}>
                      <span style={{ fontSize: 13, color: token('color.text.subtlest') }}>
                        Nessuna regola in questa famiglia.
                      </span>
                    </div>
                  )}

                  {spaces.map((sp) => (
                    <div key={sp.key}>
                      {/* nodo Space */}
                      <div style={rigaSpace}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: token('color.text') }}>
                          {`${sp.key} — ${sp.nome}`}
                        </span>
                        <Lozenge appearance="default">
                          {`${sp.regole.length} ${sp.regole.length === 1 ? 'regola' : 'regole'}`}
                        </Lozenge>
                        <span style={{ flex: 1 }} />
                        <span
                          onClick={() => onApriModale(null, { key: sp.key, nome: sp.nome }, fam.key)}
                          title="Aggiungi un'altra regola a questo Space"
                          style={{ fontSize: 13, color: token('color.link'), cursor: 'pointer' }}
                        >
                          + Aggiungi
                        </span>
                      </div>

                      {/* regole dello Space */}
                      {sp.regole.map((r) => (
                        <div key={r.id} style={rigaRegola}>
                          <span style={{ width: 130, flexShrink: 0 }}>
                            <Lozenge appearance={r.issueTypeNome ? 'new' : 'default'}>
                              {r.issueTypeNome ? `▧ ${r.issueTypeNome}` : 'tutti i tipi'}
                            </Lozenge>
                          </span>
                          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, width: 210, flexShrink: 0 }}>
                            {statiDi(r).map((s) => (
                              <Lozenge key={s.id} appearance={fam.key === 'tempo' ? 'inprogress' : 'success'}>
                                {fam.key === 'tempo' ? `⏳ ${s.nome}` : `✓ ${s.nome}`}
                              </Lozenge>
                            ))}
                          </span>

                          <span style={{ display: 'flex', alignItems: 'center', gap: token('space.100'), flex: 1, minWidth: 0 }}>
                            {fam.key === 'tempo' ? (
                              <>
                                <Lozenge appearance="moved">{`⏳ ${nomeTrigger('workitem-decanter', 'Decanter')}`}</Lozenge>
                                <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>
                                  {`oltre ${r.sogliaTesto || (Number.isFinite(r.sogliaMinuti) ? formattaDurata(r.sogliaMinuti) : `${r.sogliaGiorni || '?'}g`)} → segnala + commenta`}
                                </span>
                              </>
                            ) : (
                              <>
                                <Lozenge appearance="moved">{`⚡ ${nomeTrigger('workitem-completato', 'WorkItem Completato')}`}</Lozenge>
                                <span style={{ fontSize: 12, fontWeight: 600, color: token('color.text.subtlest') }}>
                                  {`+${puntiWorkItem} punti`}
                                </span>
                              </>
                            )}
                          </span>

                          {/* Colonne extra (solo tempo): stato flag "Ripeti" + ultima esecuzione. */}
                          {fam.key === 'tempo' && (
                            <>
                              <span style={{ width: 120, flexShrink: 0, display: 'flex' }} title="Ripeti l'azione ad ogni scansione">
                                <Lozenge appearance={r.ripetiOgniGiro ? 'success' : 'default'}>
                                  {r.ripetiOgniGiro ? '🔁 Ripeti ON' : 'Ripeti OFF'}
                                </Lozenge>
                              </span>
                              <span
                                style={{ width: 130, flexShrink: 0, fontSize: 12, color: token('color.text.subtlest') }}
                                title="Ultima esecuzione del Decanter (scansione)"
                              >
                                {r.ultimaEsecuzione ? `🕒 ${formatTs(r.ultimaEsecuzione)}` : '🕒 mai eseguito'}
                              </span>
                            </>
                          )}

                          <span
                            onClick={() => onApriModale(r, null, fam.key)}
                            title="Modifica la regola"
                            style={{ fontSize: 13, color: token('color.text.subtlest'), cursor: 'pointer' }}
                          >
                            ✎
                          </span>
                          <span
                            onClick={() => setConfermaElimina(r)}
                            title="Elimina la regola"
                            style={{ fontSize: 12, color: token('color.text.danger'), cursor: 'pointer', paddingLeft: 8 }}
                          >
                            ✕
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {confermaElimina && (
        <SectionMessage
          appearance="warning"
          title={`Eliminare la regola su "${confermaElimina.progettoKey} · ${statiDi(confermaElimina).map((s) => s.nome).join(', ')}"?`}
        >
          <span style={{ fontSize: 13 }}>
            {famigliaDi(confermaElimina) === 'tempo'
              ? 'Quegli stati smetteranno di essere sorvegliati per il Decanter.'
              : 'Quegli stati smetteranno di assegnare punti in quel Space. Punti già guadagnati non vengono toccati.'}
          </span>
          <div style={{ display: 'flex', gap: token('space.100'), marginTop: token('space.150') }}>
            <Button appearance="danger" onClick={() => { onElimina(confermaElimina.id); setConfermaElimina(null); }}>
              Sì, elimina
            </Button>
            <Button appearance="subtle" onClick={() => setConfermaElimina(null)}>Annulla</Button>
          </div>
        </SectionMessage>
      )}

      {/* --------------------------------------------------- trigger disponibili */}
      <div style={{ ...card, padding: token('space.200'), display: 'flex', flexDirection: 'column', gap: token('space.150') }}>
        <strong style={{ fontSize: 16, color: token('color.text') }}>⚡ Trigger disponibili</strong>
        {trigger.map((t) => {
          const eDecanter = t.key === 'workitem-decanter';
          const inModifica = modificaTrigger === t.key;

          return (
            <div key={t.key} style={{ display: 'flex', alignItems: inModifica ? 'flex-start' : 'center', gap: token('space.150') }}>
              <span
                style={{
                  fontSize: 18, padding: '6px 10px', borderRadius: 8,
                  background: eDecanter ? token('color.background.information') : token('color.background.warning'),
                }}
              >
                {eDecanter ? '⏳' : '⚡'}
              </span>

              {inModifica ? (
                /* -------------------------------------- editor del trigger */
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: token('space.100') }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: token('color.text') }}>Nome del trigger</label>
                  <Textfield
                    value={bozzaTrigger.nome}
                    onChange={(e) => setBozzaTrigger((b) => ({ ...b, nome: e.target.value }))}
                  />
                  <label style={{ fontSize: 12, fontWeight: 600, color: token('color.text') }}>Descrizione</label>
                  <Textfield
                    value={bozzaTrigger.descrizione}
                    onChange={(e) => setBozzaTrigger((b) => ({ ...b, descrizione: e.target.value }))}
                  />
                  {!eDecanter && (
                    <>
                      <label style={{ fontSize: 12, fontWeight: 600, color: token('color.text') }}>Punteggio assegnato</label>
                      <span style={{ display: 'flex', alignItems: 'center', gap: token('space.050') }}>
                        <Button spacing="compact" isDisabled={bozzaTrigger.punti <= 1} onClick={() => setBozzaTrigger((b) => ({ ...b, punti: b.punti - 1 }))}>−</Button>
                        <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 600, fontSize: 13, color: token('color.text') }}>
                          {bozzaTrigger.punti}
                        </span>
                        <Button spacing="compact" isDisabled={bozzaTrigger.punti >= 100} onClick={() => setBozzaTrigger((b) => ({ ...b, punti: b.punti + 1 }))}>+</Button>
                      </span>
                    </>
                  )}
                  <span style={{ display: 'flex', gap: token('space.100'), marginTop: token('space.050') }}>
                    <Button spacing="compact" appearance="primary" isDisabled={!bozzaTrigger.nome.trim()} onClick={() => salvaTrigger(t.key)}>Salva</Button>
                    <Button spacing="compact" appearance="subtle" onClick={() => setModificaTrigger(null)}>Annulla</Button>
                  </span>
                </div>
              ) : (
                /* ---------------------------------------- vista del trigger */
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: token('space.100') }}>
                      <strong style={{ fontSize: 14, color: token('color.text') }}>{t.nome}</strong>
                      <Lozenge appearance={eDecanter ? 'inprogress' : 'moved'}>
                        {t.famiglia === 'tempo' ? 'a tempo' : 'a evento'}
                      </Lozenge>
                    </span>
                    <div style={{ fontSize: 12, color: token('color.text.subtlest') }}>{t.descrizione}</div>
                  </div>

                  <span style={{ display: 'flex', alignItems: 'center', gap: token('space.100') }}>
                    {eDecanter ? (
                      <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>Soglia per regola</span>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 600, color: token('color.text') }}>
                        {`+${puntiWorkItem} punti`}
                      </span>
                    )}
                    <span
                      onClick={() => apriModificaTrigger(t)}
                      title="Modifica il trigger"
                      style={{ fontSize: 13, color: token('color.text.subtlest'), cursor: 'pointer' }}
                    >
                      ✎
                    </span>
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

const card = {
  border: `1px solid ${token('color.border')}`,
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column',
};

const rigaFamiglia = {
  display: 'flex',
  alignItems: 'center',
  gap: token('space.100'),
  padding: `${token('space.150')} ${token('space.250')}`,
};

const rigaSpace = {
  display: 'flex',
  alignItems: 'center',
  gap: token('space.100'),
  padding: `${token('space.075')} ${token('space.250')} ${token('space.075')} 40px`,
  background: token('color.background.neutral.subtle'),
};

const rigaRegola = {
  display: 'flex',
  alignItems: 'center',
  gap: token('space.100'),
  padding: `${token('space.075')} ${token('space.200')} ${token('space.075')} 56px`,
};
