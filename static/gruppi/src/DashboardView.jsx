import React, { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';
import { ViewIssueModal } from '@forge/jira-bridge';
import Spinner from '@atlaskit/spinner';
import Lozenge from '@atlaskit/lozenge';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';
import { formattaDurata } from './durata';

// Dashboard utente (global page "WorkPlay" → sotto-pagina Dashboard). Mockup
// Figma 90:2. Layout a due colonne:
//   • Sinistra (60%): Fine stagione + spazio riservato ai prossimi blocchi.
//   • Destra (40%): Punti stagione come TREEVIEW: ogni fonte (trigger dell'admin
//     + sfide/valutazioni/aiuti) è un nodo espandibile che mostra i SINGOLI
//     eventi che hanno generato i punti (dall'Audit Log).
// I pulsanti "Golden Activity"/"Segnala aiuto" e le altre card arriveranno dopo.

const etichettaRuolo = (ruolo) => (ruolo === 'supervisore' ? '👔 Team Leader' : '🧑‍💻 Developer');

// Categoria stato Jira → colore lozenge: done=verde, in corso=blu, to do=grigio.
const appStato = (cat) => (cat === 'done' ? 'success' : cat === 'indeterminate' ? 'inprogress' : 'default');

const formatTs = (iso) => {
  const d = new Date(iso);
  const gg = `${d.getDate()}`.padStart(2, '0');
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mi = `${d.getMinutes()}`.padStart(2, '0');
  return `${gg}/${mm} ${hh}:${mi}`;
};

export default function DashboardView() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  // Nodi CHIUSI di default: gli eventi sotto un padre possono essere molti.
  const [espansi, setEspansi] = useState({});
  const [aggiornando, setAggiornando] = useState(false);

  // Ricarica SOLO i dati (getUserStats), senza ricaricare la pagina. Usata al
  // mount e dal pulsante refresh in alto a destra della card "Punti stagione".
  const carica = () => {
    setAggiornando(true);
    return invoke('getUserStats')
      .then((r) => {
        if (r?.errore) { setErrore(r.errore); return; }
        setErrore(null);
        setDati(r);
      })
      .catch(() => setErrore('Impossibile caricare la dashboard. Ricarica la pagina.'))
      .finally(() => setAggiornando(false));
  };

  useEffect(() => { carica(); }, []);

  if (errore) {
    return (
      <div style={pagina}>
        <SectionMessage appearance="error" title="Dashboard non disponibile">{errore}</SectionMessage>
      </div>
    );
  }
  if (!dati) {
    return <div style={{ ...pagina, alignItems: 'center' }}><Spinner size="large" /></div>;
  }

  const giorni = Number(dati.giorniRimanenti);
  const giorniValidi = Number.isFinite(giorni) && giorni >= 0;
  const stagione = dati.stagioneNome || `Stagione ${dati.numeroStagione}`;

  // Nodi della composizione punti. I trigger vengono dal catalogo admin (dinamici);
  // oggi solo WorkItem Completato traccia punti (con i suoi eventi dall'audit),
  // il Decanter è segnalazione. Poi Sfide, Valutazioni e Aiuti (Feedback).
  const nodiTrigger = (dati.triggerCatalogo || []).map((t) => {
    const eCompletato = t.key === 'workitem-completato';
    const eDecanter = t.key === 'workitem-decanter';
    return {
      chiave: t.key,
      emoji: t.famiglia === 'tempo' ? '⏳' : '⚡',
      nome: t.nome,
      punti: eCompletato ? dati.puntiTicket : 0,
      assegnaPunti: eCompletato,
      // Il Decanter non dà punti ma ora ha i suoi eventi (segnalazioni): espandibili.
      eventi: eCompletato
        ? (dati.eventiTrigger || [])
        : (eDecanter ? (dati.eventiDecanter || []) : []),
    };
  });
  const nodi = [
    ...nodiTrigger,
    { chiave: 'sfide', emoji: '🎯', nome: 'Sfide completate', punti: dati.puntiSfide, assegnaPunti: true, eventi: [] },
    { chiave: 'valutazioni', emoji: '⭐', nome: 'Valutazioni ricevute', punti: dati.puntiValutazione, assegnaPunti: true, eventi: [] },
    { chiave: 'aiuti', emoji: '🤝', nome: 'Aiuti dati (Feedback)', punti: 0, assegnaPunti: true, eventi: [] },
  ];

  const toggle = (chiave) => setEspansi((e) => ({ ...e, [chiave]: !e[chiave] }));

  // Click sull'issueKey → MODALE NATIVO della issue di Jira (come Structure),
  // via @forge/jira-bridge. Funziona anche da Custom UI in iframe: apre la vista
  // issue completa (descrizione, commenti, tutti i campi) come overlay, senza
  // cambiare pagina.
  const apriIssue = (issueKey) => {
    new ViewIssueModal({ context: { issueKey } }).open();
  };

  // Espandi/chiudi TUTTI i nodi espandibili in un colpo (icone in alto a destra).
  // Espandibile = ha eventi (anche il Decanter, che ne ha ma senza punti).
  const espandibili = nodi.filter((n) => n.eventi.length > 0).map((n) => n.chiave);
  const espandiTutto = () => setEspansi(Object.fromEntries(espandibili.map((k) => [k, true])));
  const chiudiTutto = () => setEspansi({});

  return (
    <div style={pagina}>
      {/* --------------------------------------------------------- header profilo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: token('space.200') }}>
        {dati.avatarUrl ? (
          <img
            src={dati.avatarUrl}
            alt=""
            width={56}
            height={56}
            style={{ borderRadius: '50%', flexShrink: 0 }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: token('color.background.accent.yellow.subtle'), flexShrink: 0 }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 style={{ fontSize: 24, margin: 0, color: token('color.text') }}>WorkPlay Dashboard</h1>
          <span style={{ display: 'flex', alignItems: 'center', gap: token('space.100'), flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14, color: token('color.text') }}>{dati.nome}</strong>
            <Lozenge appearance="new">{etichettaRuolo(dati.ruolo)}</Lozenge>
            <Lozenge appearance="inprogress">{`🔥 ${stagione}`}</Lozenge>
          </span>
        </div>
      </div>

      {/* --------------------------------------------------------- due colonne */}
      <div style={{ display: 'flex', gap: token('space.300'), alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* -------------------------------------------- SINISTRA 60% */}
        <div style={{ flex: '1 1 55%', minWidth: 280, display: 'flex', flexDirection: 'column', gap: token('space.200') }}>
          <div style={card}>
            <span style={etichetta}>⏳ Fine stagione</span>
            {giorniValidi ? (
              <>
                <span style={numeroGrande}>{giorni}</span>
                <span style={sotto}>{`${giorni === 1 ? 'giorno rimanente' : 'giorni rimanenti'} · ${stagione} ${dati.statoStagione || ''}`}</span>
              </>
            ) : (
              <>
                <span style={{ ...numeroGrande, fontSize: 22 }}>{dati.statoStagione || '—'}</span>
                <span style={sotto}>stato stagione</span>
              </>
            )}
          </div>

          <div style={placeholder}>
            <strong style={{ fontSize: 14, color: token('color.text.subtlest') }}>Spazio disponibile</strong>
            <span style={{ fontSize: 12, color: token('color.text.subtlest'), textAlign: 'center', maxWidth: 380 }}>
              Qui arriveranno i prossimi blocchi: posizione in classifica con il cambio,
              progressione verso il prossimo badge, sfide in corso, feed del team.
            </span>
          </div>
        </div>

        {/* -------------------------------------------- DESTRA 40%: treeview punti */}
        <div style={{ flex: '1 1 38%', minWidth: 300 }}>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: token('space.100') }}>
              <span style={etichetta}>⭐ Punti stagione</span>
              <span style={{ ...numeroGrande, fontSize: 28 }}>{dati.punti}</span>
              <span style={{ flex: 1 }} />
              {espandibili.length > 0 && (
                <>
                  <span onClick={espandiTutto} title="Espandi tutti i nodi" style={iconBtn}>⤢</span>
                  <span onClick={chiudiTutto} title="Chiudi tutti i nodi" style={iconBtn}>⤡</span>
                </>
              )}
              <span
                onClick={() => { if (!aggiornando) carica(); }}
                title="Aggiorna i dati (senza ricaricare la pagina)"
                style={{ ...iconBtn, opacity: aggiornando ? 0.5 : 1, cursor: aggiornando ? 'default' : 'pointer' }}
              >
                ↻
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', marginTop: token('space.150') }}>
              {nodi.map((n) => {
                const espandibile = n.eventi.length > 0;
                const aperto = espansi[n.chiave];
                return (
                  <div key={n.chiave}>
                    <div
                      style={{ ...rigaNodo, cursor: espandibile ? 'pointer' : 'default' }}
                      onClick={() => espandibile && toggle(n.chiave)}
                    >
                      <span style={{ width: 14, fontSize: 12, color: token('color.text.subtlest') }}>
                        {espandibile ? (aperto ? '▾' : '▸') : '·'}
                      </span>
                      <span style={{ fontSize: 13, color: token('color.text') }}>{`${n.emoji} ${n.nome}`}</span>
                      <span style={{ flex: 1 }} />
                      {n.assegnaPunti ? (
                        <span style={{ fontSize: 13, fontWeight: 600, color: token('color.text') }}>{`+${n.punti}`}</span>
                      ) : (
                        <Lozenge appearance="moved">segnalazione · nessun punto</Lozenge>
                      )}
                    </div>

                    {espandibile && aperto && n.eventi.map((ev, i) => (
                      <div key={`${n.chiave}-${i}`} style={rigaEvento}>
                        <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          {ev.ic ? <img src={ev.ic} width={14} height={14} alt="" style={{ flexShrink: 0 }} /> : null}
                          {ev.issueKey ? (
                            <span
                              onClick={() => apriIssue(ev.issueKey)}
                              title="Apri il work item"
                              style={{ color: token('color.link'), cursor: 'pointer', fontWeight: 600 }}
                            >
                              {ev.issueKey}
                            </span>
                          ) : (
                            <span style={{ color: token('color.text.subtlest') }}>—</span>
                          )}
                          <span style={{ color: token('color.text.subtlest') }}>{` · ${formatTs(ev.t)}`}</span>
                          {ev.statoLive ? (
                            <Lozenge appearance={appStato(ev.statoCat)}>{ev.statoLive}</Lozenge>
                          ) : null}
                        </span>
                        <span style={{ flex: 1 }} />
                        {n.assegnaPunti ? (
                          <span style={{ fontSize: 12, fontWeight: 600, color: ev.punti >= 0 ? token('color.text.success') : token('color.text.danger') }}>
                            {`${ev.punti >= 0 ? '+' : ''}${ev.punti}`}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: token('color.text.subtlest'), whiteSpace: 'nowrap' }}>
                            {ev.durataMin != null ? `fermo ${formattaDurata(ev.durataMin)} · nessun punto` : 'segnalazione · nessun punto'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <span style={{ display: 'block', marginTop: token('space.150'), fontSize: 11, color: token('color.text.subtlest') }}>
              I nodi si espandono per vedere i singoli eventi che hanno generato i punti.
            </span>
          </div>
        </div>
      </div>

      <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>
        Dashboard in costruzione: la colonna di sinistra ospiterà i prossimi blocchi.
      </span>
    </div>
  );
}

const pagina = {
  display: 'flex',
  flexDirection: 'column',
  gap: token('space.300'),
  padding: `${token('space.400')} ${token('space.500')}`,
};

const card = {
  display: 'flex',
  flexDirection: 'column',
  gap: token('space.075'),
  border: `1px solid ${token('color.border')}`,
  borderRadius: 8,
  padding: `${token('space.200')} ${token('space.250')}`,
};

const placeholder = {
  flex: 1,
  minHeight: 160,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: token('space.100'),
  border: `1px dashed ${token('color.border')}`,
  borderRadius: 8,
  padding: token('space.300'),
};

const rigaNodo = {
  display: 'flex',
  alignItems: 'center',
  gap: token('space.100'),
  paddingTop: token('space.100'),
  paddingBottom: token('space.100'),
  borderTop: `1px solid ${token('color.border')}`,
};

const rigaEvento = {
  display: 'flex',
  alignItems: 'center',
  gap: token('space.100'),
  paddingLeft: 28,
  paddingTop: token('space.050'),
  paddingBottom: token('space.050'),
};

const etichetta = { fontSize: 13, color: token('color.text.subtlest') };
const numeroGrande = { fontSize: 34, fontWeight: 700, color: token('color.text'), lineHeight: 1.1 };
const sotto = { fontSize: 12, color: token('color.text.subtlest') };

const iconBtn = {
  fontSize: 16,
  lineHeight: 1,
  color: token('color.text.subtlest'),
  cursor: 'pointer',
  padding: '2px 6px',
  borderRadius: 4,
  border: `1px solid ${token('color.border')}`,
};
