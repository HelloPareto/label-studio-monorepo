# Playground App — Implementation Plan

## Goal

Build a local Label Studio playground app inside the monorepo (`web/apps/playground/`)
that replicates and extends https://labelstud.io/playground-app. The app serves as a
sandbox for Claude Code (via `/firefox-repl`) to explore, customize, and push the limits
of Label Studio's XML-based annotation interfaces. It includes project-level revision
tracking and data example management for agentic workflows.

## Architecture Decisions

- **Inside the monorepo**: avoids the dependency hell that killed the standalone replica.
  Internal packages (`@humansignal/editor`, `@humansignal/ui`, `@humansignal/core`) resolve
  via tsconfig paths + webpack aliases — no npm publish step, no version mismatch.
- **Webpack, not Vite**: the monorepo uses Webpack + Babel. The old prototype tried Vite
  and hit bundler incompatibilities. Follow existing patterns.
- **Simplicity over feature parity**: prefer cleaner, simpler code over pixel-perfect
  replication of the LS app. Deviations from LS UI (annotation panels, bottom bar) are
  acceptable when they reduce complexity.
- **Agent-friendly**: stable DOM selectors, predictable URLs, clear state boundaries.
  `/firefox-repl` is the primary feedback loop for Claude Code.

## Namespace Note

- npm package names: `@pareto-engineering/*`
- import paths: `@humansignal/*` (resolved via tsconfig.base.json + webpack.config.js)
- Both refer to the same local source in `web/libs/`

---

## Phase 1: Build Infrastructure

**Objective**: Get `nx serve playground` running with a minimal "hello world" page.

### Tasks

1. Create `web/apps/playground/` directory structure following labelstudio app pattern:
   - `project.json` — Nx project config (webpack executor, dev-server, port 3001)
   - `src/index.html` — minimal HTML shell
   - `src/main.tsx` — React entry point
   - `src/App.tsx` — root component
   - `tsconfig.json`, `tsconfig.app.json` — TypeScript config extending base

2. Wire into monorepo build:
   - Verify `@humansignal/*` imports resolve from the new app
   - Add `playground:serve` and `playground:build` scripts to `web/package.json`
   - Ensure shared webpack config handles the new app entry

3. Verify with `/firefox-repl`:
   - `nx serve playground` starts on :3001
   - Navigate to localhost:3001, confirm page renders
   - Confirm `@humansignal/editor` can be imported without errors

### Acceptance Criteria

- `nx serve playground` starts without errors
- Browser shows rendered React app
- `import LabelStudio from '@humansignal/editor'` works at runtime

---

## Phase 2: Behavior Discovery

**Objective**: Map every behavior of https://labelstud.io/playground-app that we want to
replicate, using `/firefox-repl` to interact with the live app.

### Tasks

1. Use `/firefox-repl` to navigate to https://labelstud.io/playground-app and
   systematically document:
   - Layout structure (four-quadrant: XML editor top-left, preview top-right,
     data input bottom-left, data output bottom-right; draggable dividers
     between all panels for resizing)
   - XML editor features (syntax highlighting, line numbers, placeholder config)
   - Preview panel behavior (how/when it re-renders, loading states, error states)
   - Data input panel (JSON editing, validation, auto-generation from config)
   - Data output panel (annotation result format, live updates vs on-submit)
   - Bottom bar tabs (Regions, History, Relations, Info)
   - URL parameter handling (`?config=`, `?configUrl=`)
   - Top bar controls (copy config, share link, theme toggle)

2. For each behavior, classify:
   - **Must have**: core editing + preview loop
   - **Nice to have**: polish features (theme, share URL)
   - **Skip**: features that add complexity without value for our use case
   - **Deviate**: where simpler code beats LS-faithful UI

3. Produce a `BEHAVIORS.md` checklist that drives Phase 3.

### Acceptance Criteria

- Comprehensive behavior inventory with clear priority tiers
- Each behavior has a 1-2 sentence description of expected UX
- Deviations from LS UI are explicitly noted with rationale

---

## Phase 3: Replicate Core Behaviors

**Objective**: Implement the playground UI in priority order.

### Sub-phases

#### 3a: Editor + Preview (the core loop)

- Top-left panel: CodeMirror XML editor with syntax highlighting and line numbers
- Top-right panel: Live `LabelStudio` instance rendering the annotation interface
- Draggable vertical divider between editor and preview (resize by dragging)
- Draggable horizontal divider between top panels and bottom panels (resize by dragging)
- Config changes trigger preview re-render (debounced, without MobX destruction)
  - Key insight from old work: do NOT destroy/recreate the LS instance on config change.
    Use `store.assignConfig()` / `store.assignTask()` or re-mount the container cleanly.

#### 3b: Data Input/Output

- Bottom-left half: Data Input — JSON editor for task data (`{}` default)
- Bottom-right half: Data Output — annotation results as JSON (`[]` default),
  updated on annotation events
- Auto-generate dummy data from XML config (parse `$variable` references, infer types)

#### 3b+: Bottom Bar (LS annotation panels)

- Regions, History, Relations, Info tabs at the bottom of the preview area
- These come from the LS editor instance — may get them for free

#### 3c: Agent-Friendly Affordances

- Stable `data-testid` attributes on all interactive elements
- Clear loading/error states visible in DOM (not just console)
- URL-based config loading so Claude can navigate directly to a config
- Console-accessible API: `window.playground.getConfig()`, `window.playground.setConfig(xml)`,
  `window.playground.getData()`, `window.playground.getResults()`

### Simplification Decisions (deviations from LS app)

- **No template browser**: the live playground has no templates either — just a blank
  XML editor with a placeholder comment. Configs load via URL params or direct editing.
- **No auth/project context**: pure client-side, no backend calls.
- **Top bar**: replicate the playground's minimal top bar (title + copy/link/theme buttons)
  rather than the full LS app chrome.

### Acceptance Criteria

- XML config editing produces live annotation preview
- Drawing annotations captures results in output panel
- Config changes update preview without MobX errors
- All interactive elements have `data-testid` attributes
- `window.playground` API is functional
- `/firefox-repl` can: load a config, draw an annotation, read the result

---

## Phase 4: Revision & Data Tracking

**Objective**: Add project management for agentic config exploration workflows.

### Design

A "project" is a named collection of:
- **Config revisions**: timestamped XML configs with optional description
- **Data examples**: named task data objects associated with a config
- **Annotation snapshots**: results from testing a config + data combination

Storage: `localStorage` initially, with JSON export/import for persistence.

### Tasks

1. **Project CRUD**:
   - Create/rename/delete projects
   - Switch between projects (updates editor + preview)
   - URL param: `?project=name` for direct navigation

2. **Config Revisions**:
   - Auto-save on meaningful edits (debounced, deduplicated)
   - Manual "save revision" with description
   - Revision list with diff view (or at minimum, timestamp + description)
   - Restore any revision to the editor

3. **Data Examples**:
   - Save current input data as a named example
   - Load examples into the input panel
   - Associate examples with config revisions

4. **Agent API** (extends `window.playground`):
   - `saveRevision(description)` — save current config
   - `listRevisions()` — get revision history
   - `loadRevision(id)` — restore a revision
   - `saveDataExample(name)` — save current input data
   - `listDataExamples()` — list saved examples
   - `loadDataExample(name)` — load an example
   - `exportProject()` / `importProject(json)` — full project export/import

### Acceptance Criteria

- Projects persist across page reloads (localStorage)
- Config revisions are browsable and restorable
- Data examples can be saved, named, and loaded
- `window.playground` API covers all CRUD operations
- `/firefox-repl` can: create a project, save revisions, load examples, export project

---

## Progress

### Phase 1: Build Infrastructure — DONE

Completed 2026-03-24.

- [x] `web/apps/playground/` directory structure (project.json, tsconfig, babelrc, index.html, main.tsx, App.tsx)
- [x] Webpack config updated — playground entrypoint, simple dev server on port 3001
- [x] `pg:serve` and `pg:build` scripts added to `web/package.json`
- [x] `nx run playground:build:development` compiles without errors
- [x] `nx run playground:serve:development` serves on http://localhost:3001
- [x] `@humansignal/editor` resolves at bundle time (dynamic import in App.tsx)

**How to run:**
```bash
cd web
yarn pg:serve     # dev server on :3001
yarn pg:build     # production build to dist/apps/playground
```

### Phase 2: Behavior Discovery — NOT STARTED

### Phase 3: Replicate Core Behaviors — NOT STARTED

### Phase 4: Revision & Data Tracking — NOT STARTED

---

## Open Questions

- Should we support loading configs from the LS backend API (for projects that already
  exist in a running LS instance)?
- Do we want a "diff" view between config revisions, or is timestamp + description enough?
- Should annotation snapshots auto-save, or only on explicit "save"?
