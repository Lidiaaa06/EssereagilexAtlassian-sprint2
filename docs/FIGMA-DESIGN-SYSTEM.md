# Figma → Code Rules (Design System)

Rules for translating Figma designs into this codebase via the Figma MCP.
Read this **before** implementing any Figma frame. It overrides generic
design-to-code habits, because this project does **not** use HTML/CSS.

> ⚠️ **ECCEZIONE (19/07/2026) — `static/gruppi/`.** Tutto ciò che segue vale per
> i moduli UI Kit, che restano la regola. **Una** pagina fa eccezione:
> *Configurazione gruppi* (`jira:adminPage` top-level) è **Custom UI + Atlaskit**,
> con build Vite propria in `static/gruppi/`. Non è una preferenza estetica: le
> subpage `sections`/`pages` della sidebar admin **non supportano UI Kit**, e la
> tree master-detail del Figma non è esprimibile con i componenti `@forge/react`.
> Dentro `static/gruppi/` valgono le regole opposte: react-dom vero, `@atlaskit/*`
> importati direttamente, `style={{...}}` con `token()` da `@atlaskit/tokens`.
> Prima di aggiungere altre pagine Custom UI, parlane: la regola resta UI Kit.
>
> TL;DR — This is an **Atlassian Forge UI Kit** app (`render: native`). The UI
> is **Atlassian Design System (ADS / Atlaskit)** rendered natively by Atlassian.
> You cannot emit `<div>`, CSS, `px`, or `#hex`. You compose `@forge/react`
> components and pass **ADS token strings** (`space.200`, `color.text.inverse`).
> Map every Figma layer to an ADS component + token — never to raw CSS.

---

## 0. The single most important rule

**Figma layers do not become DOM + CSS. They become `@forge/react` components.**

| In Figma you see… | You must NOT write… | You MUST write… |
|---|---|---|
| A frame with auto-layout, vertical | `<div style="display:flex">` | `<Stack space="space.100">` |
| A frame, horizontal auto-layout | `<div style="display:flex;flex-direction:row">` | `<Inline space="space.100">` |
| A box with padding/background | `<div style="padding:16px;background:#eee">` | `<Box padding="space.200" backgroundColor="color.background.neutral">` |
| Text | `<p style="font-weight:700">` | `<Text font={{ weight: 'bold' }}>` |
| A heading | `<h2>` | `<Heading as="h2">` (or size prop) |
| A colored status pill | `<span class="badge">` | `<Lozenge appearance="success">` |
| A button | `<button style=...>` | `<Button appearance="primary">` |
| 16px gap / #0052CC | `gap:16px` / `#0052CC` | `space.200` / a `color.*` token |

If a Figma layer has no ADS equivalent, **stop and ask** — do not hand-roll it
with `xcss` hacks.

---

## 1. Token Definitions

- **There is no local token file.** Tokens are **not** defined in this repo.
  They are the **Atlassian Design System tokens**, shipped inside `@forge/react`
  and referenced by their **string name**.
- **Format:** dot-namespaced string identifiers passed as props — never raw
  values. Categories seen in this codebase:
  - Spacing: `space.0`, `space.050`, `space.100`, `space.150`, `space.200`,
    `space.300`, `space.400` (used ~140×)
  - Color (text): `color.text`, `color.text.inverse`
  - Color (background): `color.background.neutral`, `color.background.neutral.bold`,
    `color.background.accent.{blue|gray|orange|yellow|red}.{subtlest|subtler}`
  - Typography: `font={{ weight: 'bold' }}`, `size="small"` on `<Text>`
- **Transformation system:** none in-repo. The Forge platform + ADS resolve
  token names → light/dark themed values at render time. **Do not** compute or
  hardcode the underlying hex/px.
- **Figma mapping:** The ADS Figma library exposes these same tokens as **Figma
  Variables**. When `get_variable_defs` / `get_design_context` returns a variable
  like `Background/accent/blue/subtlest`, translate it to the token string
  `color.background.accent.blue.subtlest`. **Preserve the semantic token; never
  inline the resolved hex** the MCP may also return.
- **Spacing conversion:** ADS space tokens are an 8px-ish scale — `space.100 ≈ 8px`,
  `space.200 ≈ 16px`, `space.050 ≈ 4px`, `space.300 ≈ 24px`, `space.400 ≈ 32px`.
  Convert a Figma px gap to the **nearest** token; do not introduce off-scale
  values. If a design needs a gap with no token, flag it.

```jsx
// ✅ Canonical pattern (src/frontend/classifica-view.jsx)
<Box padding="space.200" backgroundColor="color.background.accent.blue.subtlest">
  <Stack space="space.100" alignInline="center">
    <Text font={{ weight: 'bold' }}>Classifica Team</Text>
  </Stack>
</Box>
```

---

## 2. Component Library

- **Source:** `@forge/react` (v12, UI Kit). This wraps the Atlassian Design
  System. **All UI must be built from these components** — there is no local
  component library and no design-system package to extend.
- **Components actually in use here** (your default vocabulary):
  `Box, Stack, Inline` (layout) · `Text, Heading` (typography) ·
  `Button` (actions) · `Lozenge` (status) · `Modal, ModalHeader, ModalTitle,
  ModalBody, ModalFooter` (dialogs) · `TextArea, Select, RadioGroup, Toggle`
  (forms) · `ProgressBar` · `Tooltip` · `SectionMessage` (inline notices).
- **Architecture:** function components + React hooks. Data flows via
  `invoke()` from `@forge/bridge` to Forge resolvers (`src/resolvers/`). Keep
  presentational `*-view.jsx` components separate from data fetching where the
  existing code does.
- **Documentation / Storybook:** none in-repo. The canonical reference is the
  **Atlassian Design System docs** and the **UI Kit components** page. Before
  using a component, confirm it exists in `@forge/react` — the UI Kit surface is
  a **subset** of full Atlaskit. If a Figma design references an ADS component
  not exported by `@forge/react`, it cannot be used as-is — ask before
  substituting.

---

## 3. Frameworks & Libraries

- **UI framework:** React 18, but rendered through **`ForgeReconciler`**
  (`render: native` in `manifest.yml`) — **not** `react-dom`. No DOM, no
  browser APIs, no `window`. (Confirmed: repo has zero `react-dom` imports.)
- **Styling library:** none. No CSS, CSS Modules, styled-components, Emotion,
  Tailwind, or Sass anywhere in the repo (verified: 0 stylesheet files).
  Styling = component props + `xcss` (see §6).
- **Build system / bundler:** the **Forge CLI** (`forge deploy`, `forge lint`).
  Webpack runs under the hood — **there is no bundler config to touch** and no
  `vite`/`webpack` file to add. Do not introduce one.
- **Entry points:** each UI is a resource in `manifest.yml` mapping to a
  `src/frontend/*.jsx` file that calls `ForgeReconciler.render(...)`.

```jsx
// src/frontend/index.jsx — canonical UI Kit entry
import ForgeReconciler from '@forge/react';
import { ProfiloView } from './profilo-view';
ForgeReconciler.render(<React.StrictMode><ProfiloView /></React.StrictMode>);
```

---

## 4. Asset Management

- **No asset pipeline.** There is no `static/` dir, no image imports, no
  optimizer, no CDN in this repo.
- Where images/icons are needed by the platform (e.g. gadget `thumbnail`,
  panel `icon` in `manifest.yml`), they are referenced as **absolute HTTPS
  URLs** (e.g. Atlassian-hosted `developer.atlassian.com/.../icons/*.svg`).
- **Figma implication:** do **not** export PNG/JPG/SVG assets from a Figma frame
  into this repo expecting a bundler to pick them up. If a design truly needs a
  raster/vector asset, it must be hosted (URL) or the feature needs **Custom UI**
  (a different Forge module type) — that is a product decision: **ask first**.
- Prefer representing decorative/graphic elements with ADS primitives
  (colored `Box`, `Lozenge`, `Icon`) instead of importing image assets.

---

## 5. Icon System

- **No local icons.** Icons come from the Atlassian icon set via UI Kit
  (`Icon` from `@forge/react`, when needed) — not from files in this repo.
- **Naming:** use ADS icon names (kebab/glyph names from the ADS icon catalog),
  not custom filenames. There is no icon-naming convention to invent here.
- **Current state:** this codebase mostly avoids icons, using text glyphs
  instead (e.g. `'1°'`, `'#'` in `classifica-view.jsx`). Match that restraint
  unless the Figma design clearly calls for an ADS icon.
- **Figma mapping:** if a Figma frame uses ADS library icons, map to the
  matching `@forge/react` `Icon` glyph. If it uses a **custom** icon, it has no
  home in UI Kit — flag it (see §4).

---

## 6. Styling Approach

- **Methodology:** utility props + the constrained **`xcss`** prop. No CSS
  files, no global stylesheet, no theme provider to configure — ADS theming
  (incl. dark mode) is automatic via tokens.
- **`xcss` is a whitelisted, token-constrained subset** — it is *not* free-form
  CSS. Rules:
  - Only use it for what component props can't express (widths, simple sizing).
    Existing usage is almost entirely `xcss={{ width: 'NN%' }}` /
    `xcss={{ width: 'NNpx' }}` for table-like column layouts.
  - **Prefer tokens** for spacing/color even inside `xcss`; do not reach for raw
    values when a token exists.
  - Never treat `xcss` as an escape hatch to reproduce arbitrary Figma CSS.
- **Layout = primitives, not CSS:** `Stack` (vertical), `Inline` (horizontal),
  `Box` (padding/background/sizing). Gaps come from the `space` prop, alignment
  from `alignInline` / `alignBlock`.
- **Responsive design:** there is **no breakpoint/media-query system**. UI Kit
  gadgets/panels are rendered inside fixed Atlassian containers (dashboard
  gadget, issue panel, admin/global page). Use **percentage widths** and the
  flow of `Stack`/`Inline` for fluid layout. A Figma design with pixel-perfect
  responsive breakpoints must be **adapted**, not literally reproduced — the
  target is a resizable Atlassian frame, not a viewport.

```jsx
// ✅ Column layout via Inline + Box widths (the repo's table idiom)
<Inline space="space.0" alignBlock="center" xcss={{ width: '100%' }}>
  <Box xcss={{ width: '8%' }}><Text font={{ weight: 'bold' }}>Pos.</Text></Box>
  <Box xcss={{ width: '30%' }}><Text font={{ weight: 'bold' }}>Nome</Text></Box>
</Inline>
```

---

## 7. Project Structure

```
manifest.yml            # modules ↔ resources ↔ resolver ↔ scopes ↔ triggers
src/
  index.js              # resolver/backend entry (handler wiring)
  frontend/             # UI Kit (ONE file per manifest resource + shared *-view)
    index.jsx           #   resource entry → ForgeReconciler.render(<XView/>)
    <feature>.jsx       #   resource entry files (panel, classifica, admin, hub…)
    <feature>-view.jsx  #   shared presentational component, reused across entries
  resolvers/            # backend domain modules (KVS-backed), invoked via bridge
docs/                   # design/handoff notes (read HANDOFF-*.md first)
```

- **Feature pattern:** a manifest `resource` → a thin `*.jsx` entry that renders
  a shared `*-view.jsx`. The **same view is reused** across a dashboard gadget
  and a global page (see `profilo-view.jsx` used by both `index.jsx` and
  `workplay-hub.jsx`). When building a new Figma screen, follow this split:
  presentational view + thin resource entry, and register the resource in
  `manifest.yml`.
- **Backend boundary:** UI never touches storage directly — it calls
  `invoke('name', payload)` (`@forge/bridge`) into `src/resolvers/`. Keep
  Figma-driven work on the frontend; wire data through existing resolvers.

---

## Figma MCP workflow for this repo

1. Invoke the **`figma-design-to-code`** skill first (mandatory before
   `get_design_context`).
2. Read the frame: `get_metadata` → `get_screenshot` → `get_design_context`,
   and `get_variable_defs` for tokens.
3. **Translate, don't transcribe:** map every layer to a `@forge/react`
   component and every variable/measurement to an ADS **token string** (§1).
   Discard returned hex/px once mapped to a token.
4. Build with `Box`/`Stack`/`Inline` + tokens. No CSS, no `px`/`#hex` except
   inside `xcss` widths when unavoidable.
5. Anything with no UI Kit equivalent (custom icon, raster asset, breakpoint
   layout, unsupported ADS component) → **stop and ask** (see CLAUDE.md rule 3:
   product-affecting choices are not yours to make).
6. Verify with `forge lint` before saying "done" (CLAUDE.md rule 5).

**Hard "never" list** (vale in `src/frontend/`, NON in `static/gruppi/` — vedi
l'eccezione in cima al file): `<div>`/raw HTML · CSS/`<style>`/className · `px` or
`#hex` values (outside `xcss` widths) · `react-dom` · importing image/svg
assets · adding a bundler/Storybook/Tailwind · media queries.

---

## Custom UI: `static/gruppi/` (l'unica eccezione)

- **Build:** Vite. `cd static/gruppi && npm run build` → `dist/`, che è la
  `resource` puntata dal manifest. **Va rigenerata prima di ogni `forge deploy`**:
  Forge impacchetta l'output, non i sorgenti.
- **`base: './'` in `vite.config.js` è obbligatorio.** Con i path assoluti di
  default la pagina resta bianca dentro l'iframe Forge.
- **`forge tunnel` non copre questa pagina** per le modifiche al manifest; per il
  solo codice React serve comunque `npm run build` + reload.
- **Tokens:** stessi nomi semantici di UI Kit, ma via funzione:
  `import { token } from '@atlaskit/tokens'` → `token('space.200')`.
- **Peso:** il bundle Atlaskit è ~720 kB (~209 kB gzip). I moduli UI Kit non
  hanno bundle. È un'altra ragione per non estendere Custom UI per abitudine.
