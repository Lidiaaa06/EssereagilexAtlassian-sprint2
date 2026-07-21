import React, { useEffect, useState } from 'react';
import Button from '@atlaskit/button/new';
import Select from '@atlaskit/select';
import Spinner from '@atlaskit/spinner';
import Lozenge from '@atlaskit/lozenge';
import Textfield from '@atlaskit/textfield';
import Toggle from '@atlaskit/toggle';
import SectionMessage from '@atlaskit/section-message';
import { invoke } from '@forge/bridge';
import { token } from '@atlaskit/tokens';
import { parseDurata, formattaDurata } from './durata';

// Contenuto della modale "Aggiungi/Modifica regola di monitoraggio".
// Progetto → issue type → stati → (trigger secondo la famiglia).
//
// In Jira uno Space ha più issue type, ognuno col suo workflow e i suoi stati.
// Quindi: scelto il progetto si caricano gli issue type (ognuno coi suoi stati,
// dalla stessa chiamata); scelto l'issue type si popolano i suoi stati.
//
// La FAMIGLIA determina il trigger e i campi:
//   - 'evento' → trigger 'workitem-completato'. Il punteggio non si tocca qui:
//     è quello globale (config), modificabile dalla card Trigger.
//   - 'tempo'  → trigger 'workitem-decanter'. Compare il campo SOGLIA (giorni):
//     oltre quella soglia in uno degli stati sorvegliati, scatta.
export default function FormRegola({ regola, progettoPreset, famiglia, puntiWorkItem, onConferma, onAnnulla }) {
  const inModifica = Boolean(regola);

  // Famiglia effettiva: in modifica dalla regola, in creazione dal prop.
  const fam = regola
    ? (regola.famiglia || (regola.trigger === 'workitem-decanter' ? 'tempo' : 'evento'))
    : (famiglia || 'evento');
  const eTempo = fam === 'tempo';
  const triggerKey = eTempo ? 'workitem-decanter' : 'workitem-completato';

  // Soglia come DURATA in stile Jira (solo famiglia 'tempo'): "3h", "2d", "1w 2d".
  // In modifica dal testo salvato; le regole legacy avevano solo i giorni interi.
  const [soglia, setSoglia] = useState(
    regola?.sogliaTesto || (regola?.sogliaGiorni ? `${regola.sogliaGiorni}d` : '5d')
  );

  // Interruttore "ripeti ad ogni scansione" (solo famiglia tempo). Default OFF.
  const [ripetiOgniGiro, setRipetiOgniGiro] = useState(Boolean(regola?.ripetiOgniGiro));

  // Stato del pulsante "Forza esecuzione" (solo modifica, famiglia tempo): conferma
  // inline + esito. Forza una passata del Decanter (resolver decanterEseguiOra).
  const [forzaConferma, setForzaConferma] = useState(false);
  const [forzaInCorso, setForzaInCorso] = useState(false);
  const [forzaEsito, setForzaEsito] = useState(null);

  // Progetto iniziale: in modifica quello della regola; in creazione, se si
  // arriva dal "+ Aggiungi trigger" di uno Space, quello preselezionato.
  const progettoIniziale = regola
    ? { label: `${regola.progettoKey} — ${regola.progettoNome}`, value: regola.progettoKey, nome: regola.progettoNome }
    : (progettoPreset
        ? { label: `${progettoPreset.key} — ${progettoPreset.nome}`, value: progettoPreset.key, nome: progettoPreset.nome }
        : null);

  const [progetti, setProgetti] = useState(null);
  const [progetto, setProgetto] = useState(progettoIniziale);

  // Issue type del progetto, ognuno con i propri stati: [{id, nome, stati:[]}].
  const [issueTypes, setIssueTypes] = useState([]);
  const [caricandoTipi, setCaricandoTipi] = useState(false);
  const [issueType, setIssueType] = useState(
    regola ? { label: regola.issueTypeNome, value: regola.issueTypeId } : null
  );

  // Stati SELEZIONATI (multi): dalla forma nuova (`stati: []`) o da quella vecchia
  // a stato singolo (`statoId/statoNome`), per le regole già salvate.
  const statiIniziali = regola
    ? (Array.isArray(regola.stati)
        ? regola.stati.map((s) => ({ label: s.nome, value: s.id }))
        : (regola.statoId ? [{ label: regola.statoNome, value: regola.statoId }] : []))
    : [];
  const [stati, setStati] = useState(statiIniziali);

  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState(null);

  // Carica i progetti all'apertura, e gli issue type se c'è già un progetto
  // (modifica o preset): così i campi a valle sono selezionabili subito.
  useEffect(() => {
    invoke('workflowProgetti')
      .then((res) => {
        setProgetti(
          res.errore ? [] : res.progetti.map((p) => ({
            label: `${p.key} — ${p.nome}`, value: p.key, nome: p.nome, avatarUrl: p.avatarUrl,
          }))
        );
      })
      .catch(() => setProgetti([]));

    if (progettoIniziale) caricaIssueTypes(progettoIniziale.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carica issue type + stati del progetto scelto.
  const caricaIssueTypes = (progettoKey) => {
    setCaricandoTipi(true);
    setIssueTypes([]);
    invoke('workflowStatiProgetto', { progettoKey })
      .then((res) => {
        setIssueTypes(res.errore ? [] : (res.issueTypes || []));
        setCaricandoTipi(false);
      })
      .catch(() => { setIssueTypes([]); setCaricandoTipi(false); });
  };

  const scegliProgetto = (opzione) => {
    setProgetto(opzione);
    setIssueType(null);
    setStati([]);
    if (opzione) caricaIssueTypes(opzione.value);
  };

  const scegliIssueType = (opzione) => {
    setIssueType(opzione);
    setStati([]);
  };

  // Stati dell'issue type selezionato (derivati, non uno stato a parte).
  const tipoSelezionato = issueTypes.find((t) => String(t.id) === String(issueType?.value));
  const opzioniStato = (tipoSelezionato?.stati || []).map((s) => ({ label: s.nome, value: s.id }));
  const opzioniIssueType = issueTypes.map((t) => ({ label: t.nome, value: t.id }));

  const sogliaMin = parseDurata(soglia);
  const sogliaOk = !eTempo || (sogliaMin !== null && sogliaMin >= 1);

  const conferma = () => {
    if (inCorso || !progetto || !issueType || stati.length === 0 || !sogliaOk) return;
    setInCorso(true);
    setErrore(null);

    Promise.resolve(
      onConferma({
        progettoKey: progetto.value,
        progettoNome: progetto.nome || progetto.label,
        issueTypeId: issueType.value,
        issueTypeNome: issueType.label,
        stati: stati.map((o) => ({ id: o.value, nome: o.label })),
        trigger: triggerKey,
        ...(eTempo ? { sogliaTesto: soglia.trim(), ripetiOgniGiro } : {}),
      })
    ).catch((e) => {
      setErrore(e?.message || 'Errore imprevisto. Riprova.');
      setInCorso(false);
    });
  };

  // Forza SUBITO una passata del Decanter (tutte le regole a tempo). Admin-only,
  // lato resolver. Feedback inline con l'esito.
  const forzaEsecuzione = () => {
    setForzaInCorso(true);
    setForzaEsito(null);
    invoke('decanterEseguiOra')
      .then((r) => {
        if (r?.errore) setForzaEsito({ errore: true, testo: r.errore });
        else setForzaEsito({ errore: false, testo: `Fatto: ${r?.decantati ?? 0} rilevati fermi su ${r?.scansionati ?? 0} scansionati (${r?.regole ?? 0} regole a tempo).` });
        setForzaConferma(false);
      })
      .catch(() => setForzaEsito({ errore: true, testo: 'Esecuzione non riuscita. Riprova.' }))
      .finally(() => setForzaInCorso(false));
  };

  if (progetti === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <Spinner size="medium" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: token('space.150') }}>
      {errore && <SectionMessage appearance="error">{errore}</SectionMessage>}

      <div>
        <label style={etichetta}>Progetto (Jira Space)</label>
        <Select
          isSearchable
          placeholder="Scegli un progetto Jira…"
          options={progetti}
          value={progetto}
          onChange={scegliProgetto}
          formatOptionLabel={rendiProgetto}
        />
      </div>

      <div>
        <label style={etichetta}>Issue type da intercettare</label>
        <Select
          isSearchable
          isLoading={caricandoTipi}
          isDisabled={!progetto || caricandoTipi}
          placeholder={progetto ? 'Scegli l’issue type…' : 'Prima scegli un progetto'}
          options={opzioniIssueType}
          value={issueType}
          onChange={scegliIssueType}
        />
      </div>

      <div>
        <label style={etichetta}>{eTempo ? 'Stati da sorvegliare' : 'Stati che assegnano i punti'}</label>
        <Select
          isMulti
          isSearchable
          isDisabled={!issueType}
          placeholder={issueType ? 'Scegli uno o più stati…' : 'Prima scegli l’issue type'}
          options={opzioniStato}
          value={stati}
          onChange={(v) => setStati(v || [])}
        />
        <span style={{ display: 'block', marginTop: token('space.075'), fontSize: 12, color: token('color.text.subtlest') }}>
          {eTempo
            ? 'Il Decanter scatta se il work item resta in uno QUALSIASI di questi stati oltre la soglia.'
            : 'Il work item conta come completato entrando in uno QUALSIASI di questi stati (es. WON o LOST).'}
        </span>
      </div>

      {eTempo && (
        <div>
          <label style={etichetta}>Soglia</label>
          <Textfield
            value={soglia}
            onChange={(e) => setSoglia(e.target.value)}
            placeholder="es. 3h · 2d · 1w 2d"
            isInvalid={soglia.trim() !== '' && !sogliaOk}
          />
          <span style={{ display: 'block', marginTop: token('space.050'), fontSize: 12, color: token('color.text.subtlest') }}>
            {soglia.trim() === ''
              ? 'Indica una durata. '
              : (sogliaOk ? `= ${formattaDurata(sogliaMin)}. ` : 'Durata non valida. ')}
            Sintassi Jira w/d/h/m (es. <strong>3h</strong>, <strong>2d</strong>, <strong>1w 2d</strong>; solo numero = minuti). Calendario: 1w=7g, 1d=24h.
          </span>
        </div>
      )}

      {eTempo && (
        <div>
          <label style={etichetta}>Ripeti l'azione ad ogni scansione</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: token('space.100') }}>
            <Toggle
              id="ripeti-ogni-giro"
              isChecked={ripetiOgniGiro}
              onChange={(e) => setRipetiOgniGiro(e.target.checked)}
            />
            <span style={{ fontSize: 13, color: token('color.text') }}>
              {ripetiOgniGiro
                ? 'ON — segnala al Team Leader e commenta ad ogni scansione'
                : 'OFF — segnala/commenta una sola volta per soggiorno'}
            </span>
          </div>
          <span style={{ display: 'block', marginTop: token('space.050'), fontSize: 12, color: token('color.text.subtlest') }}>
            Il tracciamento (Activity/audit) avviene <strong>sempre</strong>. L'interruttore decide
            solo se <strong>ripetere</strong> segnalazione e commento ad ogni giro, o una volta per soggiorno.
          </span>
        </div>
      )}

      <div>
        <label style={etichetta}>Trigger</label>
        {eTempo ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: token('space.100') }}>
            <Lozenge appearance="inprogress">⏳ Work Item Decanter</Lozenge>
            <span style={{ fontSize: 13, color: token('color.text.subtlest') }}>
              segnala al Team Leader + commenta il work item (nessun punto tolto)
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: token('space.100') }}>
            <Lozenge appearance="inprogress">⚡ WorkItem Completato</Lozenge>
            <span style={{ fontSize: 13, color: token('color.text.subtlest') }}>
              +{puntiWorkItem} punti all'assegnatario
            </span>
          </div>
        )}
      </div>

      {/* Forzatura manuale del trigger a tempo: solo in modifica, famiglia tempo.
          Frame con sfondo rosso sfumato per renderlo evidente/"attenzione". */}
      {eTempo && inModifica && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: token('space.100'),
          padding: `${token('space.150')} ${token('space.200')}`,
          borderRadius: 8,
          border: `1px solid ${token('color.border.danger')}`,
          background: `linear-gradient(135deg, ${token('color.background.danger')}, ${token('color.background.danger.hovered')})`,
        }}>
          {!forzaConferma ? (
            <button
              type="button"
              onClick={() => { setForzaConferma(true); setForzaEsito(null); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
                background: token('color.background.danger.bold'), color: token('color.text.inverse'),
                border: 'none', borderRadius: 6, padding: '8px 14px',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              ▶ Forza manualmente l'esecuzione di questo trigger
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: token('space.100') }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: token('color.text.danger') }}>
                Sei proprio sicuro di voler forzare l'esecuzione del trigger a tempo?
              </span>
              <span style={{ fontSize: 12, color: token('color.text.subtle') }}>
                Esegue subito una passata del Decanter su TUTTE le regole a tempo (non solo questa).
              </span>
              <div style={{ display: 'flex', gap: token('space.100') }}>
                <Button appearance="danger" isLoading={forzaInCorso} onClick={forzaEsecuzione}>Sì, forza</Button>
                <Button appearance="subtle" isDisabled={forzaInCorso} onClick={() => setForzaConferma(false)}>Annulla</Button>
              </div>
            </div>
          )}
          {forzaEsito && (
            <span style={{ fontSize: 12, color: forzaEsito.errore ? token('color.text.danger') : token('color.text.success') }}>
              {forzaEsito.testo}
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: token('space.100'), paddingTop: token('space.100') }}>
        <Button appearance="subtle" onClick={onAnnulla}>Annulla</Button>
        <Button appearance="primary" isDisabled={!progetto || !issueType || stati.length === 0 || !sogliaOk || inCorso} onClick={conferma}>
          {inModifica ? 'Salva' : 'Aggiungi regola'}
        </Button>
      </div>
    </div>
  );
}

// Opzione del progetto con l'avatar dello Space accanto al nome (come negli
// altri campi Jira). Se l'avatar non c'è/non carica, resta solo il testo.
const rendiProgetto = (opt) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    {opt.avatarUrl
      ? <img src={opt.avatarUrl} alt="" width={16} height={16} style={{ borderRadius: 3, flexShrink: 0 }} />
      : null}
    <span>{opt.label}</span>
  </span>
);

const etichetta = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: token('color.text'),
  marginBottom: token('space.075'),
};
