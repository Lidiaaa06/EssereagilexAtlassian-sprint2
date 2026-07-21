import React, { useCallback, useEffect, useState } from 'react';
import { invoke, router } from '@forge/bridge';
import Button from '@atlaskit/button/new';
import Select from '@atlaskit/select';
import Textfield from '@atlaskit/textfield';
import Lozenge from '@atlaskit/lozenge';
import Spinner from '@atlaskit/spinner';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';

// Scheda "Audit Log" — cronologia di ciò che accade nell'app (Open Points id-64/65/66).
// Filtri in alto, tabella sotto; paginazione a 50; retention 45 giorni.
// I dati vengono da `auditLogGet` (≤50 per chiamata, cursor = offset).

const TIPI = [
  { label: 'Tutti', value: 'all' },
  { label: '⚡ Trigger', value: 'trigger' },
  { label: '⚙️ Configurazione', value: 'config' },
  { label: '👔 Azioni TL', value: 'tl' },
];

const pillEvento = (y) => {
  if (y === 'trigger') return <Lozenge appearance="moved">⚡ Trigger</Lozenge>;
  if (y === 'tl') return <Lozenge appearance="inprogress">👔 Azione TL</Lozenge>;
  return <Lozenge appearance="default">⚙️ Config</Lozenge>;
};

const pillEsito = (o) => {
  if (o === 'error') return <Lozenge appearance="removed">error</Lozenge>;
  if (o === 'skip') return <Lozenge appearance="default">skip</Lozenge>;
  return <Lozenge appearance="success">✓ ok</Lozenge>;
};

// Date: gli <input type="date"> danno 'YYYY-MM-DD'; il resolver vuole ISO UTC.
const isoInizio = (d) => (d ? `${d}T00:00:00.000Z` : undefined);
const isoFine = (d) => (d ? `${d}T23:59:59.999Z` : undefined);
const giorniFa = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const oggi = () => new Date().toISOString().slice(0, 10);

const formatData = (iso) => {
  const d = new Date(iso);
  const gg = `${d.getDate()}`.padStart(2, '0');
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mi = `${d.getMinutes()}`.padStart(2, '0');
  return `${gg}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
};

export default function AuditLogTab() {
  const [membri, setMembri] = useState([]);
  const [da, setDa] = useState(giorniFa(7));
  const [a, setA] = useState(oggi());
  const [tipo, setTipo] = useState(TIPI[0]);
  const [dev, setDev] = useState(null);

  const [entries, setEntries] = useState([]);
  const [nextCursor, setNextCursor] = useState(undefined);
  const [totale, setTotale] = useState(0);
  const [troncato, setTroncato] = useState(false);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState(null);

  const carica = useCallback((cursor) => {
    setCaricando(true);
    setErrore(null);
    invoke('auditLogGet', {
      from: isoInizio(da),
      to: isoFine(a),
      type: tipo?.value,
      developer: dev?.value || undefined,
      cursor,
    })
      .then((res) => {
        if (res?.errore) { setErrore(res.errore); setCaricando(false); return; }
        setEntries((prev) => (cursor ? [...prev, ...res.entries] : res.entries));
        setNextCursor(res.nextCursor);
        setTotale(res.totale || 0);
        setTroncato(Boolean(res.troncato));
        setCaricando(false);
      })
      .catch(() => { setErrore('Errore nel caricamento del log. Riprova.'); setCaricando(false); });
  }, [da, a, tipo, dev]);

  // All'apertura: elenco membri (filtro developer) + prima pagina.
  useEffect(() => {
    invoke('getMembriPerAiuto').then((r) => setMembri(r?.membri || [])).catch(() => {});
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opzioniDev = [
    { label: 'Tutti i developer', value: null },
    ...membri.map((m) => ({ label: m.nome, value: m.accountId })),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: token('space.200') }}>
      <p style={{ fontSize: 13, color: token('color.text.subtlest'), margin: 0 }}>
        La cronologia di ciò che è successo nell'app: assegnazioni di punti dai trigger,
        modifiche di configurazione e azioni dei Team Leader. Filtra per intervallo, tipo e
        developer (utile per ricostruire la storia punti di una persona).
      </p>

      {/* ------------------------------------------------------------- filtri */}
      <div style={filtri}>
        <div style={campo}>
          <label style={etichetta}>Da</label>
          <Textfield type="date" value={da} onChange={(e) => setDa(e.target.value)} />
        </div>
        <div style={campo}>
          <label style={etichetta}>A</label>
          <Textfield type="date" value={a} onChange={(e) => setA(e.target.value)} />
        </div>
        <div style={{ ...campo, minWidth: 180 }}>
          <label style={etichetta}>Tipo evento</label>
          <Select options={TIPI} value={tipo} onChange={setTipo} />
        </div>
        <div style={{ ...campo, minWidth: 200 }}>
          <label style={etichetta}>Developer</label>
          <Select
            isClearable
            placeholder="Tutti"
            options={opzioniDev}
            value={dev}
            onChange={(v) => setDev(v && v.value ? v : null)}
          />
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <Button appearance="primary" isDisabled={caricando} onClick={() => carica()}>
            {caricando ? 'Filtro…' : 'Filtra'}
          </Button>
        </div>
      </div>

      {errore && <SectionMessage appearance="error">{errore}</SectionMessage>}

      {troncato && (
        <SectionMessage appearance="warning">
          Ci sono molte voci in questo intervallo: sono mostrate le più recenti. Restringi le
          date per vedere il resto.
        </SectionMessage>
      )}

      {/* ------------------------------------------------------------ tabella */}
      <div style={tabella}>
        <div style={{ ...riga, background: token('color.background.neutral.subtle'), fontWeight: 700 }}>
          <span style={colData}>Data/Ora</span>
          <span style={colEvento}>Evento</span>
          <span style={colChi}>Chi</span>
          <span style={colDett}>Dettaglio</span>
          <span style={colEsito}>Esito</span>
        </div>

        {entries.length === 0 && !caricando && (
          <div style={{ padding: token('space.300'), textAlign: 'center', color: token('color.text.subtlest'), fontSize: 13 }}>
            Nessuna voce nel log per i filtri selezionati.
          </div>
        )}

        {entries.map((e, i) => (
          <div key={`${e.t}-${i}`} style={riga}>
            <span style={{ ...colData, fontSize: 12, color: token('color.text.subtlest') }}>
              {formatData(e.t)}
            </span>
            <span style={colEvento}>{pillEvento(e.y)}</span>
            <span style={{ ...colChi, fontSize: 13, color: token('color.text') }}>
              {e.sNome || e.aNome || '—'}
            </span>
            <span style={{ ...colDett, fontSize: 13, color: token('color.text') }}>
              {e.d?.x || ''}
              {e.d?.i && (
                <span
                  onClick={() => router.open(`/browse/${e.d.i}`)}
                  style={{ marginLeft: 6, color: token('color.link'), cursor: 'pointer' }}
                  title="Apri il work item"
                >
                  {e.d.i}
                </span>
              )}
              {typeof e.d?.p === 'number' && (
                <Lozenge appearance={e.d.p >= 0 ? 'success' : 'removed'}>
                  {`${e.d.p >= 0 ? '+' : ''}${e.d.p} punti`}
                </Lozenge>
              )}
            </span>
            <span style={colEsito}>{pillEsito(e.o)}</span>
          </div>
        ))}

        {caricando && (
          <div style={{ padding: token('space.200'), textAlign: 'center' }}><Spinner size="medium" /></div>
        )}
      </div>

      {/* ------------------------------------------------- paginazione + nota */}
      <div style={{ display: 'flex', alignItems: 'center', gap: token('space.150') }}>
        {nextCursor && (
          <Button isDisabled={caricando} onClick={() => carica(nextCursor)}>
            Carica altre 50
          </Button>
        )}
        <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>
          {entries.length > 0 ? `${entries.length} di ${totale} voci` : ''}
        </span>
      </div>

      <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>
        Le voci vengono conservate per 45 giorni.
      </span>
    </div>
  );
}

const filtri = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: token('space.150'),
  alignItems: 'flex-end',
};

const campo = { display: 'flex', flexDirection: 'column', gap: token('space.050') };
const etichetta = { fontSize: 12, fontWeight: 600, color: token('color.text') };

const tabella = {
  border: `1px solid ${token('color.border')}`,
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const riga = {
  display: 'flex',
  alignItems: 'center',
  gap: token('space.100'),
  padding: `${token('space.100')} ${token('space.200')}`,
  borderTop: `1px solid ${token('color.border')}`,
};

const colData = { width: 130, flexShrink: 0 };
const colEvento = { width: 130, flexShrink: 0 };
const colChi = { width: 150, flexShrink: 0 };
const colDett = { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: token('space.100'), flexWrap: 'wrap' };
const colEsito = { width: 90, flexShrink: 0, textAlign: 'right' };
