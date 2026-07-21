import React, { useCallback, useEffect, useState } from 'react';
import { invoke, Modal } from '@forge/bridge';
import Button from '@atlaskit/button/new';
import Spinner from '@atlaskit/spinner';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';
import ChallengesTab from './ChallengesTab';
import ExtraTab from './ExtraTab';
import SeasonsTab from './SeasonsTab';
import WorkflowTab from './WorkflowTab';
import AuditLogTab from './AuditLogTab';

// Subpage "Settings". Frame Figma 73:2 (Challenges) e 40:2 (Stagioni).
//
// Un solo catalogo, due schede: Challenges mostra le categorie `gruppo:
// challenge`, Extra quelle `gruppo: extra` (Feedback e Golden WorkItem). Il
// filtro è qui; le due schede sono cloni grafici. Workflow configura le regole
// di monitoraggio; il punteggio del trigger si modifica lì (matita sulla card).

const TAB = { WORKFLOW: 'Workflow', CHALLENGES: 'Challenges', EXTRA: 'Extra', SEASON: 'Season', AUDIT: 'Audit Log' };

export default function SettingsPage() {
  const [tab, setTab] = useState(TAB.WORKFLOW);
  const [catalogo, setCatalogo] = useState(null);
  const [selezionata, setSelezionata] = useState('giornaliera');
  const [selezionataExtra, setSelezionataExtra] = useState('feedback');
  const [config, setConfig] = useState(null);
  const [errore, setErrore] = useState(null);
  const [avviso, setAvviso] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [ripristinando, setRipristinando] = useState(false);
  const [stagioni, setStagioni] = useState([]);
  const [regole, setRegole] = useState({ regole: [], trigger: [], puntiWorkItem: 3 });

  const carica = useCallback(() => {
    return Promise.all([
      invoke('catalogoGet'),
      invoke('getConfigPunti'),
      invoke('getConfigGoldenTicket'),
      invoke('stagioniGet'),
      invoke('workflowRegoleGet'),
    ])
      .then(([cat, punti, gt, sea, wf]) => {
        if (cat?.errore) { setErrore(cat.errore); return; }
        setCatalogo({ categorie: cat.categorie, sfide: cat.sfide });
        setStagioni(sea?.errore ? [] : (sea.stagioni || []));
        if (!wf?.errore) setRegole({ regole: wf.regole, trigger: wf.trigger, puntiWorkItem: wf.puntiWorkItem });

        setConfig({
          puntiPerTicket: Number(punti?.puntiPerTicket ?? 3),
          soglia: Number(gt?.soglia ?? 100),
          max: Number(gt?.max ?? 3),
          partenza: Number(gt?.partenza ?? 1),
        });
        setErrore(null);
      })
      .catch(() => setErrore('Impossibile caricare la configurazione. Ricarica la pagina.'));
  }, []);

  useEffect(() => { carica(); }, [carica]);

  // Ogni scrittura sul catalogo restituisce categorie + sfide aggiornate:
  // stesso schema della pagina Groups, per non fare due giri di rete.
  const azioneCatalogo = (nome, payload) =>
    invoke(nome, payload)
      .then((res) => {
        if (res.errore) { setAvviso({ tipo: 'error', testo: res.errore }); return; }
        setAvviso(null);
        setCatalogo({ categorie: res.categorie, sfide: res.sfide });
      })
      .catch(() => setAvviso({ tipo: 'error', testo: 'Errore imprevisto. Riprova.' }));

  // Il ripristino ha un esito che vale la pena raccontare: quante ne sono
  // tornate, o che non mancava nulla. Un'azione silenziosa lascerebbe l'admin
  // a chiedersi se ha funzionato.
  const ripristina = () => {
    if (ripristinando) return;
    setRipristinando(true);
    setAvviso(null);

    invoke('catalogoRipristinaDefault')
      .then((res) => {
        if (res.errore) {
          setAvviso({ tipo: 'error', testo: res.errore });
        } else {
          setCatalogo({ categorie: res.categorie, sfide: res.sfide });
          setAvviso({
            tipo: 'success',
            testo: res.aggiunte === 0
              ? 'Nessuna sfida da ripristinare: il catalogo contiene già tutte quelle di default.'
              : `Ripristinate ${res.aggiunte} sfide di default. Quelle già presenti non sono state modificate.`,
          });
        }
        setRipristinando(false);
      })
      .catch(() => {
        setAvviso({ tipo: 'error', testo: 'Errore imprevisto. Riprova.' });
        setRipristinando(false);
      });
  };

  // Modale crea/modifica sfida, aperta dal PRODOTTO: una modale Atlaskit
  // resterebbe confinata nell'iframe della Custom UI. Stessa entry point delle
  // modali dei gruppi, discriminata dal `tipo` nel context.
  const apriModaleSfida = (categoria, sfida) => {
    new Modal({
      resource: 'gruppi-resource/modale',
      size: 'medium',
      // "Item" e non "sfida": la stessa modale serve tutte le categorie,
      // Feedback compreso, dove "sfida" sarebbe fuori luogo.
      title: sfida
        ? `Modifica Item — ${categoria.emoji} ${categoria.nome}`
        : `Aggiungi Item — ${categoria.emoji} ${categoria.nome}`,
      context: { tipo: 'sfida', categoria, sfida },
      onClose: (esito) => {
        if (!esito || !esito.ricarica) return;
        carica();
      },
    }).open();
  };

  // Modale crea/modifica/visualizza stagione, stessa entry point delle altre.
  // soloLettura = stagione conclusa: campi bloccati, ma eliminabile con conferma.
  const apriModaleStagione = (stagione, soloLettura = false) => {
    new Modal({
      resource: 'gruppi-resource/modale',
      size: 'medium',
      title: soloLettura
        ? 'Stagione conclusa'
        : (stagione ? 'Modifica stagione' : 'Aggiungi stagione'),
      context: { tipo: 'stagione', stagione, soloLettura },
      onClose: (esito) => {
        if (!esito || !esito.ricarica) return;
        carica();
      },
    }).open();
  };

  const eliminaStagione = (id) =>
    invoke('stagioniElimina', { id })
      .then((res) => {
        if (res.errore) { setAvviso({ tipo: 'error', testo: res.errore }); return; }
        setAvviso(null);
        setStagioni(res.stagioni || []);
      })
      .catch(() => setAvviso({ tipo: 'error', testo: 'Errore imprevisto. Riprova.' }));

  const apriModaleRegola = (regola, progettoPreset = null, famiglia = 'evento') => {
    const fam = regola ? (regola.famiglia || (regola.trigger === 'workitem-decanter' ? 'tempo' : 'evento')) : famiglia;
    new Modal({
      resource: 'gruppi-resource/modale',
      // 'large' (non 'medium'): la regola a tempo ha più campi (soglia, interruttore,
      // forzatura); più largo = testi su meno righe = niente scroll verticale.
      size: 'large',
      title: regola ? 'Modifica regola' : (fam === 'tempo' ? 'Aggiungi regola a tempo' : 'Aggiungi regola a evento'),
      context: { tipo: 'regola', regola, progettoPreset, famiglia: fam, puntiWorkItem: regole.puntiWorkItem },
      onClose: (esito) => { if (esito && esito.ricarica) carica(); },
    }).open();
  };

  // Forza una passata del Decanter (trigger a tempo) senza aspettare il giro
  // giornaliero. Utile a testare le regole a tempo e il fix dell'endpoint search.
  const eseguiDecanterOra = () => {
    if (salvando) return;
    setSalvando(true);
    setAvviso(null);
    invoke('decanterEseguiOra')
      .then((res) => {
        if (res?.errore) { setAvviso({ tipo: 'error', testo: res.errore }); setSalvando(false); return; }
        setAvviso({
          tipo: 'success',
          testo: `Decanter eseguito: ${res.regole ?? 0} regole a tempo · ${res.scansionati ?? 0} work item scansionati · ${res.decantati ?? 0} segnalati.`,
        });
        setSalvando(false);
      })
      .catch(() => { setAvviso({ tipo: 'error', testo: 'Errore imprevisto. Riprova.' }); setSalvando(false); });
  };

  const eliminaRegola = (id) =>
    invoke('workflowRegolaElimina', { id })
      .then((res) => {
        if (res.errore) { setAvviso({ tipo: 'error', testo: res.errore }); return; }
        setAvviso(null);
        setRegole((prec) => ({ ...prec, regole: res.regole }));
      })
      .catch(() => setAvviso({ tipo: 'error', testo: 'Errore imprevisto. Riprova.' }));

  // Modifica di un trigger dalla card Trigger (Workflow): nome/descrizione e,
  // per il trigger a evento, anche il punteggio. Aggiorna il catalogo trigger e
  // regole.puntiWorkItem, che alimentano le righe.
  const salvaTrigger = ({ key, nome, descrizione, puntiPerTicket }) => {
    if (salvando) return;
    setSalvando(true);
    setAvviso(null);

    const chiamate = [invoke('workflowTriggerModifica', { key, nome, descrizione })];
    if (puntiPerTicket !== undefined) chiamate.push(invoke('setConfigPunti', { puntiPerTicket }));

    Promise.all(chiamate)
      .then((esiti) => {
        const ko = esiti.find((e) => e?.errore);
        if (ko) { setAvviso({ tipo: 'error', testo: ko.errore }); setSalvando(false); return; }
        if (puntiPerTicket !== undefined) setConfig((c) => ({ ...c, puntiPerTicket }));
        const nuovoTrigger = esiti[0]?.trigger;
        setRegole((prec) => ({
          ...prec,
          ...(nuovoTrigger ? { trigger: nuovoTrigger } : {}),
          ...(puntiPerTicket !== undefined ? { puntiWorkItem: puntiPerTicket } : {}),
        }));
        setAvviso({ tipo: 'success', testo: 'Trigger aggiornato.' });
        setSalvando(false);
      })
      .catch(() => { setAvviso({ tipo: 'error', testo: 'Errore imprevisto. Riprova.' }); setSalvando(false); });
  };

  // Config Golden WorkItem: salvata subito dal dettaglio nel tab Extra.
  const salvaGolden = ({ soglia, max, partenza }) => {
    if (salvando) return;
    setSalvando(true);
    setAvviso(null);
    invoke('setConfigGoldenTicket', { soglia, max, partenza })
      .then((res) => {
        if (res?.errore) { setAvviso({ tipo: 'error', testo: res.errore }); setSalvando(false); return; }
        setConfig((c) => ({ ...c, soglia, max, partenza }));
        setAvviso({ tipo: 'success', testo: 'Golden WorkItem aggiornato.' });
        setSalvando(false);
      })
      .catch(() => { setAvviso({ tipo: 'error', testo: 'Errore imprevisto. Riprova.' }); setSalvando(false); });
  };

  if (errore) {
    return (
      <div style={pagina}>
        <SectionMessage appearance="error" title="Accesso non riuscito">{errore}</SectionMessage>
      </div>
    );
  }

  if (!catalogo || !config) {
    return <div style={{ ...pagina, alignItems: 'center' }}><Spinner size="large" /></div>;
  }

  // Stesso catalogo, due schede: si filtra per gruppo. Le sfide si passano
  // intere — ogni scheda mostra solo gli item delle proprie categorie.
  const categorieChallenge = catalogo.categorie.filter((c) => c.gruppo !== 'extra');
  const categorieExtra = catalogo.categorie.filter((c) => c.gruppo === 'extra');
  const goldenConfig = { soglia: config.soglia, max: config.max, partenza: config.partenza };

  return (
    <div style={pagina}>
      <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>
        Impostazioni Jira › App › WorkPlay
      </span>

      <h1 style={{ fontSize: 24, margin: 0, color: token('color.text') }}>Settings</h1>

      <div style={{ display: 'flex', gap: token('space.300') }}>
        {Object.values(TAB).map((t) => (
          <div
            key={t}
            onClick={() => setTab(t)}
            style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? token('color.text.selected') : token('color.text.subtlest'),
              }}
            >
              {t}
            </span>
            <div
              style={{
                height: 2, width: 85, borderRadius: 1,
                backgroundColor: tab === t ? token('color.border.selected') : 'transparent',
              }}
            />
          </div>
        ))}
      </div>

      {avviso && (
        <SectionMessage appearance={avviso.tipo === 'error' ? 'error' : 'success'}>
          {avviso.testo}
        </SectionMessage>
      )}

      {tab === TAB.CHALLENGES && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: token('space.200') }}>
            <p style={{ flex: 1, fontSize: 13, color: token('color.text.subtlest'), margin: 0 }}>
              Il catalogo dell'organizzazione. Le categorie sono fisse: aggiungi le
              sfide direttamente nell'albero, erediteranno punteggio di default e
              limiti della categoria. "✎" sulla categoria per personalizzare default
              e numero massimo per periodo.
            </p>

            {/* Rimette solo le sfide di default MANCANTI. Non sovrascrive: chi
                ha personalizzato una sfida se la tiene. Per questo non serve
                una conferma — l'azione non può distruggere nulla. */}
            <Button
              onClick={() => ripristina()}
              isDisabled={ripristinando}
              title="Rimette le sfide di default che sono state eliminate, senza toccare quelle esistenti"
            >
              {ripristinando ? 'Ripristino…' : '↺ Ripristina default'}
            </Button>
          </div>

          <ChallengesTab
            categorie={categorieChallenge}
            sfide={catalogo.sfide}
            selezionata={selezionata}
            onSeleziona={setSelezionata}
            onApriModaleSfida={apriModaleSfida}
            onElimina={(key) => azioneCatalogo('catalogoEliminaSfida', { key })}
            onModificaCategoria={(dati) => azioneCatalogo('catalogoSetCategoria', dati)}
          />
        </>
      )}

      {tab === TAB.EXTRA && (
        <>
          <p style={{ fontSize: 13, color: token('color.text.subtlest'), margin: 0 }}>
            Le categorie extra, fuori dalle challenge. <strong>Feedback</strong> assegna
            punti-aiuto al collega segnalato; <strong>Golden WorkItem</strong> è la
            configurazione del golden ticket, con la terminologia work item di Jira/JSM.
          </p>

          <ExtraTab
            categorie={categorieExtra}
            sfide={catalogo.sfide}
            selezionata={selezionataExtra}
            onSeleziona={setSelezionataExtra}
            onApriModaleSfida={apriModaleSfida}
            onElimina={(key) => azioneCatalogo('catalogoEliminaSfida', { key })}
            onModificaCategoria={(dati) => azioneCatalogo('catalogoSetCategoria', dati)}
            goldenConfig={goldenConfig}
            onSalvaGolden={salvaGolden}
          />
        </>
      )}

      {tab === TAB.SEASON && (
        <>
          <p style={{ fontSize: 13, color: token('color.text.subtlest'), margin: 0 }}>
            Le stagioni dell'organizzazione, raggruppate per anno. I trimestri di
            default vengono creati automaticamente: puoi rinominarli, modificarne
            le date o eliminarli. La timeline è unica per tutta l'organizzazione.
          </p>

          <SectionMessage appearance="information" title="Questo calendario governa i punti">
            <span style={{ fontSize: 13 }}>
              I punti della stagione confluiscono nel Legacy System Season alla fine
              dell'ultimo giorno della stagione in corso — cioè appena diventa
              "conclusa". Modificarne le date sposta quindi il momento del reset.
            </span>
          </SectionMessage>

          <SeasonsTab
            stagioni={stagioni}
            onApriModale={apriModaleStagione}
            onElimina={eliminaStagione}
          />

          <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>
            🔒 La stagione in corso non è eliminabile. Le stagioni non possono
            sovrapporsi; i giorni scoperti tra una e l'altra sono la pausa.
          </span>
        </>
      )}

      {tab === TAB.AUDIT && <AuditLogTab />}

      {tab === TAB.WORKFLOW && (
        <>
          <p style={{ fontSize: 13, color: token('color.text.subtlest'), margin: 0 }}>
            Il punto di partenza: collega WorkPlay ai tuoi progetti Jira. Scegli il
            progetto, lo stato che assegna i punti e il trigger che scatta. Senza
            almeno una regola attiva, l'app non assegna punti.
          </p>

          <WorkflowTab
            regole={regole.regole}
            trigger={regole.trigger}
            puntiWorkItem={config.puntiPerTicket}
            onApriModale={apriModaleRegola}
            onElimina={eliminaRegola}
            onSalvaTrigger={salvaTrigger}
            onEseguiTempo={eseguiDecanterOra}
          />
        </>
      )}
    </div>
  );
}

const pagina = {
  display: 'flex',
  flexDirection: 'column',
  gap: token('space.200'),
  padding: `${token('space.400')} ${token('space.500')}`,
};
