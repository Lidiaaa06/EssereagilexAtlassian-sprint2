# WorkPlay — plugin Jira di gamification (Forge)

App Forge per Jira Cloud: punti, classifiche, sfide, hall of fame e — dalla
sezione admin — la configurazione dei gruppi dell'organizzazione.

Prima di lavorarci leggi **[CLAUDE.md](CLAUDE.md)** (convenzioni e trappole del
progetto) e **[docs/HANDOFF-2026-07-18.md](docs/HANDOFF-2026-07-18.md)**
(decisioni di prodotto e stato dei lavori).

---

## 🚀 Primo setup su un TUO sito (se non sei su essereagile.atlassian.net)

Il repo è agganciato all'app Forge di essereAgile: **non puoi deployare lì**.
Per lavorarci devi creare la **TUA** app Forge e usare il **TUO** sito Atlassian.

### 1. Prerequisiti
- **Node.js 18+** e **npm**.
- **Forge CLI**: `npm install -g @forge/cli`
- Un **API token** Atlassian: creane uno su
  <https://id.atlassian.com/manage-profile/security/api-tokens>
- Un **sito Jira Cloud di sviluppo** (gratuito) dove installare l'app:
  <https://go.atlassian.com/cloud-dev>

### 2. Login con il TUO account
```bash
forge login          # inserisci la tua email Atlassian + l'API token
```

### 3. Crea la TUA app Forge — **è il cambio locale principale**
Il `manifest.yml` contiene l'`app.id` di essereAgile. Registra la tua app:
```bash
forge register       # scegli un nome, es. "WorkPlay - Mario"
```
Questo **riscrive** la riga `app: id:` nel `manifest.yml` con il TUO id.

> ⚠️ **NON pushare questo cambio**: l'`app.id` nel repo deve restare quello
> condiviso, altrimenti rompi il deploy agli altri. Subito dopo `forge register`
> blocca il file dai commit:
> ```bash
> git update-index --skip-worktree manifest.yml
> ```
> Così il tuo id resta solo in locale. Se un giorno devi modificare **davvero**
> il manifest (nuovi moduli o scope), sblocca con
> `git update-index --no-skip-worktree manifest.yml`, fai la modifica, rimetti
> l'`app.id` condiviso prima di committare, poi ri-blocca.

### 4. Dipendenze + deploy + install
```bash
npm run setup        # dipendenze root + Custom UI (static/gruppi)
npm run deploy       # compila la Custom UI e fa forge deploy -e development
forge install        # scegli il TUO sito e il prodotto "Jira"
```
Poi, per le modifiche di codice, basta `npm run deploy`. Serve
`forge install --upgrade` **solo** se cambi permessi/scope nel manifest.

### 5. (Opzionale) Ripulisci i dati specifici di essereAgile
- **`TEAM_LEGACY`** in `src/resolvers/index.js` e `src/resolvers/trigger.js`:
  è un array con 5 accountId di persone di essereAgile, usato **solo** come seed
  una-tantum se la lista membri è vuota. Sul tuo sito quegli account non esistono
  (comparirebbero come "membri fantasma"). Se non li vuoi, svuota l'array in
  **entrambi** i file: `const TEAM_LEGACY = [];`
- **`STATI_IN_LAVORAZIONE`** in `src/resolvers/trigger.js`: i nomi degli stati
  che avviano il timer antifarming, in **inglese minuscolo** (es. `in progress`).
  Se il tuo workflow usa nomi diversi, adeguali. Il **completamento** invece NON
  è hardcoded: si configura da Impostazioni → WorkPlay → **Settings → Workflow**.

### 6. Configura l'app
Da **Impostazioni Jira → App → WorkPlay → Settings → Workflow**: crea almeno una
regola (progetto + stato che assegna i punti). Senza regole, l'app non assegna
punti. Il resto (stagioni, sfide, golden) si configura dalle altre schede.

---

## ⚠️ Leggi questo prima di deployare

Questa app usa **due tecnologie diverse**, e la differenza è la causa numero uno
di tempo perso:

| Parte | Dove | Come funziona |
|---|---|---|
| Quasi tutta l'app | `src/frontend/*.jsx` | **UI Kit** (`render: native`). Forge compila da sé: modifichi e deployi. |
| Configurazione gruppi | `static/gruppi/` | **Custom UI + Atlaskit**. Va **compilata a mano** con Vite. |

Per la parte Custom UI, il manifest **non** punta ai sorgenti ma all'output di
build (`static/gruppi/dist`). Quindi:

> Se modifichi un file in `static/gruppi/src/` e lanci `forge deploy` senza
> ricompilare, Forge impacchetta la build **precedente**. Il deploy riesce, non
> compare nessun errore, e la tua modifica non c'è. È il modo più veloce per
> perdere un pomeriggio a debuggare codice mai caricato.

**La soluzione: non usare `forge deploy` a mano.** Usa gli script npm, che
compilano prima di deployare.

---

## Comandi

Prima volta (installa le dipendenze della root *e* della Custom UI):

```bash
npm run setup
```

Ciclo di lavoro normale:

```bash
npm run deploy      # compila la Custom UI, poi forge deploy -e development
npm run tunnel      # compila, poi forge tunnel -e development
```

Altro:

```bash
npm run build:gruppi   # solo la build della Custom UI
npm run lint           # eslint sul backend/UI Kit
forge lint             # validazione del manifest
npm run deploy:prod    # deploy in produzione (compila prima anche qui)
```

`static/gruppi/dist/` è in `.gitignore`: è output, non sorgente. Dopo un clone
lancia `npm run setup`, altrimenti il primo deploy fallisce — di proposito, per
non caricare in silenzio una build vecchia.

### Quando serve `forge install --upgrade`

Solo se in `manifest.yml` cambiano **permessi o scope** (`permissions`). Per le
sole modifiche al codice basta il deploy. Se cambi gli scope, l'amministratore
del sito dovrà riapprovare i permessi dell'app.

---

## Struttura

```
manifest.yml              moduli ↔ resource ↔ resolver ↔ scope ↔ trigger
src/
  resolvers/              backend: dominio + resolver (KVS via @forge/kvs)
  frontend/               UI Kit: un file per resource + *-view.jsx condivisi
static/gruppi/            Custom UI (Vite + React + Atlaskit)
  src/                    sorgenti — QUI si modifica
  dist/                   output di build — è QUESTO che Forge impacchetta
docs/                     handoff, regole design system
```

Dettaglio dell'architettura e delle convenzioni in [CLAUDE.md](CLAUDE.md).

---

## Dove finisce l'app in Jira

| Cosa | Dove |
|---|---|
| Configurazione gruppi | Impostazioni Jira → App → **WorkPlay → Settings** |
| WorkPlay Admin (storico) | **Gestisci app → WorkPlay → Configura** |
| Hub utente | Menu App → WorkPlay |
| Gadget, issue panel | Dashboard e vista issue |

Il pannello admin storico non è più nella sidebar: `jira:adminPage` ammette una
sola voce top-level, e ora la occupa la pagina nuova. Vedi l'handoff.

---

## Supporto

[Documentazione Forge](https://developer.atlassian.com/platform/forge/) ·
[Get help](https://developer.atlassian.com/platform/forge/get-help/)
