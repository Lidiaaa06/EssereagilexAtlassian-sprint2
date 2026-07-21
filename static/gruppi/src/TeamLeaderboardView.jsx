import React, { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';
import Spinner from '@atlaskit/spinner';
import Lozenge from '@atlaskit/lozenge';
import Avatar from '@atlaskit/avatar';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';

// Team Leaderboard (global page "WorkPlay" → sotto-pagina Team Leaderboard).
// Mockup Figma 6:83. La classifica è del PROPRIO team (gruppo), non globale:
// i developer che fanno capo ad altri Team Leader non compaiono. Due tab:
//   • 🏆 Team Leaderboard → punti stagione (XP), colonne XP/Task/Sfide.
//   • 🤝 Aiuti del team    → punti-aiuto (pool separato), colonna singola.
// Il "Cambio" confronta la posizione con lo snapshot di ieri (per-gruppo).

const MEDAGLIE = ['🥇', '🥈', '🥉'];

// Colonna "Cambio": ▲ verde se salito, ▼ rosso se sceso, — se fermo/nuovo.
function Cambio({ valore }) {
  const v = Number(valore) || 0;
  if (v > 0) return <span style={{ color: token('color.text.success'), fontWeight: 600 }}>{`▲ +${v}`}</span>;
  if (v < 0) return <span style={{ color: token('color.text.danger'), fontWeight: 600 }}>{`▼ ${v}`}</span>;
  return <span style={{ color: token('color.text.subtlest') }}>—</span>;
}

export default function TeamLeaderboardView() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [tab, setTab] = useState('xp'); // 'xp' | 'aiuti'
  const [aggiornando, setAggiornando] = useState(false);

  // Ricarica SOLO i dati (getTeamLeaderboard), senza ricaricare la pagina. Usata
  // al mount e dal pulsante refresh accanto ai tab.
  const carica = () => {
    setAggiornando(true);
    return invoke('getTeamLeaderboard')
      .then((r) => {
        if (r?.errore) { setErrore(r.errore); return; }
        setErrore(null);
        setDati(r);
      })
      .catch(() => setErrore('Impossibile caricare la Team Leaderboard. Ricarica la pagina.'))
      .finally(() => setAggiornando(false));
  };

  useEffect(() => { carica(); }, []);

  if (errore) {
    return (
      <div style={pagina}>
        <SectionMessage appearance="error" title="Team Leaderboard non disponibile">{errore}</SectionMessage>
      </div>
    );
  }
  if (!dati) {
    return <div style={{ ...pagina, alignItems: 'center' }}><Spinner size="large" /></div>;
  }

  const giorni = Number(dati.giorniRimanenti);
  const giorniValidi = Number.isFinite(giorni) && giorni >= 0;
  const stagione = dati.stagioneNome || 'Stagione in corso';
  const sottotitolo = `🏟️ ${stagione}`
    + (giorniValidi ? ` · si azzera tra ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}` : '')
    + ' · i punti migrano nei punti legacy, nulla va perso';

  // Stato vuoto: chi non è in nessun team, o gruppi non ancora creati (decisione 20/07).
  if (!dati.team) {
    return (
      <div style={pagina}>
        <h1 style={titolo}>Team Leaderboard</h1>
        <span style={{ fontSize: 13, color: token('color.text.subtlest') }}>{sottotitolo}</span>
        <SectionMessage appearance="information" title="Non fai ancora parte di nessun team">
          La Team Leaderboard mostra la classifica del tuo team. Quando l'amministratore ti
          inserirà in un gruppo, qui vedrai la classifica dei tuoi compagni di team.
        </SectionMessage>
      </div>
    );
  }

  const righe = tab === 'xp' ? (dati.righe || []) : (dati.righeAiuti || []);

  return (
    <div style={pagina}>
      {/* --------------------------------------------------------- header contesto */}
      <h1 style={titolo}>Team Leaderboard</h1>
      <span style={{ fontSize: 13, color: token('color.text.subtlest') }}>{sottotitolo}</span>

      <span style={{ display: 'flex', alignItems: 'center', gap: token('space.100'), flexWrap: 'wrap' }}>
        <Lozenge appearance="new">{`👔 ${dati.team.nome}`}</Lozenge>
        <span style={{ fontSize: 13, color: token('color.text.subtle') }}>
          {`il tuo team · ${dati.team.numeroDeveloper} developer${dati.team.numeroDeveloper === 1 ? '' : 's'} · Team Leader:`}
        </span>
        <Avatar size="small" src={dati.team.teamLeaderAvatar || undefined} name={dati.team.teamLeader} />
        <span style={{ fontSize: 13, color: token('color.text.subtle') }}>{dati.team.teamLeader}</span>
      </span>

      {/* --------------------------------------------------------- tab + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', gap: token('space.300'), borderBottom: `2px solid ${token('color.border')}`, marginTop: token('space.100') }}>
        <TabVoce attivo={tab === 'xp'} onClick={() => setTab('xp')} label="🏆 Team Leaderboard" />
        <TabVoce attivo={tab === 'aiuti'} onClick={() => setTab('aiuti')} label="🤝 Aiuti del team" />
        <span style={{ flex: 1 }} />
        <span
          onClick={() => { if (!aggiornando) carica(); }}
          title="Aggiorna i dati (senza ricaricare la pagina)"
          style={{
            fontSize: 16, lineHeight: 1, color: token('color.text.subtlest'),
            padding: '2px 6px', borderRadius: 4, border: `1px solid ${token('color.border')}`,
            marginBottom: token('space.100'),
            opacity: aggiornando ? 0.5 : 1, cursor: aggiornando ? 'default' : 'pointer',
          }}
        >
          ↻
        </span>
      </div>

      {/* --------------------------------------------------------- tabella */}
      <div style={tabella}>
        {/* intestazione colonne */}
        <div style={{ ...riga, borderTop: 'none', fontWeight: 600, color: token('color.text.subtlest'), fontSize: 12 }}>
          <span style={colPos}>Pos.</span>
          <span style={colNome}>Nome</span>
          {tab === 'xp' ? (
            <>
              <span style={colNum}>XP Tot.</span>
              <span style={colNum}>Task</span>
              <span style={colNum}>Sfide</span>
            </>
          ) : (
            <span style={colNum}>Punti aiuto</span>
          )}
          <span style={colCambio}>Cambio</span>
        </div>

        {righe.length === 0 ? (
          <div style={{ ...riga, color: token('color.text.subtlest'), fontSize: 13 }}>
            Il team non ha ancora developer con attività in questa stagione.
          </div>
        ) : righe.map((r, i) => {
          const podio = i < 3;
          const valore = tab === 'xp' ? r.punti : r.aiuti;
          return (
            <div key={r.accountId} style={{ ...riga, ...(podio ? sfondoPodio[i] : null), ...(r.sonoIo ? sfondoIo : null) }}>
              <span style={colPos}>
                {podio ? <span style={{ marginRight: 6 }}>{MEDAGLIE[i]}</span> : null}
                <span style={{ color: token('color.text.subtlest') }}>{`#${i + 1}`}</span>
              </span>
              <span style={{ ...colNome, display: 'flex', alignItems: 'center', gap: token('space.100') }}>
                <Avatar size="small" src={r.avatar || undefined} name={r.nome} />
                <span style={{ fontWeight: r.sonoIo || podio ? 700 : 400, color: token('color.text') }}>
                  {r.nome}{r.sonoIo ? ' (tu)' : ''}
                </span>
              </span>
              {tab === 'xp' ? (
                <>
                  <span style={colNum}>{r.punti}</span>
                  <span style={colNum}>{r.task}</span>
                  <span style={colNum}>{r.sfide}</span>
                </>
              ) : (
                <span style={colNum}>{valore}</span>
              )}
              <span style={colCambio}><Cambio valore={r.cambioPosizione} /></span>
            </div>
          );
        })}
      </div>

      {/* --------------------------------------------------------- note */}
      <span style={nota}>
        ℹ️ La colonna "Cambio" confronta la posizione con lo snapshot di ieri.
        Nel tab "Aiuti del team" la stessa tabella mostra i punti-aiuto (pool separato).
      </span>
      <span style={nota}>
        👁 Vedi solo la classifica del tuo team: i developer che fanno capo ad altri
        Team Leader non compaiono. Ogni team gioca la propria classifica.
      </span>
    </div>
  );
}

function TabVoce({ attivo, onClick, label }) {
  return (
    <span
      onClick={onClick}
      style={{
        cursor: 'pointer',
        paddingBottom: token('space.100'),
        marginBottom: -2,
        fontSize: 14,
        fontWeight: attivo ? 700 : 400,
        color: attivo ? token('color.text.selected') : token('color.text.subtle'),
        borderBottom: `2px solid ${attivo ? token('color.border.selected') : 'transparent'}`,
      }}
    >
      {label}
    </span>
  );
}

const pagina = {
  display: 'flex',
  flexDirection: 'column',
  gap: token('space.150'),
  padding: `${token('space.400')} ${token('space.500')}`,
};

const titolo = { fontSize: 24, margin: 0, color: token('color.text') };

const tabella = {
  display: 'flex',
  flexDirection: 'column',
  border: `1px solid ${token('color.border')}`,
  borderRadius: 8,
  overflow: 'hidden',
  marginTop: token('space.100'),
};

const riga = {
  display: 'flex',
  alignItems: 'center',
  gap: token('space.100'),
  padding: `${token('space.150')} ${token('space.200')}`,
  borderTop: `1px solid ${token('color.border')}`,
  fontSize: 14,
  color: token('color.text'),
};

const colPos = { flex: '0 0 90px', display: 'flex', alignItems: 'center' };
const colNome = { flex: '1 1 220px', minWidth: 160 };
const colNum = { flex: '0 0 110px' };
const colCambio = { flex: '0 0 90px' };

// Tinte del podio (oro/argento/bronzo) e riga "sei tu".
const sfondoPodio = [
  { background: token('color.background.accent.yellow.subtlest') },
  { background: token('color.background.accent.gray.subtlest') },
  { background: token('color.background.accent.orange.subtlest') },
];
const sfondoIo = { boxShadow: `inset 3px 0 0 ${token('color.border.selected')}` };

const nota = { fontSize: 12, color: token('color.text.subtlest'), marginTop: token('space.050') };
