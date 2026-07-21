# WorkPlay — Contesto per Claude Code

Plugin di gamification Jira Forge (UI Kit + resolver + KVS). Team di sviluppo:
alcuni stagisti. Obiettivo a lungo termine: pubblicazione su Atlassian Marketplace.

---
## Prima di tutto
Prima di qualsiasi lavoro leggi docs/HANDOFF-2026-07-18.md (decisioni di design del 18/07).

## Come voglio che tu lavori (IMPORTANTE)

Queste regole valgono per ogni sessione. Rispettale sempre.

1. **Procedi a piccoli passi.** Un file alla volta, o una modifica logica alla
   volta. Non fare grandi cambiamenti in un colpo solo.

2. **Mostrami il diff PRIMA di applicare.** Per ogni modifica, fammi vedere cosa
   cambi e spiegami brevemente perché, poi aspetta il mio ok. Non scrivere sui
   file senza avermi mostrato prima cosa stai per fare.

3. **Fermati e chiedi quando una scelta ha conseguenze di prodotto.** Se una
   modifica implica una decisione (comportamento, dati, UX), NON deciderla da
   solo: chiedimi prima.

4. **File completi, non frammenti.** Quando mi mostri un risultato, dammi
   contesto sufficiente per capire dove va, non solo una riga isolata.

5. **Verifica prima di dire "fatto".** Dopo ogni modifica, controlla che il
   codice compili e che gli import risolvano davvero. Usa `forge lint`. Non
   dichiarare completato ciò che non hai verificato.

6. **Non assecondarmi per cortesia.** Se vedi un problema nel mio approccio o
   nel codice (mio, o di un collega), dimmelo prima di procedere. Codice
   sbagliato non diventa giusto perché l'ho chiesto io.

---

## Architettura

- `src/resolvers/` — backend (resolver Forge + moduli di dominio)
- `src/frontend/` — UI Kit (gadget dashboard, issue panel, admin page, global page)
- `manifest.yml` — moduli, resource, scope, trigger
- Storage: **Forge KVS** (`@forge/kvs`), isolato per installazione

### Vincoli KVS da rispettare SEMPRE
- **Niente `null`**: usare sentinelle (es. `'1970-1-1'` per date, `-1` per numeri
  non misurabili). Un `null` in KVS rompe.
- **Niente decimali dove il codice assume interi**: alcuni punteggi sono salvati
  moltiplicati per 10 (es. valutazioni) e divisi in lettura.
- Le chiavi di scrittura e lettura devono combaciare ESATTAMENTE tra file diversi.

---

## Moduli backend (src/resolvers/)

- `index.js` — resolver principale, orchestrazione. NON contiene più un array
  `TEAM` hardcoded: i membri sono dinamici (vedi `membri.js`).
- `membri.js` — modello membri del team in KVS (`getMembri`, `getMembro`,
  `isMembro`, `aggiungiMembro`, `rimuoviMembro`, `seedMembriSeVuoto`).
- `ruoli.js` — ruoli supervisore/operatore + guardrail anti-lockout
  (non si può rimuovere l'ultimo supervisore).
- `stagione.js` — stagioni di 2 mesi, punti, legacy, reset. Punti-per-ticket
  configurabile (`getPuntiPerTicket`/`setPuntiPerTicket`); dati per il countdown
  (`getDatiCountdownStagione`, timestamp reali in UTC).
- `sfide.js` — sfide hardcoded (giornaliere/settimanali/mensili) + `completaSfida`
  (con/senza descrizione → bonus) e `getPuntiBonus`.
- `sfide-custom.js` — sfide create dal supervisore in KVS. `getTutteLeSfide()`
  concatena hardcoded + custom: è l'UNICA fonte da usare per leggere le sfide.
- `antifarming.js` — timer In Progress, segnalazioni chiusure sospette,
  scadenza segnalazioni a 24h dall'archiviazione.
- `classifica.js` — snapshot giornaliero per il "cambio posizione".
  `applicaCambioPosizione(classifica, chiaveSnapshot)` è parametrizzata: la usano sia
  la classifica punti (`classifica-snapshot`) sia quella aiuti (`classifica-aiuto-snapshot`).
- `aiuti.js` — "segnala aiuto": pool SEPARATO dai punti stagione. Contatore
  `aiuti-<accountId>` (10 punti-aiuto ciascuno), log per-ticket `aiuti-log-<issueKey>`
  con dedup (stessa persona non ri-accredita lo stesso collega sullo stesso ticket) e
  descrizione facoltativa. `getClassificaAiuto`, `getAiutiTicket`.
- `golden-ticket.js` — golden ticket per stagione: grant di partenza + 2° mese +
  "guadagnato" oltre soglia punti. Config supervisore (`config-gt-max`,
  `config-gt-partenza`, `config-soglia-golden-ticket`). Redeem = segnala l'issue
  (label + commento, best-effort) + registra in `golden-ticket-usati`. Chiavi legate al
  NUMERO di stagione → azzeramento automatico a nuova stagione.
- `halloffame.js` — Hall of Fame CON approvazione: l'operatore richiede
  (`richiediHallOfFame` → coda `halloffame-richieste`), il supervisore approva/rifiuta.
- `trigger.js` — multi-workflow: done/resolved/closed completed = completamento
  (+punti), in progress = lavorazione. Punti letti da `getPuntiPerTicket`.
- `badges.js`, `valutazione.js`, `pensieri.js`.

## Frontend (src/frontend/)

- Gadget dashboard: `index.jsx` (profilo), `classifica.jsx`, `halloffame.jsx`,
  `pensieri.jsx` — ridotti a **gusci** che montano un componente condiviso.
- Componenti condivisi: `*-view.jsx` (`profilo-view`, `classifica-view`,
  `halloffame-view`, `pensieri-view`, `classifica-aiuti-view`, `countdown-view`).
  La logica vera vive qui.
- `workplay-hub.jsx` — global page (menu App) che monta le view. Schede attuali:
  Profilo, Classifica (punti), Classifica Aiuti, Hall of Fame, Pensieri, Fine stagione.
- `admin.jsx` — admin page: gestione membri, ruoli, badge, sfide custom,
  segnalazioni antifarming, config punti-per-ticket, config + usati golden ticket,
  richieste Hall of Fame. È il file più grande e più modificato: massima cautela.
- `panel.jsx` — issue panel: valutazione + Hall of Fame + segnala aiuto (con
  descrizione) + golden ticket (quest'ultimo FUORI dal gate "Done").
- `sfide-panel.jsx` — issue panel per completare le sfide attive; modale
  con/senza descrizione (bonus), come nel profilo.

### Regole frontend
- Solo componenti UI Kit di `@forge/react`. NON usare `<div>`, `<table>` HTML.
- I gadget sono gusci: la logica sta nei `*-view.jsx`. Se modifichi una vista,
  modifichi il `*-view.jsx`, non il guscio.
- Ogni gadget/vista ha UN solo `ForgeReconciler.render()`. I gusci renderizzano,
  i `*-view` esportano il componente e basta.
- Nel frontend, ogni `invoke('nomeResolver')` deve corrispondere a un
  `resolver.define('nomeResolver')` nel backend. Verifica sempre la corrispondenza.

---

## Sistema dei permessi (due livelli distinti, non confonderli)

- **Amministratore Jira** (`isAdminJira`, via `mypermissions`): gestione MEMBRI
  (aggiungi/rimuovi). Funziona anche a team vuoto → sblocca le installazioni nuove.
- **Supervisore** (`isSupervisore`, ruolo interno in KVS): ruoli, badge, sfide
  custom, segnalazioni.
Di norma la stessa persona è entrambi, ma sono controlli separati.

---

## Trappole ricorrenti (ci siamo già bruciati qui)

1. **Mismatch di versioni tra file.** Il problema numero uno. File presi da
   momenti diversi si importano a vicenda ma un export manca → deploy fallito.
   Dopo ogni merge, verifica che OGNI import risolva un export reale.

2. **Nomi degli stati Jira.** Il trigger confronta stringhe di stato in minuscolo
   (`done`, `in progress`, ecc). Se i workflow reali hanno nomi diversi, il
   trigger tace senza errori. Stati attuali confermati in INGLESE.

3. **`getTutteLeSfide` vs `SFIDE`.** Per leggere le sfide usa SEMPRE
   `getTutteLeSfide()`, mai `SFIDE` diretto, o le sfide custom spariscono da quel
   punto (calcolo punti, fine stagione, ecc).

4. **Sessioni multi-account nel browser.** Testare ruoli diversi richiede finestre
   in incognito separate, o le sessioni Atlassian si mescolano.

---

## Deploy

- `forge deploy -e development` per aggiornare il codice.
- `forge install --upgrade` SOLO se sono cambiati gli scope nel manifest.
- Tieni `forge logs` aperto per verificare il trigger dal vivo.

---

## Merge dai file della collega — SOLO su richiesta esplicita

In `_collega/` ci sono file/cartelle scritti da una collega su una versione
VECCHIA del progetto. Il processo di merge va eseguito **solo quando il mio
messaggio inizia con `lavoro_collega`**. Fuori da quel caso, non toccare quel flusso
e non proporre merge.

Regole del merge (valide quando attivo con `lavoro_collega`):
- I file attuali sono più avanti dei suoi (membri dinamici, sfide custom,
  antifarming, hub): **NON sostituire**, ESTRARRE solo la logica nuova e innestarla.
- Le sue versioni usano spesso hack da NON copiare (es. storage su una issue fissa,
  `TEAM` hardcoded): riscrivere su **KVS + membri dinamici**.
- Stati Jira in inglese; stati terminali negativi (canceled, closed skipped/
  incompleted) → niente punti. `ruoli.js` della collega: **NON toccarlo**.
- Un file alla volta, mostrando i diff.

---

## Lavoro fatto finora (stato del progetto)

Tutto passa `forge lint`; il grosso è stato provato dal vivo. Feature integrate:

- **Punti per ticket configurabili** + trigger multi-workflow.
- **Hall of Fame con approvazione** (richiesta operatore → approva supervisore).
- **Classifica Aiuti** (`aiuti.js` + `classifica-aiuti-view`): descrizione, lista
  per ticket, Podio, colonna "Cambio". Pool separato dai punti stagione.
- **Countdown fine stagione** (`countdown-view`, scheda hub): tick live, banner
  colorato (verde ≤7g / giallo ≤3g / rosso <24h), fase di pausa (2 giorni) gestita,
  date in UTC perché i confini stagione sono calcolati in UTC nel backend.
- **Golden ticket** (`golden-ticket.js`): grant + redeem + config supervisore +
  elenco "usati" nell'admin.
- **Sfide dal pannello issue**: modale completa con/senza descrizione (bonus).
- Tabelle classifica a larghezza piena (colonne in %).

### Punti aperti noti
- **Bonus sfida con soli spazi**: una descrizione di soli spazi dà comunque il
  bonus (in `sfide.js` manca un `trim`). Lasciato così di proposito, per ora. Se lo
  si sistema, il `trim` va messo **una sola volta** in `completaSfida` (`sfide.js`):
  copre sia il profilo sia il pannello, che usano lo stesso resolver.

---

## Prossimo obiettivo principale: separare l'admin in più pagine

`admin.jsx` è un unico file enorme con tutte le sezioni insieme. Il compito
PRINCIPALE della prossima sessione è **spezzarlo in pagine admin distinte**, una per
area. Ad esempio:
- **Personalizzazione punti** (punti-per-ticket; soglia/max/partenza golden ticket);
- **Sfide personalizzate** (crea/rimuovi sfide custom);
- **Gestione operatori/membri** (aggiungi/rimuovi membri, ruoli);
- e le altre (segnalazioni antifarming, richieste Hall of Fame, badge, golden
  ticket usati).

Vincoli: restare in UI Kit; rispettare i due livelli di permessi (admin Jira per i
membri, supervisore per il resto); ogni `invoke` deve avere il suo `resolver.define`.
**Da decidere insieme all'inizio**: più moduli `jira:adminPage` separati nel
manifest, oppure un'unica admin page con navigazione interna (come fa l'hub con
`VISTE`). Procedere a piccoli passi per non rompere le sezioni esistenti.

Nota di raggruppamento: valutare se la "personalizzazione punti" e la config/usati
del golden ticket restano **insieme** (sono affini) o su **pagine separate** — sono
comunque cose diverse.