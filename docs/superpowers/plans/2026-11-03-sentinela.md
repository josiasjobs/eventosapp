# Parte "A Sentinela" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma parte do tipo Sentinela cuja lista de passos mistura perguntas (parágrafo, lado, pessoa) e mídias, mostrada ao diretor em cartões por parágrafo/lado com a câmera de corte, com passo atual local a cada aparelho.

**Architecture:** A tabela `medias` vira a lista de passos (novo tipo `question` e colunas `paragraph`, `side`, `person`, `photo`); `items` ganha `cam_left`, `cam_right`, `cam_speaker` e usa `activity_type = 'sentinela'`. Regras puras (validação, agrupamento em cartões, navegação, iniciais) ficam em `public/js/logic.js`, compartilhado entre servidor e navegador. A tela troca a lista de mídias pelos cartões quando a parte atual é Sentinela.

**Tech Stack:** Node 24, Express 5, `node:sqlite` (DatabaseSync), JS puro no navegador (sem build), `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-03-sentinela-design.md`

## Global Constraints

- Texto na tela em português; "Parte" para itens; ícones Lucide via `window.icon(name, size)` (adicionar o path em `public/js/icons.js` se faltar).
- Sem dependências novas. Sem build.
- Migrações só com `ALTER TABLE ... ADD COLUMN` em `try/catch`, como as existentes em `db.js`.
- O passo atual **nunca** vai para o servidor: `localStorage` `eventos_step_ids` = `{ [itemId]: mediaId }`, com acesso em `try/catch`.
- Câmeras guardam o lado que **filmam**: `cam_left` filma quem está à esquerda; na tela o ícone aparece do lado oposto.
- `side` só `'left'` ou `'right'`. Texto padrão da pergunta: `?`.
- Perguntas não têm ☐ e não contam para a conclusão da parte.
- Nunca commitar `data/eventos.db*`. Testes: `npm test` (`node --test test/*.test.js`).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Parte comum com mídias antigas (sem `paragraph`/`side`) continua idêntica na tela, na impressão e no ◀ ▶ — teste de `itemStatus`/`itemCompletionAfterToggle` sem perguntas (Task 1) e teste de impressão de parte comum inalterado (Task 4).
2. Passo salvo que foi excluído por outro aparelho: o destaque cai no primeiro passo, sem erro — teste `pickInitialStep` (Task 1).
3. Sentinela só com perguntas (nenhuma mídia): marcar uma mídia não existe, e `itemCompletionAfterToggle` com lista só de perguntas devolve `null` — teste (Task 1).
4. Importar com **Substituir** numa Sentinela mantém perguntas e a ordem continua contínua — teste de `importMedias` (Task 2).
5. Restaurar backup antigo (sem os campos novos) — teste de restauração (Task 2).

---

### Task 1: Regras puras da Sentinela

**Files:**
- Modify: `public/js/logic.js`
- Test: `test/logic.test.js`

**Interfaces:**
- Produces (todas exportadas em `Logic` / `module.exports`):
  - `parsePositiveInt(value) -> null | number | false` — mesmo comportamento atual de `parseTalkNumber`; `parseTalkNumber` passa a ser `parsePositiveInt`.
  - `isMediaStep(step) -> boolean` — `step.type !== 'question'`.
  - `checkQuestionStep({ paragraph, side, person }) -> { error } | { paragraph: number, side, person: string }` (person aparado).
  - `groupSentinelaSteps(steps) -> Array<{ kind: 'question'|'media', paragraph: number|null, side: 'left'|'right'|null, steps: Step[] }>`
  - `stepNav(stepIds, currentId, dir: 'next'|'prev') -> { stepId } | { leave: 'next'|'prev' }`
  - `pickInitialStep(stepIds, savedId) -> id | null`
  - `initials(name) -> string` (até 2 letras maiúsculas)

- [ ] **Step 1: Escrever os testes que falham** em `test/logic.test.js`:

```js
const L = require('../public/js/logic.js');
const q = (id, paragraph, side, person = 'X') => ({ id, type: 'question', paragraph, side, person, title: '?' });
const m = (id, paragraph = null, completed = 0) => ({ id, type: 'bible', paragraph, completed, title: 'T' });

test('parsePositiveInt e parseTalkNumber', () => {
  assert.equal(L.parsePositiveInt(''), null);
  assert.equal(L.parsePositiveInt('3'), 3);
  assert.equal(L.parsePositiveInt('0'), false);
  assert.equal(L.parseTalkNumber('2.5'), false);
});

test('checkQuestionStep valida parágrafo, lado e nome', () => {
  assert.deepEqual(L.checkQuestionStep({ paragraph: '2', side: 'left', person: ' Ana ' }), { paragraph: 2, side: 'left', person: 'Ana' });
  assert.equal(L.checkQuestionStep({ paragraph: '2', side: 'left', person: ' ' }).error, 'Informe o nome de quem responde.');
  assert.equal(L.checkQuestionStep({ paragraph: '', side: 'left', person: 'A' }).error, 'Informe o parágrafo (número inteiro maior que zero).');
  assert.equal(L.checkQuestionStep({ paragraph: '1', side: 'meio', person: 'A' }).error, 'O lado deve ser Esquerda ou Direita.');
});

test('groupSentinelaSteps junta perguntas seguidas de mesmo § e lado', () => {
  const g = L.groupSentinelaSteps([q(1, 1, 'left'), q(2, 1, 'left'), q(3, 2, 'right'), m(4, 2), q(5, 2, 'right'), q(6, 2, 'left')]);
  assert.deepEqual(g.map(c => [c.kind, c.paragraph, c.side, c.steps.map(s => s.id)]), [
    ['question', 1, 'left', [1, 2]],
    ['question', 2, 'right', [3]],
    ['media', 2, null, [4]],
    ['question', 2, 'right', [5]],
    ['question', 2, 'left', [6]]
  ]);
  assert.deepEqual(L.groupSentinelaSteps([]), []);
});

test('stepNav anda e sai nas pontas', () => {
  assert.deepEqual(L.stepNav([1, 2, 3], 2, 'next'), { stepId: 3 });
  assert.deepEqual(L.stepNav([1, 2, 3], 2, 'prev'), { stepId: 1 });
  assert.deepEqual(L.stepNav([1, 2, 3], 3, 'next'), { leave: 'next' });
  assert.deepEqual(L.stepNav([1, 2, 3], 1, 'prev'), { leave: 'prev' });
  assert.deepEqual(L.stepNav([], null, 'next'), { leave: 'next' });
  assert.deepEqual(L.stepNav([1, 2], 99, 'next'), { stepId: 1 });
  assert.deepEqual(L.stepNav([1, 2], 99, 'prev'), { leave: 'prev' });
});

test('pickInitialStep usa o salvo se ainda existe, senão o primeiro', () => {
  assert.equal(L.pickInitialStep([1, 2], 2), 2);
  assert.equal(L.pickInitialStep([1, 2], 9), 1);
  assert.equal(L.pickInitialStep([], 9), null);
});

test('initials', () => {
  assert.equal(L.initials('Pedro'), 'PE');
  assert.equal(L.initials('ana maria silva'), 'AS');
  assert.equal(L.initials('  '), '');
});

test('perguntas não contam para status e conclusão da parte', () => {
  assert.equal(L.itemCompletionAfterToggle([q(1, 1, 'left'), m(2, null, 1)], false, true), true);
  assert.equal(L.itemCompletionAfterToggle([q(1, 1, 'left')], false, true), null);
  assert.equal(L.itemStatus({ completed: 0, medias: [q(1, 1, 'left'), m(2)] }), 'empty');
  assert.equal(L.itemStatus({ completed: 0, medias: [m(1, null, 1), m(2)] }), 'partial');
});
```

- [ ] **Step 2: Rodar** `npm test` — esperado: FAIL (`L.parsePositiveInt is not a function` etc.).

- [ ] **Step 3: Implementar em `public/js/logic.js`.** `itemCompletionAfterToggle` e `itemStatus` filtram com `isMediaStep` antes de calcular (lista filtrada vazia → `null` / sem parcial). `stepNav`: `currentId` fora da lista → `next` devolve o primeiro, `prev` sai. `initials`: uma palavra → 2 primeiras letras; várias → 1ª letra da primeira + 1ª da última.

- [ ] **Step 4: Rodar** `npm test` — esperado: todos PASS.

- [ ] **Step 5: Commit** `feat: pure rules for the Sentinela part (steps, cards, navigation)`

---

### Task 2: Banco de dados

**Files:**
- Modify: `db.js`
- Test: `test/db.test.js` (novo)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `db.js` usa `process.env.EVENTOS_DB_PATH` se definido, senão `data/eventos.db` (o diretório `data` continua sendo criado).
  - Colunas: `items.cam_left`, `items.cam_right`, `items.cam_speaker` (INTEGER); `medias.paragraph` (INTEGER), `medias.side`, `medias.person`, `medias.photo` (TEXT DEFAULT '').
  - `createItem(shiftId, title, scheduledTime, description, speaker, activityType, orderNum, talkNumber = null, cams = {})` e `updateItem(id, title, scheduledTime, description, speaker, activityType, talkNumber = null, cams = {})`, `cams = { left, right, speaker }` (ausente → `null`).
  - `createMedia(itemId, title, type, reference, orderNum, step = {})` e `updateMedia(id, title, type, reference, step = {})`, `step = { paragraph, side, person }` (ausente → `null` / `''`).
  - `importMedias(itemId, medias, replace)`: com `replace`, apaga só passos com `type != 'question'`, renumera os restantes 1..n e acrescenta as importadas depois.
  - Backup exporta e restaura `cam_left`, `cam_right`, `cam_speaker`, `paragraph`, `side`, `person`, `photo`.

- [ ] **Step 1: Escrever os testes que falham** em `test/db.test.js`. No topo, antes do `require('../db')`, apontar `process.env.EVENTOS_DB_PATH` para um arquivo dentro de `fs.mkdtempSync(path.join(os.tmpdir(), 'eventos-test-'))`. Montar evento/dia/turno com `createEvent`, `createDay`, `createShift`.

```js
test('Sentinela guarda câmeras e passos', () => {
  const itemId = queries.createItem(shiftId, 'A Sentinela', '15:00', '', '', 'sentinela', 1, 3, { left: 1, right: 3, speaker: 2 });
  const qId = queries.createMedia(itemId, 'A?', 'question', '', 1, { paragraph: 1, side: 'left', person: 'Pedro' });
  const item = queries.getItem(itemId);
  assert.deepEqual([item.cam_left, item.cam_right, item.cam_speaker], [1, 3, 2]);
  const step = queries.getMedia(qId);
  assert.deepEqual([step.paragraph, step.side, step.person, step.photo], [1, 'left', 'Pedro', '']);
});

test('importar com Substituir mantém as perguntas', () => {
  const itemId = queries.createItem(shiftId, 'S', '15:00', '', '', 'sentinela', 2, 4);
  queries.createMedia(itemId, '?', 'question', '', 1, { paragraph: 1, side: 'left', person: 'Ana' });
  queries.createMedia(itemId, 'Velha', 'image', '', 2);
  queries.importMedias(itemId, [{ title: 'Nova', type: 'video', reference: '' }], true);
  const steps = queries.getMediasByItem(itemId);
  assert.deepEqual(steps.map(s => [s.title, s.order_num]), [['?', 1], ['Nova', 2]]);
});

test('backup e restauração levam os campos novos', () => {
  const backup = queries.getFullEventBackup();
  const item = backup.days[0].shifts[0].items.find(i => i.activity_type === 'sentinela');
  assert.equal(item.cam_left, 1);
  assert.equal(item.medias[0].person, 'Pedro');
  queries.restoreEventBackup(backup, true);
  const restored = queries.getFullEventBackup().days[0].shifts[0].items.find(i => i.title === 'A Sentinela');
  assert.deepEqual([restored.cam_right, restored.medias[0].side], [3, 'left']);
});

test('backup antigo, sem os campos novos, restaura com eles vazios', () => {
  const old = queries.getFullEventBackup();
  for (const d of old.days) for (const s of d.shifts) for (const i of s.items) {
    delete i.cam_left; delete i.cam_right; delete i.cam_speaker;
    for (const m of i.medias) { delete m.paragraph; delete m.side; delete m.person; delete m.photo; }
  }
  queries.restoreEventBackup(old, true);
  const i = queries.getFullEventBackup().days[0].shifts[0].items[0];
  assert.equal(i.cam_left, null);
});
```

- [ ] **Step 2: Rodar** `npm test` — esperado: FAIL nos testes novos.
- [ ] **Step 3: Implementar em `db.js`** conforme Interfaces.
- [ ] **Step 4: Rodar** `npm test` — esperado: todos PASS; `git status` não mostra arquivo novo em `data/`.
- [ ] **Step 5: Commit** `feat: store Sentinela cameras and question steps`

---

### Task 3: Rotas do servidor

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: Task 1 (`parsePositiveInt`, `checkQuestionStep`), Task 2 (assinaturas de `createItem`/`updateItem`/`createMedia`/`updateMedia`).
- Produces (corpo JSON):
  - `POST /api/items` e `PUT /api/items/:id` aceitam `camLeft`, `camRight`, `camSpeaker`. No PUT, câmera ausente mantém o valor atual; `''` limpa.
  - Câmera inválida → 400 `Câmera deve ser um número inteiro maior que zero.`
  - Parte com `activity_type` efetivo `'sentinela'` sem número de discurso → 400 `A Sentinela precisa do número do discurso.`
  - `POST /api/medias` e `PUT /api/medias/:id` aceitam `paragraph`, `side`, `person` e o tipo `question`.
    - `question` numa parte que não é Sentinela → 400 `Perguntas só podem ser adicionadas numa parte Sentinela.`
    - `question` validada por `checkQuestionStep` (400 com a mensagem dela); `title` vazio vira `?`.
    - Mídia com `paragraph` inválido → 400 `Informe o parágrafo (número inteiro maior que zero).`; vazio é aceito (`null`). Mídia grava `side`/`person` vazios.

- [ ] **Step 1: Implementar** as regras acima. Extrair um `checkCams(body, item)` análogo ao `checkTalkNumber` existente.
- [ ] **Step 2: Verificação ao vivo** num banco temporário (nunca no real):

```bash
EVENTOS_DB_PATH=$(mktemp -d)/t.db PORT=3999 node server.js
```
  Fazer o setup via `/api/setup`, login admin, e com `curl` conferir: Sentinela sem Nº → 400; com câmeras `0` → 400; pergunta em parte comum → 400; pergunta sem nome → 400; pergunta válida → 200 e aparece em `/api/shifts/:id/full` com `paragraph`, `side`, `person`. Parar o servidor.
- [ ] **Step 3: Rodar** `npm test` — esperado: todos PASS.
- [ ] **Step 4: Commit** `feat: Sentinela validation in item and step routes`

---

### Task 4: Impressão da Sentinela

**Files:**
- Modify: `public/js/print-program.js`
- Test: `test/print-program.test.js`

**Interfaces:**
- Consumes: `Logic.groupSentinelaSteps`, `Logic.isMediaStep`, campos `activity_type`, `cam_left`, `cam_right`, `cam_speaker`, e passos com `paragraph`, `side`, `person`, `title`.
- Produces: `buildProgramHtml` sem mudança de assinatura.

- [ ] **Step 1: Escrever os testes que falham:**

```js
const sentinela = {
  scheduled_time: '15:00', title: 'A Sentinela', speaker: '', description: '', talk_number: 3,
  activity_type: 'sentinela', cam_left: 1, cam_right: 3, cam_speaker: 2,
  medias: [
    { type: 'question', paragraph: 1, side: 'left', person: 'Pedro', title: 'A?' },
    { type: 'question', paragraph: 1, side: 'left', person: 'Jonas', title: 'B?' },
    { type: 'bible', paragraph: 2, title: 'Salmo 119:9', reference: '' },
    { type: 'question', paragraph: 2, side: 'right', person: 'Joana', title: '?' }
  ]
};

test('Sentinela imprime cartões com lado, câmera e ☐ só nas mídias', () => {
  const html = buildProgramHtml({ ...data, items: [sentinela] });
  assert.match(html, /Orador CAM 2/);
  assert.match(html, /ESQUERDA · CAM 1[\s\S]*Pedro[\s\S]*A\?[\s\S]*Jonas[\s\S]*B\?/);
  assert.match(html, /DIREITA · CAM 3[\s\S]*Joana/);
  assert.match(html, /§1/);
  assert.equal((html.match(/class="box"/g) || []).length, 1);
});
```
  Os testes atuais de parte comum continuam sem mudança.
- [ ] **Step 2: Rodar** `npm test` — esperado: FAIL no teste novo.
- [ ] **Step 3: Implementar.** Parte Sentinela: `Orador CAM N` na linha de meta (só se `cam_speaker`); a lista vira linhas por cartão — pergunta: `§N`, `ESQUERDA · CAM x` / `DIREITA · CAM y` (`CAM` omitido se vazio), depois `Pessoa — texto` separados por `·`; mídia: `§N` (se houver) + o mesmo `.media` de hoje com ☐.
- [ ] **Step 4: Rodar** `npm test` — esperado: todos PASS.
- [ ] **Step 5: Commit** `feat: print the Sentinela as cards`

---

### Task 5: Cadastro no modo editor

**Files:**
- Modify: `public/index.html`, `public/js/modals.js`, `public/js/ui-director.js` (só `bindFab`/`openFabMenu`), `public/js/app.js` (init), `public/css/components.css`, `public/js/icons.js` se precisar

**Interfaces:**
- Consumes: Task 3 (campos do corpo), `Logic.parsePositiveInt`, `Logic.checkQuestionStep`.
- Produces:
  - `Modals.openItemModal(itemId = null, { sentinela = false } = {})` — a Sentinela é reconhecida por `opts.sentinela` (nova) ou por `item.activity_type === 'sentinela'` (edição).
  - `Modals.openQuestionModal(itemId, stepId = null, preset = {})` com `preset = { paragraph, side }`.
  - `Modals.initQuestionForm()` chamado em `app.js` junto dos outros `init*`.

- [ ] **Step 1: Menu +.** Adicionar `data-fab="sentinela"` ("Sentinela", ícone `book`) e `data-fab="question"` ("Pergunta", ícone `user`). "Pergunta" fica `hidden` quando a parte atual não é Sentinela (decidido em `openFabMenu`).
- [ ] **Step 2: Formulário da parte.**
  - Novo grupo `.cam-group` com três inputs numéricos `itemCamLeft`, `itemCamRight`, `itemCamSpeaker` (rótulos "Câm. esquerda", "Câm. direita", "Câm. orador"), visível só em Sentinela.
  - Em Sentinela: título "Nova Sentinela"/"Editar Sentinela", `itemTitle` pré-preenchido "A Sentinela" ao criar, `.talk-group` com a caixa escondida e marcada e o campo Nº visível e obrigatório.
  - `buildItemPayload` envia `activityType: 'sentinela'` e `camLeft`/`camRight`/`camSpeaker` em Sentinela; para parte comum, comportamento atual.
  - `submitItem` valida câmeras com `parsePositiveInt` (toast `Câmera deve ser um número inteiro maior que zero.`).
- [ ] **Step 3: Formulário de mídia.** Campo opcional `mediaParagraph` ("§ Parágrafo", número) visível só quando a parte é Sentinela; enviado como `paragraph`.
- [ ] **Step 4: Novo modal `#modal-question-editor`** (`form-question`):
  - `qParagraph` (número), botões de lado `role="radio"` ESQUERDA | DIREITA espelhados num `input hidden` `qSide`, `qPerson` com `list="question-people"` (`<datalist>` preenchido com os nomes distintos dos passos da parte), `qTitle` com valor inicial `?`.
  - Cabeçalho com ✕ e ✓ (Salvar), como os outros modais; botão "Salvar e próxima" no corpo.
  - "Salvar e próxima" grava e reabre com o mesmo § e lado, `qPerson` vazio e focado, `qTitle` = `?`.
  - Valida com `Logic.checkQuestionStep` antes de enviar (toast com a mensagem).
- [ ] **Step 5: Verificação.** `npm test` PASS. Em `node` com o harness em `vm` usado antes nesta base (carregar `logic.js` + `modals.js` com DOM falso) ou no navegador: criar Sentinela pelo menu +, conferir payload `activityType: 'sentinela'` e câmeras; criar duas perguntas com "Salvar e próxima" e conferir o preset.
- [ ] **Step 6: Commit** `feat: create Sentinela parts and question steps in edit mode`

---

### Task 6: Tela do diretor

**Files:**
- Modify: `public/js/ui-director.js`, `public/js/state.js`, `public/css/director.css`

**Interfaces:**
- Consumes: Task 1 (`groupSentinelaSteps`, `stepNav`, `pickInitialStep`, `initials`, `isMediaStep`), Task 5 (`Modals.openQuestionModal`, `Modals.openMediaModal`).
- Produces:
  - `AppState.getStepId(item) -> id | null` (lê `eventos_step_ids`, aplica `pickInitialStep` com os ids dos passos) e `AppState.setStepId(itemId, stepId)` (grava e notifica `STEP_CHANGED`, que dispara `UIDirector.render()` em `app.js`).

- [ ] **Step 1: Render no modo diretor.** Em `renderSpotlight`, se `currentItem.activity_type === 'sentinela'` e há passos, trocar `mediasHtml` por:
  - cabeçalho de colunas ESQUERDA | DIREITA e `Orador CAM N` na `.current-meta`;
  - um `.sent-card` por grupo: `§N` no canto; pergunta → pessoas (`.sent-person[data-media-id]`: quadro 3x4 com `Logic.initials`, nome em cima, texto embaixo) no lado delas e `.sent-cam` (ícone `video` + `CAM n`) no lado oposto; mídia → `.media-row` atual (☐ manual) ocupando as duas colunas;
  - classes de destaque: `.is-current` no cartão do passo atual, na pessoa da vez e na câmera.
- [ ] **Step 2: Toque e navegação.**
  - Toque numa `.sent-person` → `AppState.setStepId`. Toque numa mídia → move o destaque **e** mantém o toggle atual de ☐.
  - `navigateNext`/`navigatePrevious`: se a parte atual é Sentinela com passos, usar `Logic.stepNav`; `{ leave }` cai no comportamento atual de parte. `renderNavigationToolbar` habilita ▶/◀ quando há passo seguinte/anterior **ou** parte seguinte/anterior.
  - Rolar o cartão atual para a vista (`scrollIntoView({ block: 'nearest' })`) só quando o passo mudou desde o último render.
- [ ] **Step 3: Modo editor.** Ruling do plano: arrastar (`enableLongPressReorder`) só reordena irmãos do mesmo pai, então no modo editor a Sentinela renderiza **uma lista plana** em um container: um `.sent-head` por cartão (`§N · ESQUERDA · CAM n` + botão `+` que chama `Modals.openQuestionModal(itemId, null, { paragraph, side })`) seguido das linhas `.step-row[data-media-id]` de cada passo, com ⋯. Ligar `enableLongPressReorder(spotlight, '.media-row[data-media-id], .step-row[data-media-id]', ...)`. O ⋯ de uma pergunta abre "Editar pergunta" (`openQuestionModal(itemId, stepId)`) e "Excluir".
- [ ] **Step 4: Importar playlist numa Sentinela.** Em `importPlaylist`, contar só `isMediaStep`; se a parte é Sentinela, o texto da escolha diz `As perguntas continuam; Substituir troca só as mídias.`
- [ ] **Step 5: CSS** em `director.css`: duas colunas iguais; quadro 3x4 (`aspect-ratio: 3 / 4`); destaque laranja com as variáveis existentes; no celular (`max-width` já usado no arquivo) fotos menores e pessoas empilhadas.
- [ ] **Step 6: Verificação.** `npm test` PASS. No servidor de teste da Task 3 (banco temporário), abrir no navegador: cartões de §1 (Pedro, Jonas à esquerda, CAM 1 à direita), ▶ passa Pedro → Jonas → próximo cartão → próxima parte; recarregar mantém o passo; outro aparelho/aba não acompanha; modo editor arrasta e o `+` do cartão preenche § e lado.
- [ ] **Step 7: Commit** `feat: director view for the Sentinela`
