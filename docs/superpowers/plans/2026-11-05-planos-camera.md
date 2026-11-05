# Planos de câmera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A global catalog of camera shot plans (sigla, name, camera, preset). Each part points to an entry plan and an exit plan. The director sees the entry plan above the part's medias and the exit plan below them.

**Architecture:**
- Persistence: a new `camera_plans` table, plus `items.plan_in_id` and `items.plan_out_id` (FK, `ON DELETE SET NULL`).
- Server:
  - Admin CRUD routes for the catalog.
  - Embeds `plan_in` / `plan_out` objects in shift data.
  - Carries plans through backup and restore by sigla.
- Client:
  - Loads the catalog into `AppState.cameraPlans`.
  - Manages it from a new top-bar camera button.
  - The part form gets two selects.
- Shared pure helpers live in `public/js/logic.js` (UMD; used by server, print and UI).

**Tech Stack:** Node 24, Express 5, `node:sqlite` DatabaseSync, vanilla JS UMD modules, `node:test` (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-05-planos-camera-design.md`

**Base:** branch `feature/planos-camera` from `master` **after** `feature/presidente` is merged. Both touch `modals.js` (`openItemModal` / `buildItemPayload`) and `ui-director.js`.

## Global Constraints

- **Data safety:**
  - Never commit `data/eventos.db*`.
  - Never run tests or test servers against the real DB. Tests set `EVENTOS_DB_PATH` to a temp file; live checks use a copy in the scratchpad.
- **UI language:** user-facing text is Portuguese, copied verbatim from the spec. Code comments are English and short, matching the file.
- **Fixed copy:**
  - Error messages:
    - `Informe a sigla (até 8 caracteres).`
    - `Informe o nome do plano.`
    - `Câmera e preset devem ser números inteiros maiores que zero.`
    - `Já existe um plano com a sigla X.` (X = the sigla as typed, trimmed)
    - `Plano não encontrado.`
    - `Plano de câmera não encontrado.`
  - Delete confirmation: `N partes usam este plano.` / `1 parte usa este plano.`
  - Empty states and hints:
    - `Nenhum plano cadastrado.`
    - `Cadastre planos no botão da câmera.`
  - Labels:
    - `— Nenhum —`
    - `Plano de entrada`
    - `Plano de saída`
    - `Planos de câmera`
    - `Novo plano`
    - `Editar plano`
- **Formats:**
  - `planLabel` → `PP · Plano presidente · CAM 2 · P4`.
  - Entry line → `↑ Entrada · ` + planLabel.
  - Exit line → `↓ Saída · ` + planLabel.
- **Scope:** sigla is at most 8 characters, unique, case-insensitive. Camera and preset are positive integers (`parsePositiveInt`).
- **Permissions:** only admin can change the catalog or a part's plans; any session can read.
- **Migrations:** use `ALTER TABLE ... ADD COLUMN` in try/catch, like the existing ones in `db.js`.

## Review Focus

1. **Deleting a plan that parts use.** Parts lose the plan (`NULL`) and nothing crashes.
   - DB test in Task 2.
   - The UI must survive `plan_in: null` (Task 6).
2. **Editing a part without touching the plan fields** (old clients, quick edits). PUT without `planInId` / `planOutId` keeps the current plans.
   - Live check in Task 3.
3. **Sigla case and whitespace.** `pp ` vs `PP` are the same sigla, both when creating and when restoring a backup.
   - DB tests in Task 2.
4. **A backup that references a sigla missing from both `camera_plans` and the local catalog.** The part restores without a plan and the restore does not fail.
   - DB test in Task 2.
5. **Plan rows must not break media reordering or navigation.** The entry and exit rows live outside `#medias-checklist-list` and have no `data-media-id`.
   - Browser check in Task 6.

---

### Task 1: Pure helpers for plans

**Files:**
- Modify: `public/js/logic.js` (add functions; add them to the returned API object)
- Test: `test/logic.test.js` (imports `L = require('../public/js/logic.js')`)

**Interfaces:**
- Produces:
  - `checkCameraPlan({ sigla, name, camera, preset }) -> string|null`
  - `planLabel(plan|null) -> string`
  - `planSiglas(item) -> string`, which reads `item.plan_in` / `item.plan_out` (`{ sigla, ... }` or `null`)

- [ ] **Step 1: Write the failing tests**

```js
test('checkCameraPlan valida sigla, nome, câmera e preset', () => {
  const ok = { sigla: 'PP', name: 'Plano presidente', camera: 2, preset: 4 };
  assert.equal(L.checkCameraPlan(ok), null);
  assert.equal(L.checkCameraPlan({ ...ok, sigla: '  ' }), 'Informe a sigla (até 8 caracteres).');
  assert.equal(L.checkCameraPlan({ ...ok, sigla: 'ABCDEFGHI' }), 'Informe a sigla (até 8 caracteres).');
  assert.equal(L.checkCameraPlan({ ...ok, name: '' }), 'Informe o nome do plano.');
  assert.equal(L.checkCameraPlan({ ...ok, camera: 0 }), 'Câmera e preset devem ser números inteiros maiores que zero.');
  assert.equal(L.checkCameraPlan({ ...ok, preset: '1.5' }), 'Câmera e preset devem ser números inteiros maiores que zero.');
  assert.equal(L.checkCameraPlan({ ...ok, preset: '' }), 'Câmera e preset devem ser números inteiros maiores que zero.');
});

test('planLabel monta sigla · nome · CAM · P', () => {
  assert.equal(L.planLabel({ sigla: 'PP', name: 'Plano presidente', camera: 2, preset: 4 }), 'PP · Plano presidente · CAM 2 · P4');
  assert.equal(L.planLabel(null), '');
});

test('planSiglas mostra a transição da parte', () => {
  const pp = { sigla: 'PP' }, pa = { sigla: 'PA' };
  assert.equal(L.planSiglas({ plan_in: pp, plan_out: pa }), 'PP → PA');
  assert.equal(L.planSiglas({ plan_in: pp, plan_out: null }), 'PP →');
  assert.equal(L.planSiglas({ plan_in: null, plan_out: pa }), '→ PA');
  assert.equal(L.planSiglas({}), '');
});
```

- [ ] **Step 2: Run `npm test`.** Expected: these 3 tests FAIL (`L.checkCameraPlan is not a function`).
- [ ] **Step 3: Implement the three functions in `public/js/logic.js`, next to `shiftHasSentinela`.**
  - `checkCameraPlan` trims sigla and name.
  - Camera and preset must give a positive integer from `parsePositiveInt`. Both `null` (empty) and `false` (invalid) are errors.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit** — `feat: camera plan helpers (validation, label, siglas)`

---

### Task 2: Database — catalog, part plans, shift data, backup/restore

**Files:**
- Modify: `db.js`
- Test: `test/db.test.js` (uses the temp DB and the `eventId` / `shiftId` already created at the top of the file)

**Interfaces:**
- Consumes: `checkCameraPlan` (Task 1), via `require('./public/js/logic.js')` in `db.js`.
- Produces (on `queries`):
  - `listCameraPlans() -> [{ id, sigla, name, camera, preset, usage }]`
    - Ordered by sigla, `COLLATE NOCASE`.
    - `usage` = number of items whose `plan_in_id` or `plan_out_id` is the plan (one item counts once).
  - `getCameraPlan(id) -> row|undefined`
  - `getCameraPlanBySigla(sigla) -> row|undefined` (trimmed, case-insensitive)
  - `createCameraPlan({ sigla, name, camera, preset }) -> id`
  - `updateCameraPlan(id, { sigla, name, camera, preset })`
  - `deleteCameraPlan(id)`
  - `createItem(..., cams = {}, plans = {})` and `updateItem(..., cams = {}, plans = {})`: a new trailing `plans` param, `{ inId, outId }`; absent → `NULL`.
  - `getFullShiftData`: each item gets `plan_in` and `plan_out` as `{ id, sigla, name, camera, preset }` or `null`.
  - Backup:
    - Top-level `camera_plans: [{ sigla, name, camera, preset }]`, containing only the plans that the event's items use.
    - Each item has `plan_in` / `plan_out` as a sigla string or `null`.
  - Restore resolves the backup's plans as described in Step 3.

- [ ] **Step 1: Write the failing tests**

```js
test('plano: cria, sigla única sem diferenciar maiúsculas, uso e exclusão', () => {
  const pp = queries.createCameraPlan({ sigla: 'PP', name: 'Plano presidente', camera: 2, preset: 4 });
  assert.throws(() => queries.createCameraPlan({ sigla: 'pp', name: 'Outro', camera: 1, preset: 1 }));
  assert.equal(queries.getCameraPlanBySigla(' pp ').id, pp);
  const itemId = queries.createItem(shiftId, 'Presidente', '09:00', '', '', 'presidente', 50, null, {}, { inId: pp, outId: pp });
  assert.equal(queries.listCameraPlans().find(p => p.id === pp).usage, 1);
  const part = queries.getFullShiftData(shiftId).items.find(i => i.id === itemId);
  assert.deepEqual(part.plan_in, { id: pp, sigla: 'PP', name: 'Plano presidente', camera: 2, preset: 4 });
  queries.deleteCameraPlan(pp);
  const after = queries.getItem(itemId);
  assert.equal(after.plan_in_id, null);
  assert.equal(after.plan_out_id, null);
});

test('backup leva os planos usados; restauração usa o local e cria o que falta', () => {
  const pa = queries.createCameraPlan({ sigla: 'PA', name: 'Plano aberto', camera: 1, preset: 1 });
  const sd = queries.createCameraPlan({ sigla: 'SD', name: 'Série discurso', camera: 3, preset: 1 });
  queries.createCameraPlan({ sigla: 'XX', name: 'Sem uso', camera: 9, preset: 9 });
  queries.createItem(shiftId, 'Discurso', '10:00', '', 'João', '', 51, null, {}, { inId: pa, outId: sd });
  const backup = queries.getFullEventBackup();
  assert.deepEqual(backup.camera_plans.map(p => p.sigla).sort(), ['PA', 'SD']);
  const part = backup.days[0].shifts[0].items.find(i => i.title === 'Discurso');
  assert.deepEqual([part.plan_in, part.plan_out], ['PA', 'SD']);

  // On this machine PA has another preset and SD does not exist
  queries.updateCameraPlan(pa, { sigla: 'PA', name: 'Plano aberto', camera: 1, preset: 7 });
  queries.deleteCameraPlan(sd);
  queries.restoreEventBackup(backup, true);
  assert.equal(queries.getCameraPlanBySigla('PA').preset, 7);
  assert.equal(queries.getCameraPlanBySigla('SD').camera, 3);
});

test('restauração: sigla desconhecida fica sem plano; backup antigo sem planos restaura', () => {
  const backup = queries.getFullEventBackup();
  const part = backup.days[0].shifts[0].items[0];
  part.plan_in = 'NAOEXISTE';
  delete backup.camera_plans;
  queries.restoreEventBackup(backup, true);
  const shift = queries.getShiftsByDay(queries.getDaysByEvent(queries.getActiveEvent().id)[0].id)[0];
  const restored = queries.getFullShiftData(shift.id).items[0];
  assert.equal(restored.plan_in, null);
});
```

- [ ] **Step 2: Run `npm test`.** Expected: the 3 new tests FAIL.
- [ ] **Step 3: Implement in `db.js`.**
  - **Schema:** in `initSchema`, add `CREATE TABLE IF NOT EXISTS camera_plans` with the columns from the spec. `sigla` is `TEXT NOT NULL UNIQUE COLLATE NOCASE`.
  - **Migrations:** add `ALTER TABLE items ADD COLUMN plan_in_id INTEGER REFERENCES camera_plans(id) ON DELETE SET NULL`, and the same for `plan_out_id`, to the existing try/catch migration loop.
  - **Store trimmed values:** sigla and name are trimmed before storing, so an untrimmed `' pp '` cannot get past the UNIQUE check.
  - **`getFullShiftData`:** attach `plan_in` / `plan_out` with one lookup map built from `listCameraPlans()`. Do not run a query per item.
  - **`restoreEventBackup`**, inside the existing transaction and before the days loop:
    - For each entry of `backupData.camera_plans` (if it is an array) that passes `checkCameraPlan`, create the plan only if `getCameraPlanBySigla` finds nothing. Never update an existing plan.
    - The item INSERT gets `plan_in_id` / `plan_out_id` from `getCameraPlanBySigla(item.plan_in)?.id ?? null`, and the same for `plan_out`.
- [ ] **Step 4: Run `npm test`.** Expected: all pass, including the existing backup tests.
- [ ] **Step 5: Commit** — `feat: camera plans in the database, shift data and backups`

---

### Task 3: Server routes

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes:
  - `checkCameraPlan`, `parsePositiveInt` (logic.js)
  - The queries from Task 2
- Produces (HTTP):
  - `GET /api/camera-plans` (`authenticate()`) → `listCameraPlans()` array
  - `POST /api/camera-plans` (`authenticate('admin')`) → `{ success: true, id }`
  - `PUT /api/camera-plans/:id` (`authenticate('admin')`) → `{ success: true }`
  - `DELETE /api/camera-plans/:id` (`authenticate('admin')`) → `{ success: true }`
  - `POST /api/items` and `PUT /api/items/:id` accept `planInId` / `planOutId`.
  - WS: `broadcast('CAMERA_PLANS_UPDATED')` after every catalog change.

- [ ] **Step 1: Catalog routes.**
  - POST/PUT body is `{ sigla, name, camera, preset }`. `checkCameraPlan` failure → 400 `{ error }`.
  - `getCameraPlanBySigla(sigla)` matching a different id → 409 `Já existe um plano com a sigla ${sigla.trim()}.`
  - PUT or DELETE of an unknown id → 404 `Plano não encontrado.`
  - Store the camera and preset values that `parsePositiveInt` returns.
- [ ] **Step 2: Part plan fields.**
  - Add `checkPlans(body, item = null) -> { plans: { inId, outId } } | { status, error }`, next to `checkCams`, using the same pattern:
    - Field `undefined` → keep the `item` value (or `null` for a new part).
    - `''` or `null` → `null`.
    - Otherwise, the value must parse as a positive integer and `getCameraPlan` must find it. If not → 400 `Plano de câmera não encontrado.`
  - Pass `plans` as the new last argument of `createItem` / `updateItem`.
- [ ] **Step 3: Live check** on a temp DB: `EVENTOS_DB_PATH=<scratchpad>/planos/eventos.db PORT=3999 node server.js`, with a session token inserted into that DB. Use `curl` and confirm each case:
  - Create `PP` → 200.
  - Create `pp` → 409 with the exact message.
  - Sigla `ABCDEFGHI` → 400.
  - Create a part with `planInId` → GET `/api/shifts/:id/full` shows `plan_in.sigla === 'PP'`.
  - PUT the part with only `{ title }` → the plan is kept.
  - PUT `{ planInId: '' }` → the plan is cleared.
  - PUT `{ planInId: 999 }` → 400 `Plano de câmera não encontrado.`
  - DELETE the plan → the part's `plan_in` is `null`.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit** — `feat: camera plan API and part plan fields`

---

### Task 4: Print — entry and exit lines

**Files:**
- Modify: `public/js/print-program.js`
- Test: `test/print-program.test.js`

**Interfaces:**
- Consumes: `Logic.planLabel` (Task 1). Items carry `plan_in` / `plan_out` objects or `null` (Task 2).
- Produces:
  - In `buildProgramHtml`, each part with plans gets `<div class="plan plan-in">` (text `↑ Entrada · ` + planLabel) before its medias (or before `Sem mídias`), and `<div class="plan plan-out">` (`↓ Saída · ` + planLabel) after them.
  - In `buildSentinelaHtml`, the same text goes into a first `<tr class="plan-in">` and a last `<tr class="plan-out">` of the table body, each with one `<td colspan="3">`. With no steps, they go around `Sem passos` as divs.

- [ ] **Step 1: Write the failing tests**

```js
const PP = { sigla: 'PP', name: 'Plano presidente', camera: 2, preset: 4 };
const PA = { sigla: 'PA', name: 'Plano aberto', camera: 1, preset: 1 };

test('roteiro: entrada antes das mídias e saída depois', () => {
  const html = buildProgramHtml({ ...data, items: [{ scheduled_time: '09:00', title: 'Discurso', speaker: 'João',
    description: '', plan_in: PP, plan_out: PA, medias: [{ type: 'video', title: 'Vídeo X', reference: '' }] }] });
  const a = html.indexOf('↑ Entrada · PP · Plano presidente · CAM 2 · P4');
  const b = html.indexOf('Vídeo X');
  const c = html.indexOf('↓ Saída · PA · Plano aberto · CAM 1 · P1');
  assert.ok(a > -1 && a < b && b < c);
});

test('roteiro sem plano não imprime linhas de plano', () => {
  assert.doesNotMatch(buildProgramHtml(data), /Entrada ·|Saída ·/);
});

test('Sentinela: entrada na primeira linha da tabela e saída na última', () => {
  const html = buildSentinelaHtml({ ...data, items: [{ scheduled_time: '15:00', title: 'A Sentinela', speaker: '',
    description: '', talk_number: 3, plan_in: PP, plan_out: PA,
    medias: [{ type: 'question', title: 'A?', paragraph: 1, side: 'left', person: 'Ana' }] }] });
  const a = html.indexOf('↑ Entrada · PP');
  const b = html.indexOf('Ana');
  const c = html.indexOf('↓ Saída · PA');
  assert.ok(a > -1 && a < b && b < c);
});
```

- [ ] **Step 2: Run `npm test`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - Add one shared helper in `makeHelpers`, `planLineHtml(kind: 'in'|'out', plan) -> string`, which returns `''` when there is no plan. Use it in both builders.
  - Style `.plan` in `SHARED_CSS`: small text, `var(--text-2)` color, the `video` icon at 14px.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit** — `feat: print entry and exit camera plans`

---

### Task 5: Catalog UI — top-bar button and plans window

**Files:**
- Modify:
  - `public/index.html`
  - `public/js/api.js`
  - `public/js/state.js`
  - `public/js/app.js`
  - `public/js/modals.js`
  - `public/css/components.css` (or the stylesheet that holds `.settings-list`)

**Interfaces:**
- Consumes: the routes from Task 3, `Logic.planLabel` / `checkCameraPlan` (Task 1), `Modals.openQuickForm`, `Modals.askChoice`, `UIDirector.openRowMenu(anchorEl, entries)`.
- Produces:
  - `Api.getCameraPlans()`, `Api.createCameraPlan(data)`, `Api.updateCameraPlan(id, data)`, `Api.deleteCameraPlan(id)`
  - `AppState.cameraPlans` (array, default `[]`) and `AppState.setCameraPlans(list)`
  - A `loadCameraPlans()` function in `app.js`. It runs after login, together with `loadEventHierarchy()`, and on the WS message `CAMERA_PLANS_UPDATED`. That message also dispatches `refresh-shift-data`, because shift data embeds the plans.
  - `Modals.openCameraPlans()`

- [ ] **Step 1: Top-bar button.**
  - In `index.html`, add it between `btn-print-program` and `btn-open-settings`: `<button type="button" class="icon-btn edit-only" id="btn-camera-plans" title="Planos de câmera" aria-label="Planos de câmera" data-icon="video"></button>`.
  - Wire it in `app.js` next to the print and settings buttons.
- [ ] **Step 2: Window `modal-camera-plans`.**
  - Same structure as `modal-choice`: a header with the title `Planos de câmera` and ✕.
  - The body holds a list container and a `+ Novo plano` button (`btn btn-secondary settings-block-btn`).
  - Rows: sigla (bold), name, then `CAM n · Pn` muted, then a ⋯ button with the entries **Editar** (`pencil`) and **Excluir** (`trash`, danger).
  - Empty catalog → `Nenhum plano cadastrado.`
  - Re-render when `AppState.cameraPlans` changes while the window is open.
- [ ] **Step 3: Form and delete flow.**
  - **New / Edit:**
    - Use `openQuickForm` with the fields `sigla` (text), `name` (text, label `Nome`), `camera` (number, label `Câmera`) and `preset` (number, label `Preset`), all required.
    - Titles: `Novo plano` / `Editar plano`.
    - `onSubmit` validates with `Logic.checkCameraPlan` before calling the API; on error it throws `new Error(message)`, so the toast shows it.
    - `onCancel` reopens `Planos de câmera`.
  - **Excluir:**
    - `usage === 0` → delete directly.
    - Otherwise → `askChoice({ title: 'Excluir plano', text: usage === 1 ? '1 parte usa este plano.' : `${usage} partes usam este plano.`, options: [{ value: 'delete', label: 'Excluir', icon: 'trash', style: 'danger' }] })`.
- [ ] **Step 4: Browser check** (headless Brave against port 3999 on the scratchpad DB copy, admin session inserted into that copy):
  - Create two plans.
  - A duplicate sigla shows the 409 toast.
  - Edit works.
  - Deleting a plan in use asks first.
  - Screenshot the window at 412px wide.
- [ ] **Step 5: Run `npm test`, then commit** — `feat: camera plans window from a top-bar button`

---

### Task 6: Plans on the part — form selects, entry/exit rows, list siglas

**Files:**
- Modify:
  - `public/index.html` (`form-item`)
  - `public/js/modals.js` (`openItemModal`, `buildItemPayload`)
  - `public/js/ui-director.js` (`renderSpotlight`, part row)
  - `public/css/director.css`

**Interfaces:**
- Consumes: `AppState.cameraPlans`, `Logic.planLabel` / `planSiglas`, item `plan_in` / `plan_out`.
- Produces: the item payload gains `planInId` / `planOutId` (select value; `''` = none).

- [ ] **Step 1: Form.**
  - After the Orador group, add two `<select class="form-input">` fields, `itemPlanIn` / `itemPlanOut`, labelled `Plano de entrada` / `Plano de saída`.
  - `openItemModal` fills them on every open: `— Nenhum —` (value `''`), then one `<option value="id">` per plan with `Logic.planLabel(plan)` as text. On edit, it selects the item's current plan.
  - Empty catalog → both selects are disabled and a `form-hint` shows `Cadastre planos no botão da câmera.`
  - `buildItemPayload` sends `planInId` / `planOutId` from the selects.
- [ ] **Step 2: Spotlight.**
  - In `renderSpotlight`, put a plan row **outside** `#medias-checklist-list`: the entry row directly before it, the exit row directly after it.
  - Markup: `<div class="plan-row plan-in">` + `icon('video', 16)` + `<span>↑ Entrada · ${uiEsc(Logic.planLabel(plan))}</span>`; the exit row is the same with `plan-out` / `↓ Saída · `.
  - No row when the plan is `null`.
  - The rows show in director and editor modes, for plain parts, Presidente and Sentinela.
  - Style `.plan-row` as a muted, non-interactive strip, distinct from media rows: no check circle and no `data-media-id`.
- [ ] **Step 3: Part list.**
  - In the part row, add `<span class="part-plans">${uiEsc(Logic.planSiglas(item))}</span>` after the title. Omit it when empty.
  - Make it small and muted. It must not push the ⋯ and status dot out of the row at 412px wide.
- [ ] **Step 4: Browser check** (port 3999, DB copy):
  - Set PP / PA on a part with medias, on the Presidente part (no medias) and on the Sentinela.
  - Screenshot each at 412px wide and at 1280px.
  - The order is entry → medias / `Sem mídias` / cards → exit.
  - The list shows `PP → PA`.
  - Media drag-reorder in edit mode still works.
  - The Next / Previous media navigation ignores the plan rows.
  - Delete PP from the catalog → the part re-renders with only the exit row.
- [ ] **Step 5: Run `npm test`, then commit** — `feat: entry and exit camera plans on the part`
