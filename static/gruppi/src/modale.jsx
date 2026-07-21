import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@atlaskit/css-reset';
import { setGlobalTheme } from '@atlaskit/tokens';
import { invoke, view } from '@forge/bridge';
import SectionMessage from '@atlaskit/section-message';
import FormGruppo from './FormGruppo';
import FormSfida from './FormSfida';
import FormStagione from './FormStagione';
import FormRegola from './FormRegola';

// Entry point delle modali, aperta dal prodotto via Modal di @forge/bridge.
// Gira in un PROPRIO iframe, separato da quello della pagina: deve quindi
// inizializzare il tema per conto suo (vedi la nota in main.jsx).
setGlobalTheme({ colorMode: 'auto' });

// UNA sola entry per tutte le modali, non una per tipo.
//
// Ogni entry point aggiuntiva significa un input in più nella build Vite, un
// file HTML in più e una riga in più nel manifest sotto `resources.entry`.
// Discriminare sul `tipo` passato nel context costa una riga e non aggiunge
// infrastruttura: quando servirà una terza modale, si aggiunge un ramo qui.
const TIPI = { GRUPPO: 'gruppo', SFIDA: 'sfida', STAGIONE: 'stagione', REGOLA: 'regola' };

// Rete di sicurezza: senza, qualunque eccezione durante il render lascia
// l'iframe COMPLETAMENTE BIANCO e indistinguibile da "non ho ancora scritto il
// form". Non avendo accesso alla console del browser, un pannello vuoto non è
// diagnosticabile: meglio far comparire l'errore a schermo.
class Recinto extends React.Component {
  constructor(props) {
    super(props);
    this.state = { errore: null };
  }

  static getDerivedStateFromError(errore) {
    return { errore };
  }

  render() {
    if (this.state.errore) {
      return (
        <div style={{ padding: 16 }}>
          <SectionMessage appearance="error" title="La modale non si è caricata">
            {String(this.state.errore?.message || this.state.errore)}
          </SectionMessage>
        </div>
      );
    }
    return this.props.children;
  }
}

function Modale() {
  // Si parte SUBITO, senza attendere nulla: il form deve comparire anche se il
  // contesto tarda. Default gruppo/creazione, il resto si innesta appena arriva.
  const [ctx, setCtx] = useState({ tipo: TIPI.GRUPPO });
  const [avviso, setAvviso] = useState(null);

  useEffect(() => {
    let vivo = true;

    view.getContext()
      .then((c) => {
        if (vivo) setCtx(c?.extension?.modal || { tipo: TIPI.GRUPPO });
      })
      .catch((e) => {
        if (vivo) {
          setAvviso(`Contesto non disponibile (${e?.message || e}): la modale funziona solo in creazione.`);
        }
      });

    return () => { vivo = false; };
  }, []);

  // La scrittura la fa la modale, non la pagina: così l'errore di validazione
  // resta visibile QUI, accanto ai campi da correggere.
  const chiudiConEsito = (res) => {
    if (res.errore) throw new Error(res.errore);
    view.close({ ricarica: true, scartati: res.scartati || [] });
  };

  const confermaGruppo = ({ nome, teamLeaderId, developers }) => {
    const chiamata = ctx.gruppo
      ? invoke('rinominaGruppoAdmin', { gruppoId: ctx.gruppo.id, nome })
      : invoke('creaGruppoCompletoAdmin', { nome, teamLeaderId, developers });
    return chiamata.then(chiudiConEsito);
  };

  const confermaSfida = ({ nome, emoji, descrizione, punti }) => {
    const chiamata = ctx.sfida
      ? invoke('catalogoModificaSfida', { key: ctx.sfida.key, nome, emoji, descrizione, punti })
      : invoke('catalogoAggiungiSfida', { tipo: ctx.categoria.tipo, nome, emoji, descrizione, punti });
    return chiamata.then(chiudiConEsito);
  };

  const confermaStagione = ({ nome, inizioMs, fineMs }) => {
    const chiamata = ctx.stagione
      ? invoke('stagioniModifica', { id: ctx.stagione.id, nome, inizioMs, fineMs })
      : invoke('stagioniCrea', { nome, inizioMs, fineMs });
    return chiamata.then(chiudiConEsito);
  };

  // Eliminazione di una stagione conclusa, dalla modale in sola lettura.
  const eliminaStagione = () =>
    invoke('stagioniElimina', { id: ctx.stagione.id }).then(chiudiConEsito);

  const confermaRegola = (dati) => {
    const chiamata = ctx.regola
      ? invoke('workflowRegolaModifica', { id: ctx.regola.id, ...dati })
      : invoke('workflowRegolaCrea', dati);
    return chiamata.then(chiudiConEsito);
  };

  const renderForm = () => {
    if (ctx.tipo === TIPI.REGOLA) {
      return (
        <FormRegola
          key={ctx.regola ? ctx.regola.id : `nuova-${ctx.famiglia || 'evento'}-${ctx.progettoPreset ? ctx.progettoPreset.key : 'x'}`}
          regola={ctx.regola}
          progettoPreset={ctx.progettoPreset}
          famiglia={ctx.famiglia}
          puntiWorkItem={ctx.puntiWorkItem}
          onConferma={confermaRegola}
          onAnnulla={() => view.close()}
        />
      );
    }
    if (ctx.tipo === TIPI.SFIDA) {
      return (
        <FormSfida
          key={ctx.sfida ? ctx.sfida.key : `nuova-${ctx.categoria?.tipo}`}
          categoria={ctx.categoria}
          sfida={ctx.sfida}
          onConferma={confermaSfida}
          onAnnulla={() => view.close()}
        />
      );
    }
    if (ctx.tipo === TIPI.STAGIONE) {
      return (
        <FormStagione
          key={ctx.stagione ? ctx.stagione.id : 'nuova'}
          stagione={ctx.stagione}
          soloLettura={Boolean(ctx.soloLettura)}
          onConferma={confermaStagione}
          onElimina={eliminaStagione}
          onAnnulla={() => view.close()}
        />
      );
    }
    return (
      <FormGruppo
        key={ctx.gruppo ? ctx.gruppo.id : 'nuovo'}
        gruppo={ctx.gruppo}
        onConferma={confermaGruppo}
        onAnnulla={() => view.close()}
      />
    );
  };

  return (
    <div style={{ padding: 16 }}>
      {avviso && (
        <div style={{ marginBottom: 16 }}>
          <SectionMessage appearance="warning">{avviso}</SectionMessage>
        </div>
      )}

      {renderForm()}
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Recinto>
      <Modale />
    </Recinto>
  </React.StrictMode>
);
