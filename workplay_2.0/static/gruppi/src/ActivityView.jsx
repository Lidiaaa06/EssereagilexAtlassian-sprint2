import React, { useEffect, useState } from 'react';
import { invoke, view } from '@forge/bridge';
import Spinner from '@atlaskit/spinner';
import Avatar from '@atlaskit/avatar';
import Lozenge from '@atlaskit/lozenge';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';
import { formattaDurata } from './durata';

// Pannello "WorkPlay" nella sezione Activity della issue (jira:issueActivity,
// Custom UI). Mockup Figma 100:2. Aggrega gli eventi WorkPlay del SOLO work item
// corrente da tre fonti (completamento/riapertura, feedback, decanter) con
// vocabolario leggibile (mai codici tecnici) e li mostra come cronologia a card.

// Vocabolario: flag antifarming → messaggio umano per il Team Leader.
const MESSAGGIO_FLAG = {
  SALTO_IN_PROGRESS: 'il work item è passato in Done senza transitare da In Progress. I punti restano assegnati, la revisione decide.',
  TROPPO_VELOCE: 'chiuso troppo in fretta dopo l\'inizio della lavorazione. I punti restano assegnati, la revisione decide.',
};

// Tipo evento → etichetta, emoji e colori del chip (sfondo tenue + testo accent).
const TIPI = {
  completato: { label: 'WORKITEM COMPLETATO', emoji: '⚡', bg: 'color.background.accent.yellow.subtlest', fg: 'color.text.accent.yellow' },
  riapertura: { label: 'RIAPERTURA', emoji: '↩️', bg: 'color.background.accent.red.subtlest', fg: 'color.text.accent.red' },
  feedback: { label: 'FEEDBACK', emoji: '🤝', bg: 'color.background.accent.purple.subtlest', fg: 'color.text.accent.purple' },
  decanter: { label: 'DECANTER', emoji: '⏳', bg: 'color.background.accent.gray.subtlest', fg: 'color.text.accent.gray' },
};

const AZIONE = {
  completato: 'ha completato il work item',
  riapertura: 'ha riaperto il work item',
  feedback: 'ha ricevuto un Feedback di aiuto',
  decanter: 'work item rimasto fermo',
};

function Chip({ bg, fg, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: token(bg), color: token(fg),
      fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
      padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function tempoRelativo(iso) {
  const d = new Date(iso);
  const now = new Date();
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mi = `${d.getMinutes()}`.padStart(2, '0');
  const ieri = new Date(now); ieri.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return `oggi ${hh}:${mi}`;
  if (d.toDateString() === ieri.toDateString()) return `ieri ${hh}:${mi}`;
  const gg = `${d.getDate()}`.padStart(2, '0');
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  return `${gg}/${mm} ${hh}:${mi}`;
}

export default function ActivityView() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);

  useEffect(() => {
    view.getContext()
      .then((ctx) => invoke('getWorkplayActivity', { issueKey: ctx?.extension?.issue?.key }))
      .then(setDati)
      .catch(() => setErrore('Impossibile caricare l\'attività WorkPlay. Ricarica la pagina.'));
  }, []);

  if (errore) {
    return <div style={pagina}><SectionMessage appearance="error">{errore}</SectionMessage></div>;
  }
  if (!dati) {
    return <div style={{ ...pagina, alignItems: 'center' }}><Spinner size="medium" /></div>;
  }

  const eventi = dati.eventi || [];
  const r = dati.riepilogo || { totalePunti: 0, numeroDeveloper: 0, numeroEventi: 0 };

  return (
    <div style={pagina}>
      {/* --------------------------------------------------- banner riassuntivo */}
      <div style={banner}>
        <span>🏅 Questo work item ha generato</span>
        <Lozenge appearance="success">{`${r.totalePunti >= 0 ? '+' : ''}${r.totalePunti} punti`}</Lozenge>
        <span style={{ color: token('color.text.subtle') }}>
          {`per ${r.numeroDeveloper} developer${r.numeroDeveloper === 1 ? '' : 's'} · ${r.numeroEventi} event${r.numeroEventi === 1 ? 'o' : 'i'} WorkPlay`}
        </span>
      </div>

      {/* --------------------------------------------------- cronologia eventi */}
      {eventi.length === 0 ? (
        <SectionMessage appearance="information" title="Nessun evento WorkPlay">
          Quando questo work item genererà punti (completamento, feedback, riapertura…) o resterà
          fermo troppo a lungo, gli eventi compariranno qui.
        </SectionMessage>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: token('space.150') }}>
          {eventi.map((e, i) => {
            const meta = TIPI[e.tipo] || TIPI.completato;
            const azione = AZIONE[e.tipo] || 'evento WorkPlay';
            const haPunti = typeof e.punti === 'number' && e.tipo !== 'decanter';
            const positivo = (e.punti ?? 0) >= 0;
            return (
              <div key={i} style={card}>
                {/* riga principale: avatar · nome · azione · tag tipo · punti · orario */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: token('space.150'), alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: token('space.100'), flexWrap: 'wrap' }}>
                    <Avatar size="small" src={e.avatar || undefined} name={e.nome} />
                    <strong style={{ color: token('color.text') }}>{e.nome}</strong>
                    <span style={{ color: token('color.text') }}>{azione}</span>
                    <Chip bg={meta.bg} fg={meta.fg}>{`${meta.emoji} ${meta.label}`}</Chip>
                    {haPunti && (
                      <Lozenge appearance={positivo ? 'success' : 'removed'}>{`${positivo ? '+' : ''}${e.punti}`}</Lozenge>
                    )}
                  </div>
                  <span style={{ color: token('color.text.subtlest'), fontSize: 12, whiteSpace: 'nowrap' }}>
                    {tempoRelativo(e.t)}
                  </span>
                </div>

                {/* righe di dettaglio, per tipo */}
                {righeDettaglio(e)}
              </div>
            );
          })}
        </div>
      )}

      {/* --------------------------------------------------- nota */}
      <span style={nota}>
        Gli eventi mostrano solo dati del work item corrente. Vocabolario leggibile: mai codici
        tecnici (es. SALTO_IN_PROGRESS → “passato in Done senza transitare da In Progress”).
      </span>
    </div>
  );
}

// Righe sotto la principale, diverse per tipo di evento.
function righeDettaglio(e) {
  const sub = { fontSize: 12, color: token('color.text.subtle') };

  if (e.tipo === 'completato') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: token('space.075') }}>
        {(e.stato || e.progetto) && (
          <span style={sub}>
            {`Passaggio in ${e.stato || '—'}${e.progetto ? ` · regola: ${e.progetto} / ${e.stato || ''}` : ''}`}
          </span>
        )}
        {(e.flags || []).length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: token('space.100'), flexWrap: 'wrap' }}>
            <Chip bg="color.background.accent.orange.subtlest" fg="color.text.accent.orange">⚠️ SEGNALATO</Chip>
            <span style={sub}>{`Al Team Leader: ${MESSAGGIO_FLAG[e.flags[0]] || e.flags.join(', ')}`}</span>
          </span>
        )}
      </div>
    );
  }

  if (e.tipo === 'riapertura') {
    return <span style={sub}>{`Tornato in lavorazione${e.stato ? ` · ${e.stato}` : ''} · punti tolti`}</span>;
  }

  if (e.tipo === 'feedback') {
    const testo = e.descrizione ? `“${e.descrizione}”` : '(senza descrizione)';
    return <span style={sub}>{`Da ${e.daNome || 'un collega'}: ${testo} · punti-aiuto`}</span>;
  }

  if (e.tipo === 'decanter') {
    const fermo = e.durataMin != null ? formattaDurata(e.durataMin) : '—';
    const soglia = e.sogliaMin != null ? formattaDurata(e.sogliaMin) : '—';
    return (
      <span style={sub}>
        {`Fermo da ${fermo} in ${e.stato || '—'} (soglia: ${soglia}) · segnalazione inviata al Team Leader · nessun punto`}
      </span>
    );
  }

  return null;
}

const pagina = {
  display: 'flex',
  flexDirection: 'column',
  gap: token('space.200'),
  padding: token('space.100'),
};

const banner = {
  display: 'flex',
  alignItems: 'center',
  gap: token('space.100'),
  flexWrap: 'wrap',
  background: token('color.background.neutral'),
  borderRadius: 8,
  padding: `${token('space.100')} ${token('space.200')}`,
  fontSize: 13,
  color: token('color.text'),
};

const card = {
  display: 'flex',
  flexDirection: 'column',
  gap: token('space.100'),
  border: `1px solid ${token('color.border')}`,
  borderRadius: 8,
  padding: `${token('space.150')} ${token('space.200')}`,
};

const nota = { fontSize: 11, color: token('color.text.subtlest') };
