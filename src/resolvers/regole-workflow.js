import { kvs } from '@forge/kvs';
import { parseDurata } from './durata';

// Regole di monitoraggio (scheda admin "Workflow"). Frame Figma 81:2.
//
// Una regola dice: "in QUESTO progetto, per QUESTO issue type, quando un work
// item entra in QUESTO stato, scatta QUESTO trigger". È ciò che il trigger.js
// consulta per decidere se assegnare punti. Prima del 19/07 (4ª parte) gli stati
// di completamento erano hardcoded e uguali per tutti; ora sono per-progetto e
// per-issue-type.
//
// Perché l'issue type: in Jira uno Space ha più issue type, ognuno associato a
// un workflow, e ogni workflow ha i suoi stati. Intercettare (progetto, issue
// type, stato) è quindi il livello giusto — ed è gratis: l'endpoint
// /project/{key}/statuses restituisce gli stati GIÀ raggruppati per issue type,
// col solo read:jira-work (niente manage:jira-configuration).
//
// ⚠️ Regole-only, senza seed (scelta 19/07): se non c'è nessuna regola, l'app
// NON assegna punti. Sulla vostra installazione i punti si fermano finché
// l'admin non crea almeno una regola.
//
// Forma di una regola:
//   { id, progettoKey, progettoNome, issueTypeId, issueTypeNome,
//     stati: [{ id, nome }], trigger: 'workitem-completato' }
// Gli stati sono PIÙ D'UNO: una regola può considerare completamento l'ingresso
// in uno qualsiasi di essi (es. WON *o* LOST). I punti NON stanno sulla regola:
// derivano dal trigger (oggi uno solo, 'workitem-completato', il cui punteggio è
// config-punti-per-ticket). Così non esistono due posti che definiscono lo
// stesso valore.
//
// Retro-compatibilità:
//   - regole senza `issueTypeId` (pre-issue-type) → valgono per QUALSIASI issue
//     type (wildcard);
//   - regole con `statoId`/`statoNome` singolo (pre-multiselezione) → lette come
//     un array di un solo stato, via `statiDi`.
// Così i punti non si fermano finché l'admin non le riconfigura.

// Stati di una regola, normalizzati ad array {id, nome}: gestisce sia la forma
// nuova (`stati: []`) sia quella vecchia a stato singolo (`statoId/statoNome`).
export const statiDi = (r) =>
  Array.isArray(r.stati)
    ? r.stati
    : (r.statoId ? [{ id: String(r.statoId), nome: r.statoNome || '' }] : []);

const CHIAVE = 'regole-workflow';
const CHIAVE_SEQ = 'regole-workflow-seq';

// Due FAMIGLIE di trigger:
//   - 'evento': scatta su un evento Jira (avi:jira:updated:issue). È il trigger
//     gestito da trigger.js in tempo reale.
//   - 'tempo': matura nel silenzio (nessun evento). La gestisce lo scheduled
//     trigger (decanter.js), che gira periodicamente e misura il tempo-in-stato.
// `haSoglia: true` → la regola porta anche una soglia in giorni (proprietà extra).
export const TRIGGER = {
  'workitem-completato': {
    key: 'workitem-completato',
    nome: 'WorkItem Completato',
    descrizione: "Assegna punti all'assegnatario quando il work item entra in uno degli stati monitorati dalla regola.",
    famiglia: 'evento',
  },
  'workitem-decanter': {
    key: 'workitem-decanter',
    nome: 'Work Item Decanter',
    descrizione: 'Nessun punto tolto: quando un work item resta in uno stato oltre la soglia di giorni, segnala al Team Leader e commenta il work item avvisando l\'assegnatario.',
    famiglia: 'tempo',
    haSoglia: true,
  },
};

// Famiglia di una regola, con default per le regole vecchie (tutte a evento).
export const famigliaDi = (r) =>
  r.famiglia || (TRIGGER[r.trigger]?.famiglia) || 'evento';

// Personalizzazioni admin del catalogo trigger (nome/descrizione). La CHIAVE del
// trigger resta quella di default — la usano trigger.js/decanter.js per il match:
// l'admin cambia solo COME il trigger si presenta, non cosa fa.
const CHIAVE_TRIGGER_OVERRIDE = 'trigger-override';

export const getTriggerCatalogo = async () => {
  const override = await kvs.get(CHIAVE_TRIGGER_OVERRIDE) || {};
  return Object.values(TRIGGER).map((t) => {
    const o = override[t.key] || {};
    return {
      ...t,
      nome: o.nome ? o.nome : t.nome,
      descrizione: o.descrizione ? o.descrizione : t.descrizione,
      personalizzato: Boolean(o.nome || o.descrizione),
    };
  });
};

export const modificaTrigger = async (key, { nome, descrizione }) => {
  if (!TRIGGER[key]) return { errore: 'Trigger non valido.' };
  const nomePulito = String(nome ?? '').trim();
  if (nomePulito === '') return { errore: 'Il nome del trigger è obbligatorio.' };

  const override = await kvs.get(CHIAVE_TRIGGER_OVERRIDE) || {};
  override[key] = { nome: nomePulito, descrizione: String(descrizione ?? '').trim() };
  await kvs.set(CHIAVE_TRIGGER_OVERRIDE, override);
  return { successo: true, trigger: await getTriggerCatalogo() };
};

const prossimoId = async (regole) => {
  const numeri = regole
    .map((r) => parseInt(String(r.id).replace('r', ''), 10))
    .filter((n) => Number.isInteger(n));
  const daElenco = numeri.length > 0 ? Math.max(...numeri) : 0;
  const salvato = await kvs.get(CHIAVE_SEQ);
  const prossimo = Math.max(Number.isInteger(salvato) ? salvato : 0, daElenco) + 1;
  await kvs.set(CHIAVE_SEQ, prossimo);
  return `r${prossimo}`;
};

export const getRegole = async () => {
  return await kvs.get(CHIAVE) || [];
};

// Normalizza un elenco di stati in arrivo dal frontend: {id, nome} validi, id
// come stringa, senza duplicati.
const pulisciStati = (stati) => {
  const visti = new Set();
  return (Array.isArray(stati) ? stati : [])
    .filter((s) => s && s.id)
    .map((s) => ({ id: String(s.id), nome: s.nome || '' }))
    .filter((s) => (visti.has(s.id) ? false : (visti.add(s.id), true)));
};

// Stati già coperti da ALTRE regole dello STESSO (progetto, issue type, trigger).
// Scoped per trigger: una regola di completamento e una di decanter possono
// osservare lo stesso stato (sono cose diverse); due regole con lo stesso trigger
// no, altrimenti l'effetto scatterebbe due volte.
const statiGiaCoperti = (regole, progettoKey, issueTypeId, trigger, escludiId) => {
  const coperti = new Map();
  regole.forEach((r) => {
    if (r.id === escludiId) return;
    if (r.progettoKey !== progettoKey) return;
    if (String(r.issueTypeId) !== String(issueTypeId)) return;
    if (r.trigger !== trigger) return;
    statiDi(r).forEach((s) => coperti.set(String(s.id), s.nome));
  });
  return coperti;
};

// Regole di una famiglia, con default 'evento' per le regole vecchie.
export const getRegoleFamiglia = async (famiglia) => {
  const regole = await getRegole();
  return regole.filter((r) => famigliaDi(r) === famiglia);
};

// Usata dal TRIGGER a evento: la regola di COMPLETAMENTO che monitora (progetto,
// issue type, stato). Solo famiglia 'evento' (trigger 'workitem-completato'):
// gli stati sorvegliati dal decanter (famiglia 'tempo') NON sono completamenti.
// Match per ID (di stato e issue type). La regola copre lo stato se è tra i suoi
// `stati`. Una regola SENZA issueTypeId vale per qualsiasi issue type.
export const trovaRegola = async (progettoKey, issueTypeId, statoId) => {
  const regole = await getRegole();
  return regole.find(
    (r) =>
      r.trigger === 'workitem-completato' &&
      r.progettoKey === progettoKey &&
      (!r.issueTypeId || String(r.issueTypeId) === String(issueTypeId)) &&
      statiDi(r).some((s) => String(s.id) === String(statoId))
  );
};

// Valida trigger + soglia. La soglia ora è una DURATA in stile Jira (es. "3h",
// "2d", "1w 2d"); la parsiamo in MINUTI. Restituisce { trigger, sogliaMinuti,
// sogliaTesto } (per i trigger con soglia) o { errore }.
const validaTriggerSoglia = (trigger, sogliaTesto) => {
  const def = TRIGGER[trigger];
  if (!def) return { errore: 'Trigger non valido.' };
  if (def.haSoglia) {
    const minuti = parseDurata(sogliaTesto);
    if (minuti === null || minuti < 1) {
      return { errore: 'La soglia deve essere una durata valida (es. 3h, 2d, 1w 2d).' };
    }
    return { trigger, sogliaMinuti: minuti, sogliaTesto: String(sogliaTesto).trim() };
  }
  return { trigger };
};

export const aggiungiRegola = async ({
  progettoKey, progettoNome, issueTypeId, issueTypeNome, stati, trigger, sogliaTesto, ripetiOgniGiro,
}) => {
  if (!progettoKey) return { errore: 'Scegli un progetto.' };
  if (!issueTypeId) return { errore: 'Scegli un issue type.' };
  const statiPuliti = pulisciStati(stati);
  if (statiPuliti.length === 0) return { errore: 'Scegli almeno uno stato.' };

  const ts = validaTriggerSoglia(trigger, sogliaTesto);
  if (ts.errore) return ts;

  const regole = await getRegole();

  // Nessuno stato coperto due volte per lo stesso (progetto, issue type, trigger).
  const coperti = statiGiaCoperti(regole, progettoKey, issueTypeId, trigger, null);
  const conflitto = statiPuliti.find((s) => coperti.has(s.id));
  if (conflitto) {
    return { errore: `Lo stato "${conflitto.nome || conflitto.id}" è già coperto da un'altra regola dello stesso trigger per questo issue type.` };
  }

  const nuova = {
    id: await prossimoId(regole),
    famiglia: TRIGGER[trigger].famiglia,
    progettoKey,
    progettoNome: progettoNome || progettoKey,
    issueTypeId: String(issueTypeId),
    issueTypeNome: issueTypeNome || '',
    stati: statiPuliti,
    trigger,
    // ripetiOgniGiro (solo trigger a soglia): ON = azioni ad ogni scansione;
    // OFF = azioni una volta per soggiorno (l'audit traccia comunque sempre).
    ...(ts.sogliaMinuti !== undefined
      ? { sogliaMinuti: ts.sogliaMinuti, sogliaTesto: ts.sogliaTesto, ripetiOgniGiro: Boolean(ripetiOgniGiro) }
      : {}),
  };

  const aggiornate = [...regole, nuova];
  await kvs.set(CHIAVE, aggiornate);
  return { successo: true, regola: nuova, regole: aggiornate };
};

export const modificaRegola = async (id, dati) => {
  const regole = await getRegole();
  const regola = regole.find((r) => r.id === id);
  if (!regola) return { errore: 'Regola non trovata.' };

  const progettoKey = dati.progettoKey || regola.progettoKey;
  const issueTypeId = String(dati.issueTypeId || regola.issueTypeId || '');
  if (!issueTypeId) return { errore: 'Scegli un issue type.' };

  // Il trigger (e quindi la famiglia) NON cambia in modifica: la modale è già
  // specifica per famiglia. Si tiene quello della regola.
  const trigger = TRIGGER[regola.trigger] ? regola.trigger : 'workitem-completato';

  const statiPuliti = dati.stati !== undefined ? pulisciStati(dati.stati) : statiDi(regola);
  if (statiPuliti.length === 0) return { errore: 'Scegli almeno uno stato.' };

  // Soglia (durata): dal payload, oppure da quella esistente. Le regole legacy
  // hanno solo sogliaGiorni (intero): la riconvertiamo in testo "Ng".
  const sogliaEsistente = regola.sogliaTesto || (regola.sogliaGiorni ? `${regola.sogliaGiorni}d` : undefined);
  const ts = validaTriggerSoglia(
    trigger,
    dati.sogliaTesto !== undefined ? dati.sogliaTesto : sogliaEsistente
  );
  if (ts.errore) return ts;

  const coperti = statiGiaCoperti(regole, progettoKey, issueTypeId, trigger, id);
  const conflitto = statiPuliti.find((s) => coperti.has(s.id));
  if (conflitto) {
    return { errore: `Lo stato "${conflitto.nome || conflitto.id}" è già coperto da un'altra regola dello stesso trigger per questo issue type.` };
  }

  const aggiornate = regole.map((r) => {
    if (r.id !== id) return r;
    // Ricostruisco senza i campi vecchi statoId/statoNome e senza il legacy
    // sogliaGiorni (rimpiazzato da sogliaMinuti+sogliaTesto): adotta la forma nuova.
    const { statoId, statoNome, sogliaGiorni, ...resto } = r;
    return {
      ...resto,
      famiglia: TRIGGER[trigger].famiglia,
      progettoKey,
      progettoNome: dati.progettoNome ?? r.progettoNome,
      issueTypeId,
      issueTypeNome: dati.issueTypeNome ?? r.issueTypeNome ?? '',
      stati: statiPuliti,
      trigger,
      ...(ts.sogliaMinuti !== undefined
        ? {
            sogliaMinuti: ts.sogliaMinuti,
            sogliaTesto: ts.sogliaTesto,
            ripetiOgniGiro: Boolean(dati.ripetiOgniGiro !== undefined ? dati.ripetiOgniGiro : r.ripetiOgniGiro),
          }
        : {}),
    };
  });

  await kvs.set(CHIAVE, aggiornate);
  return { successo: true, regole: aggiornate };
};

export const eliminaRegola = async (id) => {
  const regole = await getRegole();
  if (!regole.some((r) => r.id === id)) return { errore: 'Regola non trovata.' };
  const aggiornate = regole.filter((r) => r.id !== id);
  await kvs.set(CHIAVE, aggiornate);
  return { successo: true, regole: aggiornate };
};
