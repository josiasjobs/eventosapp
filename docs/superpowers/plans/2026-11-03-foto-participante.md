# Foto do participante Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada pergunta da Sentinela pode ter uma foto 3x4 enquadrada à mão, gravada como data URL leve (240×320 WebP) e mostrada na tela e, opcionalmente, na impressão.

**Architecture:** Regras puras (cálculo do recorte e validação da foto) em `public/js/logic.js`, compartilhadas por navegador e servidor. Um módulo novo `public/js/photo-cropper.js` faz a tela de recorte e devolve a data URL. A foto viaja no campo `photo` das rotas de passos e fica em `medias.photo` (coluna que já existe).

**Tech Stack:** Node 24, Express 5, `node:sqlite`, JS puro no navegador (Canvas 2D, Pointer Events, `createImageBitmap`), `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-03-foto-participante-design.md`

## Global Constraints

- Saída da foto: **240×320 px**; `toDataURL('image/webp', 0.72)`; se não começar com `data:image/webp`, `toDataURL('image/jpeg', 0.8)`.
- Antes do recorte, reduzir para no máximo **1600 px** no lado maior; respeitar a orientação EXIF (`createImageBitmap(file, { imageOrientation: 'from-image' })`).
- Foto válida: `''` ou data URL `image/webp`/`image/jpeg` em base64 com até **100 KB** (102400 caracteres).
- Mensagens: `Foto inválida ou grande demais.` (servidor, 400); `Não foi possível abrir esta imagem.` (toast).
- `express.json({ limit: '20mb' })`.
- PUT de passo: `photo` ausente mantém; `''` remove. Foto só em perguntas; em mídias é gravada vazia.
- Foto exibida só via `<img src>` depois de `Logic.isValidPhoto(photo) && photo`; senão, iniciais.
- Impressão "com fotos": foto **1,8 × 2,4 cm** acima do nome.
- Sem dependências novas; sem build. Texto na tela em português. Nunca abrir `data/eventos.db` em testes ou servidores de teste: `EVENTOS_DB_PATH` + `PORT=3999`. `data/eventos.db*` é rastreado pelo git — nunca commitar mudanças nele.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Foto de celular grande (12 MP, 4000×3000) não trava o recorte — redução para 1600 px antes de desenhar (Task 3, verificação no navegador com imagem grande gerada).
2. Arquivo que não é imagem (PDF, texto) → toast, sem tela de recorte (Task 3).
3. Restaurar backup com fotos acima de 100 KB no total → funciona (Task 2, verificação ao vivo).
4. Foto inválida vinda de backup editado → iniciais na tela e nada na impressão (Tasks 4 e 5, testes).
5. Editar só o texto de uma pergunta com foto não apaga a foto (Task 2, verificação ao vivo).

---

### Task 1: Regras puras da foto

**Files:**
- Modify: `public/js/logic.js`
- Test: `test/logic.test.js`

**Interfaces:**
- Produces (exportadas em `Logic`):
  - `coverScale(imgW, imgH, frameW, frameH) -> number` — `Math.max(frameW / imgW, frameH / imgH)`.
  - `clampPan(x, y, imgW, imgH, scale, frameW, frameH) -> { x, y }` — `x`, `y` são a posição do canto superior esquerdo da imagem em relação à moldura; limita `x` a `[frameW - imgW*scale, 0]` e `y` a `[frameH - imgH*scale, 0]`.
  - `fitWithin(w, h, max) -> { w, h }` — sem aumentar; arredonda com `Math.round`.
  - `isValidPhoto(value) -> boolean`.

- [ ] **Step 1: Testes que falham** em `test/logic.test.js`:

```js
test('coverScale cobre a moldura 3x4', () => {
  assert.equal(L.coverScale(1600, 1200, 240, 320), 320 / 1200);
  assert.equal(L.coverScale(900, 1600, 240, 320), 240 / 900);
  assert.equal(L.coverScale(120, 160, 240, 320), 2);
});

test('clampPan mantém a moldura coberta', () => {
  const s = 320 / 1200; // imagem 1600x1200 -> 426.67 x 320
  assert.deepEqual(L.clampPan(10, 5, 1600, 1200, s, 240, 320), { x: 0, y: 0 });
  const r = L.clampPan(-1000, -50, 1600, 1200, s, 240, 320);
  assert.equal(Math.round(r.x * 100) / 100, Math.round((240 - 1600 * s) * 100) / 100);
  assert.equal(r.y, 0);
  assert.deepEqual(L.clampPan(-50, 0, 1600, 1200, s, 240, 320), { x: -50, y: 0 });
});

test('fitWithin reduz sem aumentar', () => {
  assert.deepEqual(L.fitWithin(4000, 3000, 1600), { w: 1600, h: 1200 });
  assert.deepEqual(L.fitWithin(3000, 4000, 1600), { w: 1200, h: 1600 });
  assert.deepEqual(L.fitWithin(800, 600, 1600), { w: 800, h: 600 });
});

test('isValidPhoto aceita só webp/jpeg em base64 até 100 KB', () => {
  assert.equal(L.isValidPhoto(''), true);
  assert.equal(L.isValidPhoto('data:image/webp;base64,UklGRg=='), true);
  assert.equal(L.isValidPhoto('data:image/jpeg;base64,/9j/4AAQ'), true);
  assert.equal(L.isValidPhoto('data:image/png;base64,iVBORw0K'), false);
  assert.equal(L.isValidPhoto('javascript:alert(1)'), false);
  assert.equal(L.isValidPhoto('data:image/webp;base64,abc"><script>'), false);
  assert.equal(L.isValidPhoto('data:image/webp;base64,' + 'A'.repeat(102400)), false);
  assert.equal(L.isValidPhoto(null), false);
});
```

- [ ] **Step 2: Rodar** `npm test` — esperado: FAIL (funções inexistentes).
- [ ] **Step 3: Implementar** em `public/js/logic.js` (comentário curto acima de cada função, como o resto do arquivo). `isValidPhoto`: string, e `''` ou casa `/^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/` com `length <= 102400`.
- [ ] **Step 4: Rodar** `npm test` — esperado: PASS.
- [ ] **Step 5: Commit** `feat: pure rules for participant photo crop and validation`

---

### Task 2: Servidor e banco

**Files:**
- Modify: `db.js`, `server.js`
- Test: `test/db.test.js`

**Interfaces:**
- Consumes: `Logic.isValidPhoto` (Task 1).
- Produces:
  - `step = { paragraph, side, person, photo }` em `createMedia`, `createMediaAfter`, `updateMedia` (photo ausente → `''`).
  - `POST/PUT /api/medias` aceitam `photo` conforme Global Constraints.

- [ ] **Step 1: Testes que falham** em `test/db.test.js` (mesma fixture e banco temporário do arquivo; acrescentar ao fim):

```js
test('passo guarda e atualiza a foto; backup leva a foto', () => {
  const itemId = queries.createItem(shiftId, 'Foto', '16:00', '', '', 'sentinela', 99, 77);
  const photo = 'data:image/webp;base64,UklGRg==';
  const id = queries.createMedia(itemId, '?', 'question', '', 1, { paragraph: 1, side: 'left', person: 'Ana', photo });
  assert.equal(queries.getMedia(id).photo, photo);
  queries.updateMedia(id, '?', 'question', '', { paragraph: 1, side: 'left', person: 'Ana', photo: '' });
  assert.equal(queries.getMedia(id).photo, '');
  queries.updateMedia(id, '?', 'question', '', { paragraph: 1, side: 'left', person: 'Ana', photo });
  const backup = queries.getFullEventBackup();
  const steps = backup.days.flatMap(d => d.shifts).flatMap(s => s.items).find(i => i.title === 'Foto').medias;
  assert.equal(steps[0].photo, photo);
});
```
- [ ] **Step 2: Rodar** `npm test` — esperado: FAIL na primeira asserção.
- [ ] **Step 3: Implementar.**
  - `db.js`: as três funções gravam `step.photo || ''`.
  - `server.js`: `app.use(express.json({ limit: '20mb' }))`. Em `checkStep`, para pergunta: `photo` passa por `isValidPhoto` (inválida → `{ error: 'Foto inválida ou grande demais.' }`) e entra em `step.photo`; para mídia, `step.photo = ''`. POST: `photo` ausente → `''`. PUT: o objeto `merged` inclui `photo: req.body.photo !== undefined ? req.body.photo : media.photo`.
- [ ] **Step 4: Rodar** `npm test` — esperado: PASS.
- [ ] **Step 5: Verificação ao vivo** em banco temporário (`EVENTOS_DB_PATH=$(mktemp -d)/t.db PORT=3999 node server.js`, matar pelo PID ao fim). Com `curl`: setup, login admin, Sentinela com Nº, pergunta com `photo` válida → 200 e aparece em `/api/shifts/:id/full`; `photo: 'data:image/png;base64,AA=='` → 400 com a mensagem exata; PUT só `{title:'B?'}` mantém a foto; PUT `{photo:''}` remove; mídia com `photo` grava vazio; `POST /api/backup/restore` com um backup de ~300 KB (por exemplo 20 perguntas com foto de 15 KB) → 200. `git status` sem mudanças em `data/`.
- [ ] **Step 6: Commit** `feat: store and validate the participant photo`

---

### Task 3: Tela de recorte e formulário da pergunta

**Files:**
- Create: `public/js/photo-cropper.js`
- Modify: `public/index.html` (modal de recorte, bloco da foto no `#form-question`, `<script>` do novo módulo depois de `logic.js`), `public/js/modals.js` (`openQuestionModal`, `submitQuestion`), `public/css/components.css`

**Interfaces:**
- Consumes: `Logic.coverScale`, `Logic.clampPan`, `Logic.fitWithin`, `Logic.initials`, `Logic.isValidPhoto`.
- Produces: `window.PhotoCropper.open(file) -> Promise<string | null>` (data URL, ou `null` se cancelado ou se a imagem não abriu — neste caso o próprio módulo mostra o toast `Não foi possível abrir esta imagem.`).

- [ ] **Step 1: Modal `#modal-photo-crop`** em `index.html`, no padrão dos outros modais (cabeçalho com ✕ e ✓): área da moldura 3x4 (`.crop-frame`, proporção 3/4, largura até 300 px), um `<canvas>` de pré-visualização dentro dela e um `<input type="range" class="crop-zoom">` ("Zoom").
- [ ] **Step 2: `photo-cropper.js`.**
  - Carrega com `createImageBitmap(file, { imageOrientation: 'from-image' })`; se faltar suporte, `<img>` + `URL.createObjectURL`. Falha → toast e `null`.
  - Reduz para `fitWithin(w, h, 1600)` num canvas de trabalho.
  - Estado `{ scale, x, y }`; zoom mínimo `coverScale(...)`, máximo 4× o mínimo; o range vai do mínimo ao máximo.
  - Pointer Events na moldura: um ponteiro arrasta; dois ponteiros fazem pinça (escala pela razão das distâncias, centrada no ponto médio); `wheel` faz zoom. Depois de toda mudança, `clampPan`.
  - Pré-visualização redesenha o canvas da moldura a cada mudança (`requestAnimationFrame`).
  - ✓: desenha a área visível num canvas 240×320 e gera a data URL conforme Global Constraints; resolve. ✕ resolve `null`.
- [ ] **Step 3: Formulário da pergunta.**
  - Topo do `#form-question`: `.q-photo` (quadro 3x4 com `<img>` ou iniciais do nome digitado), botão **📷 Foto** (ícone `image` existente; `<input type="file" accept="image/*" hidden>`), botão **Remover** (`hidden` quando sem foto; garantir `.x[hidden] { display: none }` se o botão tiver `display` próprio).
  - Estado `Modals.questionPhoto` (string): ao abrir para editar, a foto do passo; ao criar, `''`. Escolher arquivo → `PhotoCropper.open(file)` → se não `null`, atualiza estado e quadro. Remover → `''`.
  - `submitQuestion` envia `photo: this.questionPhoto` (sempre, na criação e na edição). "Salvar e próxima" reabre com `questionPhoto = ''`.
- [ ] **Step 4: Verificação.** `npm test` PASS. No navegador sem tela (`brave-browser --headless` existe nesta máquina) num servidor de banco temporário: abrir o formulário, carregar uma imagem gerada de 4000×3000 (por exemplo PNG feito com canvas num script), conferir que o recorte abre, que ✓ produz data URL `image/webp` de 240×320 e com menos de 40 KB, e que salvar grava `photo`. Capturas de tela da moldura e do formulário no scratchpad. Testar também um arquivo `.txt` → toast.
- [ ] **Step 5: Commit** `feat: crop and attach a participant photo in the question form`

---

### Task 4: Foto na tela do diretor e no modo editor

**Files:**
- Modify: `public/js/ui-director.js` (onde hoje há `.sent-photo` e `.step-photo` com `Logic.initials`), `public/css/director.css`

**Interfaces:**
- Consumes: `Logic.isValidPhoto`.
- Produces: `UIDirector.photoHtml(step, cls) -> string` — `<img class="${cls}" src="${photo}" alt="">` quando `step.photo && Logic.isValidPhoto(step.photo)`, senão o `<span>` de iniciais atual.

- [ ] **Step 1: Implementar** `photoHtml` e usar nos dois lugares. CSS: a imagem ocupa o quadro (`width: 100%; height: 100%; object-fit: cover; border-radius` igual ao quadro). O contorno laranja da pessoa da vez continua visível.
- [ ] **Step 2: Verificação.** `npm test` PASS. No navegador sem tela, servidor em banco temporário com uma Sentinela onde uma pessoa tem foto, outra não e uma terceira tem `photo` inválida gravada direto no banco temporário (`node -e` com `node:sqlite`): foto aparece, as outras mostram iniciais, nenhum erro no console. Capturas do diretor (1280 e 412) e do editor no scratchpad.
- [ ] **Step 3: Commit** `feat: show participant photos in the Sentinela views`

---

### Task 5: Impressão com ou sem fotos

**Files:**
- Modify: `public/js/print-program.js` (`buildSentinelaHtml`), `public/js/app.js` (botão Imprimir)
- Test: `test/print-program.test.js`

**Interfaces:**
- Consumes: `Logic.isValidPhoto`; `PrintProgram.itemsFor`.
- Produces: `buildSentinelaHtml(data, opts)` lê `data.withPhotos` (boolean).

- [ ] **Step 1: Testes que falham:**

```js
const photo = 'data:image/webp;base64,UklGRg==';
const sentFotos = { ...sentinela, medias: [
  { type: 'question', paragraph: 1, side: 'left', person: 'Pedro', title: 'A?', photo },
  { type: 'question', paragraph: 1, side: 'left', person: 'Jonas', title: 'B?', photo: '' },
  { type: 'question', paragraph: 2, side: 'right', person: 'Joana', title: '?', photo: 'javascript:alert(1)' }
] };

test('Sentinela com fotos: <img> só para foto válida', () => {
  const html = buildSentinelaHtml({ ...data, withPhotos: true, items: [sentFotos] });
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.match(html, /<img [^>]*src="data:image\/webp;base64,UklGRg=="/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /width: 1\.8cm/);
});

test('Sentinela sem fotos: nenhuma <img>', () => {
  const html = buildSentinelaHtml({ ...data, withPhotos: false, items: [sentFotos] });
  assert.doesNotMatch(html, /<img /);
});
```
- [ ] **Step 2: Rodar** `npm test` — esperado: FAIL.
- [ ] **Step 3: Implementar.** Em `buildSentinelaHtml`, com `withPhotos`, cada `.person` ganha `<img class="pphoto" src="..." alt="">` acima do nome quando a foto é válida; CSS `.pphoto { width: 1.8cm; height: 2.4cm; object-fit: cover; border-radius: 3px; }`. Em `app.js`, depois de escolher "Sentinela": se algum passo `type === 'question'` tem `photo` válida, perguntar com `Modals.askChoice({ title: 'Sentinela', options: [{ value: 'yes', label: 'Com fotos', icon: 'image', style: 'accent' }, { value: 'no', label: 'Sem fotos', icon: 'list' }] })` (✕ cancela a impressão); senão `withPhotos = false`. Passar `withPhotos` em `printProgram`.
- [ ] **Step 4: Rodar** `npm test` — esperado: PASS. Gerar PDF de uma Sentinela longa com fotos (`brave-browser --headless --print-to-pdf`, `pdftoppm`) e conferir cabeçalho repetido e linhas inteiras.
- [ ] **Step 5: Commit** `feat: print the Sentinela with or without photos`
