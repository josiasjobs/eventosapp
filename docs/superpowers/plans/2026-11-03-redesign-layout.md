# Redesign do layout e do visual — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a interface do EventosAPP por um visual limpo no estilo JW Hub, pensado para toque, com menos toques, menos texto e só ícones.

**Architecture:** O frontend continua em HTML, CSS e JS puros, sem build. A lógica nova e testável fica em `public/js/logic.js` (UMD: `window.Logic` no navegador, `module.exports` no Node) e em `pin.js` na raiz. Os ícones ficam em `public/js/icons.js`. A API, o banco e o WebSocket não mudam; a única mudança no servidor é a regra do PIN.

**Tech Stack:** Node.js 24, Express 5, `ws`, `node:sqlite`; frontend vanilla; testes com `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-03-redesign-layout-design.md`. Leia o spec antes de cada tarefa: ele fixa cores, tamanhos, textos e comportamentos que este plano não repete.

## Pré-requisito (fazer antes da Tarefa 1)

O working tree tem 13 arquivos modificados e não commitados, que são a base deste trabalho. O usuário deve commitá-los no `master` antes de criar o branch ou worktree de implementação; senão o trabalho parte de uma base antiga. Também adicione `.superpowers/` ao `.gitignore`.

## Global Constraints

- Texto na tela usa **"Parte"**, nunca "Item". O código continua com `item`.
- PIN: exatamente 4 dígitos, `/^\d{4}$/`.
- Nenhum emoji na interface; só `icon(nome)`. Todo botão só com ícone tem `title` e `aria-label` em português.
- Sem Google Fonts: `font-family: system-ui, "Noto Sans", Roboto, "Segoe UI", sans-serif`.
- Cores exatamente como na tabela do spec (§1). Laranja `#f26a1b` só para destaque; verde `#3fb950` só para concluído; vermelho `#f05252` só para excluir e erros.
- Área de toque mínima de 44×44px. Corte entre layouts: 768px.
- Sem gradientes, brilhos, vidro ou pulso (exceto o pulso do 🗑 armado). Transições de 150 ms.
- Sem `alert()`, `confirm()` ou `prompt()` no código final.
- Sem dependências npm novas.
- Todo texto vindo do banco passa por `Logic.escapeHtml` antes de entrar num template HTML; ids vão em `data-*`, nunca interpolados como string dentro de `onclick`.

## Review Focus

1. **Dois aparelhos marcam a última mídia ao mesmo tempo.** A rota `POST /api/items/:id/toggle` *inverte* o estado, então dois pedidos desfazem um ao outro. A parte deve terminar concluída. Defesa: antes de chamar o toggle, reler `AppState` (o WS pode já ter atualizado) e só chamar se o estado atual for diferente do desejado. Teste na Tarefa 1 (`itemCompletionAfterToggle` retorna `null` se a parte já está concluída) e verificação manual na Tarefa 5.
2. **Turno salvo que não existe mais** (excluído, ou backup restaurado): o app deve abrir no primeiro turno do primeiro dia, sem erro. Teste na Tarefa 1.
3. **Rolar a lista no celular não pode iniciar arrasto nem selecionar uma parte.** Mover o dedo mais de 10px antes dos 500 ms cancela o "segurar". Verificação manual na Tarefa 7.
4. **Parte sem mídias:** a bolinha marca e desmarca normalmente, e a conclusão automática não faz nada. Teste na Tarefa 1.
5. **Títulos com aspas, apóstrofo ou `<`** (ex.: `Dia D'Ávila`, `<b>`): devem aparecer literalmente, sem quebrar o HTML nem os cliques. Hoje `modals.js` interpola o rótulo dentro de `onclick="...('${day.label}')"`. Teste de `escapeHtml` na Tarefa 1; verificação manual nas Tarefas 4 e 6.

---

### Tarefa 1: Lógica pura e testes

**Files:**
- Create: `public/js/logic.js`
- Create: `test/logic.test.js`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces (em `window.Logic` e `module.exports`):
  - `itemCompletionAfterToggle(medias: {completed:0|1|boolean}[], itemCompleted: boolean, mediaNowCompleted: boolean) -> true | false | null`
  - `pickInitialShift(days: {id, shifts:{id}[]}[], savedShiftId: number|null) -> {dayId, shiftId} | null`
  - `itemStatus(item: {completed, medias?}) -> 'empty' | 'partial' | 'done'`
  - `escapeHtml(value: any) -> string` (escapa `& < > " '`; `null`/`undefined` viram `''`)

- [ ] **Passo 1: Escrever os testes que falham** em `test/logic.test.js` (`const { test } = require('node:test'); const assert = require('node:assert/strict'); const L = require('../public/js/logic.js');`):

```js
test('marcar a última mídia conclui a parte', () => {
  assert.equal(L.itemCompletionAfterToggle([{completed:1},{completed:1}], false, true), true);
});
test('marcar com mídias pendentes não altera', () => {
  assert.equal(L.itemCompletionAfterToggle([{completed:1},{completed:0}], false, true), null);
});
test('marcar a última com a parte já concluída não altera', () => {
  assert.equal(L.itemCompletionAfterToggle([{completed:1}], true, true), null);
});
test('desmarcar mídia de parte concluída reabre', () => {
  assert.equal(L.itemCompletionAfterToggle([{completed:0},{completed:1}], true, false), false);
});
test('desmarcar mídia de parte pendente não altera', () => {
  assert.equal(L.itemCompletionAfterToggle([{completed:0}], false, false), null);
});
test('parte concluída manualmente continua concluída ao marcar mídia pendente', () => {
  assert.equal(L.itemCompletionAfterToggle([{completed:1},{completed:0}], true, true), null);
});
test('sem mídias não altera', () => {
  assert.equal(L.itemCompletionAfterToggle([], false, true), null);
});

const days = [{id:1, shifts:[{id:10},{id:11}]}, {id:2, shifts:[{id:20}]}];
test('usa o turno salvo quando existe', () => {
  assert.deepEqual(L.pickInitialShift(days, 20), {dayId:2, shiftId:20});
});
test('turno salvo inexistente cai no primeiro', () => {
  assert.deepEqual(L.pickInitialShift(days, 999), {dayId:1, shiftId:10});
});
test('sem turno salvo cai no primeiro', () => {
  assert.deepEqual(L.pickInitialShift(days, null), {dayId:1, shiftId:10});
});
test('primeiro dia sem turnos usa o próximo dia com turno', () => {
  assert.deepEqual(L.pickInitialShift([{id:1, shifts:[]}, ...days.slice(1)], null), {dayId:2, shiftId:20});
});
test('sem dias retorna null', () => {
  assert.equal(L.pickInitialShift([], 10), null);
});

test('itemStatus', () => {
  assert.equal(L.itemStatus({completed:1, medias:[]}), 'done');
  assert.equal(L.itemStatus({completed:0, medias:[{completed:1},{completed:0}]}), 'partial');
  assert.equal(L.itemStatus({completed:0, medias:[{completed:0}]}), 'empty');
  assert.equal(L.itemStatus({completed:0}), 'empty');
});

test('escapeHtml', () => {
  assert.equal(L.escapeHtml(`Dia D'Ávila <b>"x"</b> & y`),
    'Dia D&#39;Ávila &lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; y');
  assert.equal(L.escapeHtml(null), '');
  assert.equal(L.escapeHtml(12), '12');
});
```

- [ ] **Passo 2:** Em `package.json`, troque o script `test` por `"node --test test/"`. Rode `npm test`. Esperado: FAIL com "Cannot find module '../public/js/logic.js'".

- [ ] **Passo 3: Implementar `public/js/logic.js`.** Use o padrão UMD sem dependências: `(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.Logic = api; })(this, function () { ... })`. Em `itemStatus`, `done` tem prioridade sobre as mídias.

- [ ] **Passo 4:** `npm test`. Esperado: todos passam.

- [ ] **Passo 5: Commit**

```bash
git add public/js/logic.js test/logic.test.js package.json
git commit -m "feat: add pure UI logic helpers with tests"
```

---

### Tarefa 2: PIN de 4 dígitos no servidor

**Files:**
- Create: `pin.js`, `test/pin.test.js`
- Modify: `auth.js:75-77` (usar `pin.js`), `server.js:164-169`, `server.js:356-360`

**Interfaces:**
- Produces: `isValidPin(pin: any) -> boolean` em `pin.js`. `auth.js` reexporta a mesma função, então quem importa de `auth.js` não muda.

`pin.js` existe para os testes não precisarem carregar `auth.js`, que importa `db.js` e abre o banco real.

- [ ] **Passo 1: Escrever o teste que falha** em `test/pin.test.js`:

```js
const { isValidPin } = require('../pin.js');
test('aceita exatamente 4 dígitos', () => {
  assert.equal(isValidPin('1234'), true);
  assert.equal(isValidPin('0000'), true);
});
test('rejeita o resto', () => {
  for (const p of ['123', '12345', '12345678', '12a4', ' 1234', '', null, 1234]) {
    assert.equal(isValidPin(p), false, String(p));
  }
});
```

- [ ] **Passo 2:** `npm test`. Esperado: FAIL ("Cannot find module '../pin.js'").
- [ ] **Passo 3:** Crie `pin.js` com `/^\d{4}$/`. Em `auth.js`, remova a função local e importe e reexporte a de `pin.js`.
- [ ] **Passo 4:** Em `server.js`, as quatro mensagens de erro passam a ser `'O PIN do Diretor deve ter 4 dígitos.'` e `'O PIN de Administrador deve ter 4 dígitos.'` (na configuração inicial e na troca de PIN).
- [ ] **Passo 5:** `npm test`. Esperado: todos passam. Depois, `node -e "require('./auth.js')"` termina sem erro.
- [ ] **Passo 6: Commit** — `git commit -m "feat: require exactly 4-digit PINs"`

---

### Tarefa 3: Fundação visual (tokens, base, ícones, janela e gaveta)

**Files:**
- Rewrite: `public/css/variables.css`, `public/css/base.css`, `public/css/components.css`
- Create: `public/js/icons.js`
- Modify: `public/index.html` (`<head>`: remover os 3 links do Google Fonts; carregar `js/logic.js` e `js/icons.js` antes de `js/state.js`; `theme-color` → `#000000`)

**Interfaces:**
- Produces:
  - `window.icon(name: string, size = 20) -> string` (SVG inline com `stroke="currentColor"`, `aria-hidden="true"`). Nomes obrigatórios: `play, wifi, wifi-off, pencil, gear, logout, chevron-left, chevron-right, list, clock, user, check, plus, more, trash, download, upload, x, book, video, image, mic, drama, file, copy, backspace`. Paths do Lucide (licença ISC), copiados à mão para o arquivo.
  - `window.MEDIA_TYPE_ICONS = { bible:'book', video:'video', image:'image', interview:'mic', theater:'drama', other:'file' }`
  - Tokens CSS (nomes que as próximas tarefas usam): `--bg, --surface, --surface-raised, --surface-2, --border, --text, --text-2, --accent, --done, --danger, --radius (4px), --tap (44px), --fs-title (22px), --fs-body (16px), --fs-small (13px), --t (150ms)`.
  - Classes em `components.css`: `.icon-btn` (44×44, só ícone), `.btn`, `.btn-accent`, `.row` (linha de lista), `.dot` com modificadores `.is-empty`, `.is-partial` e `.is-done`, `.check-circle` com `.is-done`, `.toast`.
  - `.modal-backdrop` / `.modal-dialog` continuam sendo usados por `Modals.open/close`: abaixo de 768px a janela é uma gaveta presa embaixo (cantos superiores de 12px, máximo de 85vh, rolagem interna); a partir de 768px é uma janela central de no máximo 520px. Cabeçalho da janela: `.modal-header` com título, `.icon-btn` ✕ e, opcionalmente, ✓ (`.icon-btn.btn-accent`).

- [ ] **Passo 1:** Escreva `icons.js` e os três CSS seguindo o spec §1. Apague de `variables.css` os tokens antigos e corrija os outros CSS que ainda referenciam nomes antigos (`director.css` e `editor.css` serão reescritos nas Tarefas 4 e 7; até lá, basta não quebrarem o carregamento).
- [ ] **Passo 2: Verificação.** `npm start`, abrir `http://localhost:3000` no Chrome com DevTools: sem erros no console; no console, `icon('book')` retorna uma string `<svg`; o fundo é preto; nenhuma requisição para `fonts.googleapis.com` na aba Network.
- [ ] **Passo 3: Commit** — `git commit -m "feat: new visual foundation (tokens, icons, sheets)"`

---

### Tarefa 4: Tela de operação (topo, lista, parte atual, barra de baixo)

**Files:**
- Modify: `public/index.html` (substituir todo o `<header>` e o `<main>`; remover `#mode-banner`, `#mobile-header-menu` e os selects de dia e turno)
- Modify: `public/js/ui-director.js` (`renderSpotlight`, `renderTimeline`, `renderNavigationToolbar`, `getMediaTypeInfo`)
- Rewrite: `public/css/director.css`
- Modify: `public/js/app.js` (remover `toggleMobileMenu`, `closeMobileMenu`, `updateHeaderSelectors`, `updateShiftSelectOptions`, os listeners dos selects e do banner; atualizar o handler `WS_STATUS_CHANGED` para o novo ícone)

**Interfaces:**
- Consumes: `icon()`, `MEDIA_TYPE_ICONS`, `Logic.itemStatus`, `Logic.escapeHtml`, tokens e classes da Tarefa 3.
- Produces (ids do DOM que as próximas tarefas usam):
  - Topo: `#btn-shift-picker` (etiqueta "Dia · Turno"; o texto é preenchido por `UIDirector.renderShiftLabel()`), `#btn-connection` (classe `is-online`, `is-reconnecting` ou `is-offline`), `#btn-mode-toggle` (classe `is-on` com a edição ligada), `#btn-open-settings` (classe `edit-only`).
  - `#timeline-container` (coluna esquerda; escondido abaixo de 768px), `#spotlight-container`, `#director-nav-container`, `#modal-schedule-picker` (gaveta da programação no celular, reaproveitada; o ☰ abre ela).
  - Atributos das linhas: `.row[data-item-id]` para partes e `.media-row[data-media-id]` para mídias. A bolinha da parte é `button.dot[data-action="toggle-item"]`.
  - `UIDirector.render()` continua sendo o ponto de entrada.
- Os cliques passam a usar delegação de eventos (`container.addEventListener('click', ...)` lendo `data-*`) no lugar de `onclick` com strings.

- [ ] **Passo 1:** Reescreva o topo e o layout em `index.html` e `director.css` conforme o spec §2: duas colunas a partir de 768px (lista com 38% da largura) e uma coluna abaixo disso.
- [ ] **Passo 2:** Reescreva os três `render*` conforme o spec §2: o que aparece, o que sai e os estados vazios ("Sem partes neste turno", "Sem mídias"). `renderTimeline` rola até `.row.is-current` com `scrollIntoView({block:'nearest'})`. Os botões ◀ ▶ ☰ são `.icon-btn` com `aria-label` "Parte anterior", "Próxima parte" e "Programação"; o ☰ tem a classe `phone-only`.
- [ ] **Passo 3:** Tocar numa linha da lista chama `setCurrentItem` e fecha `#modal-schedule-picker`. Tocar na bolinha chama `toggleItemCompleted` sem selecionar a linha (`stopPropagation`).
- [ ] **Passo 4: Verificação manual** (DevTools, 390×844 e 1024×768): o layout bate com o spec; ◀ ▶ e as setas do teclado navegam; o ☰ só aparece no celular e abre a gaveta; tocar numa parte da gaveta seleciona e fecha; o ícone de conexão fica vermelho ao parar o servidor; uma parte com título `Teste <b>x</b> D'Ávila` aparece literal e continua clicável.
- [ ] **Passo 5: Commit** — `git commit -m "feat: redesigned operation screen"`

---

### Tarefa 5: Marcar mídias e conclusão automática da parte

**Files:**
- Modify: `public/js/ui-director.js` (`handleMediaClick`, `toggleItemCompleted`)

**Interfaces:**
- Consumes: `Logic.itemCompletionAfterToggle`, `Api.toggleMediaCompleted(id) -> {completed}`, `Api.toggleItemCompleted(id) -> {completed}`, `AppState.toggleMediaCompleted(id, bool)` e `AppState.toggleItemCompleted(id, bool)`.
- Produces: `UIDirector.setItemCompleted(itemId: number, desired: boolean) -> Promise<void>`, que só chama a API quando `AppState` difere de `desired`, com atualização otimista e reversão + toast em caso de erro.

- [ ] **Passo 1:** `handleMediaClick(mediaId)`: atualização otimista via `AppState.toggleMediaCompleted`; chama a API; se falhar, reverte e mostra um toast de erro. Se der certo, calcula `itemCompletionAfterToggle(item.medias, Boolean(item.completed), resposta.completed)` e, se o resultado não for `null`, chama `setItemCompleted(item.id, resultado)`.
- [ ] **Passo 2:** A bolinha da parte (Tarefa 4) passa a chamar `setItemCompleted(id, !item.completed)`.
- [ ] **Passo 3: Verificação manual:** marcar todas as mídias conclui a parte (bolinha verde, título riscado) e não muda a parte atual; desmarcar uma reabre; marcar a bolinha manualmente com mídias pendentes e depois marcar uma mídia deixa a parte concluída; com dois navegadores abertos, marcar a última mídia nos dois quase ao mesmo tempo deixa a parte concluída nos dois (Review Focus 1); com o servidor parado, marcar uma mídia volta ao estado anterior e mostra um toast vermelho.
- [ ] **Passo 4: Commit** — `git commit -m "feat: auto-complete part when its last media is checked"`

---

### Tarefa 6: Gaveta de dia e turno e lembrança do turno

**Files:**
- Modify: `public/index.html` (nova `#modal-shift-picker`; remover a aba "Dias & Turnos" de `#modal-settings`)
- Modify: `public/js/state.js` (`setEventHierarchy`, `autoSelectShift`, novo `selectShift`)
- Modify: `public/js/modals.js` (substituir `renderSettingsStructure`, `promptAddDay`, `promptEditDay`, `promptAddShift`, `promptEditShift`, `deleteDay`, `deleteShift`)
- Modify: `public/js/app.js` (o clique em `#btn-shift-picker` abre a gaveta; `UIDirector.renderShiftLabel()` é chamado em `HIERARCHY_UPDATED`)

**Interfaces:**
- Consumes: `Logic.pickInitialShift`, `Logic.escapeHtml`, `UIDirector.confirmDelete` (Tarefa 7; até ela existir, use exclusão direta e troque na Tarefa 7), `Api.createDay/updateDay/deleteDay/createShift/updateShift/deleteShift`.
- Produces:
  - `AppState.selectShift(dayId: number, shiftId: number)`: grava `localStorage['eventos_shift_id']` (dentro de try/catch), zera `currentItemId` e notifica `SHIFT_SELECTED`.
  - `Modals.openShiftPicker()` e `Modals.renderShiftPicker()`.
  - `Modals.openQuickForm({ title: string, fields: {name, label, type:'text'|'date'|'time', value?, required?}[], onSubmit: (values) => Promise<void> })`: uma janela genérica com ✕ e ✓. Ela substitui todos os `prompt()` e é reutilizável.
- `setEventHierarchy` passa a usar `pickInitialShift(days, savedId)` quando não há turno selecionado ou quando o turno selecionado não existe mais.

- [ ] **Passo 1:** Implemente `selectShift` e a seleção inicial com `pickInitialShift`.
- [ ] **Passo 2:** Implemente a gaveta (spec §4 "Gaveta de dia e turno") e o `openQuickForm`. Dia: rótulo + data. Turno: nome (os horários de início e fim não aparecem, e os valores existentes são preservados ao renomear). Na gaveta, o ⋯ de dias e turnos usa `UIDirector.openRowMenu` (Tarefa 7). Faça as Tarefas 6 e 7 em sequência; se a 7 ainda não existir, use botões ✎ 🗑 provisórios e troque na Tarefa 7.
- [ ] **Passo 3: Verificação manual:** trocar o turno e recarregar a página mantém o turno; excluir esse turno em outro aparelho e recarregar abre o primeiro turno (Review Focus 2); um dia chamado `Dia D'Ávila` aparece e pode ser editado e excluído (Review Focus 5); o código não contém mais `prompt(` (`grep -n "prompt(" public/js` não acha nada).
- [ ] **Passo 4: Commit** — `git commit -m "feat: day/shift drawer and per-device remembered shift"`

---

### Tarefa 7: Edição (⋯, exclusão com dois toques, botão +, segurar e arrastar)

**Files:**
- Modify: `public/js/ui-director.js` (remover `moveItem`, `moveMedia`, `setupMediaDragAndDrop` e a alça ⋮⋮; adicionar os helpers abaixo)
- Rewrite: `public/css/editor.css`
- Modify: `public/js/app.js` (`toggleMode` e o handler `MODE_CHANGED`: sem toasts e sem texto; só alternam a classe `is-on` e `body.mode-editor`)
- Modify: `public/index.html` (`#fab-add` com o menu `#fab-menu`, que tem as opções **Parte** e **Mídia**)

**Interfaces:**
- Consumes: `Modals.openItemModal(itemId?)`, `Modals.openMediaModal(itemId, mediaId?)`, `UIDirector.importPlaylist(itemId)`, `Api.reorderItems(shiftId, ids)`, `Api.reorderMedias(itemId, ids)`.
- Produces:
  - `UIDirector.openRowMenu(anchorEl: Element, actions: {icon, label, onClick, danger?}[])`: um único menu flutuante no `body`, posicionado junto ao `anchorEl` e dentro da tela; fecha ao tocar fora, ao rolar ou com Esc.
  - `UIDirector.confirmDelete(buttonEl: Element, onConfirm: () => Promise<void>)`: o primeiro toque adiciona `.is-armed` (vermelho, pulsando) por 3000 ms; um segundo toque nesse período chama `onConfirm`; tocar fora ou esperar desarma.
  - `UIDirector.enableLongPressReorder(listEl: Element, rowSelector: string, onReorder: (orderedIds: number[]) => Promise<void>)`: só funciona com `AppState.mode === 'editor'`; segurar por 500 ms inicia o arrasto; mover mais de 10px antes disso cancela; usa Pointer Events (toque e mouse); durante o arrasto, `touch-action: none` na linha arrastada; a tela atualiza na hora e, se der erro, recarrega os dados do turno.

- [ ] **Passo 1:** Implemente os três helpers e o botão + (spec §3). A opção **Mídia** fica desabilitada quando não há parte atual.
- [ ] **Passo 2:** Adicione o ⋯ nas linhas de parte (✎ editar · ⤓ importar playlist · 🗑 excluir) e de mídia (✎ · 🗑), visível só com `body.mode-editor`. As exclusões usam `confirmDelete`. Troque também os ⋯ e as exclusões provisórias da Tarefa 6.
- [ ] **Passo 3:** Ligue `enableLongPressReorder` na lista de partes (`Api.reorderItems`) e na lista de mídias (`Api.reorderMedias`).
- [ ] **Passo 4: Verificação manual** (toque emulado no DevTools e mouse): o ✎ pede o PIN (sessão de diretor) e a linha laranja aparece; ⋯ → 🗑 → segundo toque exclui; um toque e espera de 3 s não exclui; rolar a lista com o dedo não arrasta nem seleciona (Review Focus 3); segurar 0,5 s e arrastar reordena, e a nova ordem aparece num segundo navegador; `grep -n "confirm(" public/js` não acha nada.
- [ ] **Passo 5: Commit** — `git commit -m "feat: touch-first edit mode (row menu, two-tap delete, fab, long-press reorder)"`

---

### Tarefa 8: Formulários de parte e de mídia

**Files:**
- Modify: `public/index.html` (`#modal-item-editor`, `#modal-media-editor`)
- Modify: `public/js/modals.js` (`openItemModal`, `submitItem`, `openMediaModal`, `submitMedia`)

**Interfaces:**
- Consumes: `.modal-header` com ✕ e ✓ (Tarefa 3), `icon`, `MEDIA_TYPE_ICONS`.
- Produces: o tipo de mídia vira `<div class="type-picker" role="radiogroup">` com 6 `button[role=radio][data-type]`; o valor fica num `input type=hidden name=mediaType` (padrão `bible`).

- [ ] **Passo 1:** Faça os formulários conforme o spec §3 "Formulários": títulos "Nova parte", "Editar parte", "Nova mídia" e "Editar mídia"; sem rodapé; os rótulos dos campos são "Título", "Horário", "Orador" e "Observações"; o campo `itemActivityType` não aparece, e ao editar o valor existente é preservado (o `submitItem` envia `item.activity_type` original).
- [ ] **Passo 2:** O ✓ envia o form; Enter envia (exceto dentro de `textarea`); Esc fecha (já tratado em `app.js`).
- [ ] **Passo 3: Verificação manual:** criar, editar e salvar uma parte e uma mídia no celular e no tablet; trocar o tipo pelos ícones; salvar com o título vazio é bloqueado (`required`); uma parte que veio de um backup com `activity_type` mantém o valor depois de editada (conferir em `GET /api/shifts/:id/full`).
- [ ] **Passo 4: Commit** — `git commit -m "feat: compact part and media forms"`

---

### Tarefa 9: Telas secundárias (PIN, configurações, conexão, configuração inicial, toasts)

**Files:**
- Modify: `public/index.html` (`#modal-pin-auth`, `#modal-settings`, `#modal-lan-connect`, `#modal-initial-setup`, `#toast-container`)
- Modify: `public/js/modals.js` (PIN, `submitSetup`, configurações, `openLanModal`, `copyLanUrl`)
- Modify: `public/js/app.js` (`showToast`: duração padrão de 2000 ms; remover os toasts de sucesso que o spec manda tirar; manter erros, importação de playlist e "Endereço copiado")
- Modify: `public/js/api.js` (`logout`, se precisar fechar a gaveta de conexão)

**Interfaces:**
- Consumes: `Api.login/upgradeSession` (o 429 tem `remainingSeconds`), `Api.setup`, `Api.updateEvent`, `Api.updateEventPins`, `Api.downloadBackup`, `Api.restoreBackup`, `UIDirector.confirmDelete` (também serve para confirmar o restaurar).
- Produces: nada que outras tarefas consumam.

- [ ] **Passo 1: PIN** (spec §4 "PIN"): 4 bolinhas; o teclado tem 1–9, C, 0 e ⌫ (sem ✓); ao digitar o 4º dígito chama `submitPin` sozinho; um erro 401 aplica `.is-error` (vermelho e tremendo por 400 ms) e limpa o PIN; um erro 429 mostra `Aguarde ${remainingSeconds}s` numa linha. Remova o título e o parágrafo da janela; mostre só o quadrado laranja. `handlePinDigit` ignora dígitos além do 4º.
- [ ] **Passo 2: Configurações** (spec §4): uma lista com três seções (Evento, PINs, Backup), sem abas; remova `switchModalTab` de `app.js`; os campos de PIN usam `pattern="[0-9]{4}"` e `inputmode="numeric"`; o restaurar usa `confirmDelete` no botão.
- [ ] **Passo 3: Conexão** (spec §4): QR code, endereço (tocar copia e mostra o toast "Endereço copiado") e botão de sair (`icon('logout')` + "Sair").
- [ ] **Passo 4: Configuração inicial:** só nome do evento, PIN do diretor e PIN de admin (4 dígitos, `inputmode="numeric"`); envie `firstDayLabel:'Dia 1'` e `firstShiftName:'Geral'`, e não envie `category` nem `firstDayDate`. O servidor continua criando as partes de exemplo.
- [ ] **Passo 5: Verificação manual:** com o banco movido para fora de `data/` (para testar a configuração inicial; restaure depois), configurar o evento com PINs de 4 dígitos; ao entrar, o PIN errado treme; 5 erros mostram "Aguarde Ns"; o certo entra sem precisar de toque extra; trocar os PINs; baixar e restaurar o backup (dois toques); copiar o endereço; sair.
- [ ] **Passo 6: Commit** — `git commit -m "feat: redesigned PIN, settings, connection and setup screens"`

---

### Tarefa 10: Limpeza e verificação final

**Files:**
- Modify: qualquer arquivo com restos do visual antigo

- [ ] **Passo 1:** Busque restos e remova o que for código morto: `grep -rnE "badge-|spotlight-card|glass|accent-primary|Modo Diretor|AO VIVO|CONCLUÍDO|Item [0-9]|📖|🎬|✏️|🗑️|style=\"" public/`. Estilos inline só ficam onde o valor é dinâmico (ex.: `width` de progresso).
- [ ] **Passo 2:** `npm test`. Esperado: todos passam.
- [ ] **Passo 3: Lista de conferência** em 390×844 (celular) e 1024×768 (tablet), com toque emulado: login com PIN; marcar mídias; conclusão automática; ◀ ▶ ☰; pular de parte; trocar de turno + recarregar; ligar e desligar a edição; ⋯ editar, importar playlist (`.jwlplaylist`) e excluir; botão + Parte e + Mídia; segurar e arrastar partes e mídias; configurações; conexão; sair. Sem erros no console e sem nenhuma requisição externa na aba Network.
- [ ] **Passo 4: Commit** — `git commit -m "chore: remove leftovers from old UI"`
