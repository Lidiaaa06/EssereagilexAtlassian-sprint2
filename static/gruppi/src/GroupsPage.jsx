import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke, Modal } from '@forge/bridge';
import Button from '@atlaskit/button/new';
import Spinner from '@atlaskit/spinner';
import SectionMessage from '@atlaskit/section-message';
import { token } from '@atlaskit/tokens';
import TreeView from './TreeView';
import DettaglioGruppo from './DettaglioGruppo';

// Subpage "Groups": l'organigramma. Montata da App.jsx sulla rotta /groups.
//
// La navigazione a sinistra NON è ricostruita qui: la genera Jira da sé a
// partire dalle `pages` dichiarate nel manifest.
export default function GroupsPage() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [avviso, setAvviso] = useState(null);
  const [selezionato, setSelezionato] = useState(null);

  const carica = useCallback(() => {
    return invoke('getGruppiAdmin')
      .then((res) => {
        if (res.errore) {
          setErrore(res.errore);
          return;
        }
        setErrore(null);
        setDati(res);
      })
      .catch(() => setErrore('Impossibile caricare i gruppi. Ricarica la pagina.'));
  }, []);

  useEffect(() => { carica(); }, [carica]);

  // Ogni scrittura restituisce già l'albero aggiornato: lo usiamo invece di
  // rifare una getGruppiAdmin, così la UI non fa due giri per ogni azione.
  const applica = (res) => {
    if (res.errore) {
      setAvviso({ tipo: 'error', testo: res.errore });
      return;
    }
    setAvviso(null);
    setDati((precedenti) => ({
      ...precedenti,
      albero: res.albero,
      // I nomi vanno aggiornati INSIEME all'albero: tenendo il dizionario
      // vecchio, la persona appena aggiunta resterebbe un accountId grezzo
      // fino al reload. Il fallback copre le risposte che non lo includono.
      persone: res.persone || precedenti.persone,
    }));
  };

  const azione = (nome, payload) =>
    invoke(nome, payload)
      .then(applica)
      .catch(() => setAvviso({ tipo: 'error', testo: 'Errore imprevisto. Riprova.' }));

  // Eliminazione: il padre va letto PRIMA della chiamata, perché dopo il
  // gruppo non esiste più nell'albero e l'indice `padri` non lo conosce.
  // Si risale di un livello invece di svuotare la selezione: eliminando le
  // foglie una a una si sta lavorando proprio lì, sul ramo che si sta potando.
  const eliminaGruppo = (gruppoId) => {
    const padre = padri[gruppoId];

    return invoke('eliminaGruppoAdmin', { gruppoId })
      .then((res) => {
        applica(res);
        if (!res.errore) setSelezionato(padre ? padre.id : null);
      })
      .catch(() => setAvviso({ tipo: 'error', testo: 'Errore imprevisto. Riprova.' }));
  };

  // Apre la modale FUORI dall'iframe, chiedendola al prodotto.
  //
  // Una modale Atlaskit renderizzata qui dentro resterebbe confinata all'iframe
  // della Custom UI e non coprirebbe la pagina Jira: è un limite del browser,
  // non di CSS. Il Modal di @forge/bridge la fa aprire a Jira, sopra tutto.
  //
  // `gruppo` assente = creazione. La scrittura la esegue la modale stessa e ci
  // restituisce l'esito nell'onClose.
  const apriModale = (gruppo = null) => {
    new Modal({
      resource: 'gruppi-resource/modale',
      size: 'medium',
      title: gruppo ? 'Modifica gruppo' : 'Crea gruppo',
      context: { gruppo },
      onClose: (esito) => {
        // Chiusa con Annulla o con la ✕ del prodotto: niente da fare.
        if (!esito || !esito.ricarica) return;

        carica();
        // Gli scartati non sono un fallimento: il gruppo è nato, ma l'admin
        // deve sapere chi è rimasto fuori e perché.
        if (esito.scartati && esito.scartati.length > 0) {
          setAvviso({
            tipo: 'error',
            testo: `Gruppo creato. Non aggiunti: ${esito.scartati
              .map((s) => `${s.nome || s.accountId} (${s.motivo})`)
              .join(' · ')}`,
          });
        }
      },
    }).open();
  };

  // Indici derivati dall'albero: servono al pannello di dettaglio per sapere
  // chi guida cosa (lucchetto) e a chi riporta un gruppo.
  const { piatti, gruppiPerTeamLeader, padri } = useMemo(() => {
    const piatti = {};
    const gruppiPerTeamLeader = {};
    const padri = {};

    const visita = (gruppo, padre) => {
      piatti[gruppo.id] = gruppo;
      gruppiPerTeamLeader[gruppo.teamLeaderId] = gruppo;
      if (padre) padri[gruppo.id] = padre;
      gruppo.figli.forEach((figlio) => visita(figlio, gruppo));
    };

    (dati?.albero || []).forEach((radice) => visita(radice, null));
    return { piatti, gruppiPerTeamLeader, padri };
  }, [dati]);

  if (errore) {
    return (
      <div style={pagina}>
        <SectionMessage appearance="error" title="Accesso non riuscito">
          {errore}
        </SectionMessage>
      </div>
    );
  }

  if (!dati) {
    return (
      <div style={{ ...pagina, alignItems: 'center' }}>
        <Spinner size="large" />
      </div>
    );
  }

  const selezione = piatti[selezionato] || null;

  return (
    <div style={pagina}>
      <span style={{ fontSize: 12, color: token('color.text.subtlest') }}>
        Impostazioni Jira › App › WorkPlay
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: token('space.200') }}>
        <h1 style={{ fontSize: 24, margin: 0, color: token('color.text') }}>
          Configurazione gruppi
        </h1>
        <span style={{ flex: 1 }} />
        <Button appearance="primary" onClick={() => apriModale()}>
          + Crea gruppo
        </Button>
      </div>

      <p style={{ fontSize: 13, color: token('color.text.subtlest'), margin: 0 }}>
        La struttura dell'organizzazione. Aggiungi developers direttamente
        nell'albero: erediteranno gruppo e Team Leader. "+ Crea gruppo" apre il
        data entry completo per censire un nuovo team.
      </p>

      {avviso && (
        <SectionMessage appearance={avviso.tipo === 'error' ? 'error' : 'success'}>
          {avviso.testo}
        </SectionMessage>
      )}

      <div style={{ display: 'flex', gap: token('space.250'), alignItems: 'flex-start' }}>
        <TreeView
          albero={dati.albero}
          persone={dati.persone}
          organizzazione={dati.organizzazione}
          selezionato={selezionato}
          onSeleziona={setSelezionato}
          onAggiungiDeveloper={(gruppoId, accountId) =>
            azione('aggiungiDeveloperAdmin', { gruppoId, accountId })
          }
          onRimuoviDeveloper={(gruppoId, accountId) =>
            azione('rimuoviDeveloperAdmin', { gruppoId, accountId })
          }
          onModifica={(gruppo) => apriModale(gruppo)}
          onCreaRadice={() => apriModale()}
          onRinominaOrganizzazione={(nome) =>
            invoke('setOrganizzazioneAdmin', { nome })
              .then((res) => {
                if (res.errore) {
                  setAvviso({ tipo: 'error', testo: res.errore });
                  return;
                }
                // Risposta mirata: qui non cambia l'albero, solo l'etichetta
                // della radice. Non serve rileggere tutto.
                setAvviso(null);
                setDati((p) => ({ ...p, organizzazione: res.organizzazione }));
              })
              .catch(() =>
                setAvviso({ tipo: 'error', testo: 'Errore imprevisto. Riprova.' })
              )
          }
        />

        <DettaglioGruppo
          gruppo={selezione}
          persone={dati.persone}
          gruppoPadre={selezione ? padri[selezione.id] : null}
          gruppiPerTeamLeader={gruppiPerTeamLeader}
          onModifica={(gruppo) => apriModale(gruppo)}
          onElimina={eliminaGruppo}
          onAggiungiDeveloper={(gruppoId, accountId) =>
            azione('aggiungiDeveloperAdmin', { gruppoId, accountId })
          }
          onRimuoviDeveloper={(gruppoId, accountId) =>
            azione('rimuoviDeveloperAdmin', { gruppoId, accountId })
          }
        />
      </div>

    </div>
  );
}

const pagina = {
  display: 'flex',
  flexDirection: 'column',
  gap: token('space.200'),
  padding: `${token('space.400')} ${token('space.500')}`,
};
