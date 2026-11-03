# Exportação em PDF da Lista de Mídias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir salvar ou imprimir em PDF a lista de mídias da parte atualmente selecionada.

**Architecture:** Um módulo de frontend puro recebe o contexto da parte e retorna um documento HTML completo, seguro e formatado para A4. O controlador de Diretor disponibiliza a ação e abre uma janela temporária para chamar o diálogo nativo `window.print()`, sem endpoint ou dependência nova.

**Tech Stack:** Vanilla JavaScript, HTML/CSS de impressão do navegador, Node.js test runner.

**Spec:** `docs/superpowers/specs/2026-10-23-exportar-lista-de-midias-design.md`

## Global Constraints

- Não adicionar dependências nem endpoints; a impressão deve continuar disponível offline.
- Usar somente o item atual e o contexto já carregados em `AppState`.
- Escapar todo conteúdo dinâmico antes de interpolá-lo no HTML do documento.
- Não alterar a ordem, o estado ou qualquer outro dado operacional.
- Abrir o diálogo nativo para imprimir ou salvar como PDF, não gerar download automático.

## Review Focus

- Texto de evento, título ou referência contendo HTML deve aparecer como texto, nunca como marcação executável.
- Parte sem mídias deve gerar documento válido com estado vazio e não travar a operação.
- Referência, responsável e contexto ausentes não devem deixar rótulos vazios ou `undefined` no PDF.
- Itens concluídos e pendentes devem permanecer distinguíveis em impressão monocromática.
- Popup bloqueado ou falha ao abrir a janela deve informar uma ação recuperável sem modificar o estado.

---

### Task 1: Gerador seguro do documento imprimível

**Files:**
- Create: `public/js/print-media-list.js`
- Create: `test/print-media-list.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `context` com `{ eventName, dayLabel, shiftName, item: { title, scheduled_time, speaker, medias[] }, generatedAt }`.
- Produces: `window.MediaListPrint.escapeHtml(value) -> string` e `window.MediaListPrint.buildDocument(context) -> string`.

- [ ] **Step 1: Write failing tests for escaping and complete-document rendering**

Cover título com `<script>`, item sem mídias, campos opcionais ausentes e a presença de dados de evento, parte e mídias ordenadas no HTML.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test test/print-media-list.test.js`  
Expected: FAIL porque o módulo e suas funções ainda não existem.

- [ ] **Step 3: Implement the pure print-document module**

Implement `escapeHtml(value)` e `buildDocument(context)` em `public/js/print-media-list.js`, expondo-as para navegador e CommonJS. O documento terá `@page` A4, cabeçalho operacional, metadados da parte, progresso, tabela de mídias e estilos de status que não dependam de cor.

- [ ] **Step 4: Add the Node test command and run focused tests**

Run: `npm test -- --test-name-pattern="print"`  
Expected: PASS para os testes de geração HTML.

- [ ] **Step 5: Commit the generator and its tests**

```bash
git add package.json public/js/print-media-list.js test/print-media-list.test.js
git commit -m "feat: add printable media list document"
```

### Task 2: Ação de impressão na tela do Diretor

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/ui-director.js`
- Modify: `public/css/director.css`
- Modify: `test/print-media-list.test.js`

**Interfaces:**
- Consumes: `MediaListPrint.buildDocument(context)` de Task 1 e `AppState` atual.
- Produces: `UIDirector.printCurrentMediaList() -> void` e um botão acessível "Gerar PDF" na seção de mídias.

- [ ] **Step 1: Write a failing test for the printable context**

Extraia ou exporte uma função pura que monte o contexto com `event`, dia, turno e item, e verifique que devolve rótulos corretos quando dia/turno ou responsável estiverem ausentes.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test test/print-media-list.test.js`  
Expected: FAIL porque o construtor de contexto ainda não existe.

- [ ] **Step 3: Load the module and implement `UIDirector.printCurrentMediaList()`**

Carregue `print-media-list.js` antes de `ui-director.js`; crie o contexto a partir de `AppState`, abra uma janela temporária com `window.open`, escreva o documento, espere o carregamento e execute `print()`. Se não existir item ou a janela for bloqueada, use `showToast` com instrução clara.

- [ ] **Step 4: Render the "Gerar PDF" button and its restrained UI style**

Posicione-o ao lado das ações da seção “Mídias do Item”, mantendo o botão disponível em Diretor e Edição, com rótulo explícito e sem interferir nas ações de importar/adicionar.

- [ ] **Step 5: Run the full test command and manually verify the print flow**

Run: `npm test`  
Expected: PASS. Em navegador, selecione uma parte com mídias, abra "Gerar PDF", confirme cabeçalho, ordem, status e que o diálogo de impressão é aberto; repita com parte sem mídias e popup bloqueado.

- [ ] **Step 6: Commit the integration**

```bash
git add public/index.html public/js/ui-director.js public/css/director.css test/print-media-list.test.js
git commit -m "feat: print media list as PDF"
```

## Self-review

- Cobertura: Task 1 atende conteúdo, segurança, A4, offline e estados vazios; Task 2 atende descoberta na interface, contexto, fluxo nativo e falha de popup.
- Interfaces: o único contrato compartilhado é `MediaListPrint.buildDocument(context)`; a integração monta esse contexto antes de abrir a janela.
- Review Focus: cada item está coberto por testes de renderização/contexto ou pela verificação manual da Task 2.
- Proporção: duas tarefas separadas por limite claro — documento puro testável e integração DOM — sem alterar backend ou modelo de dados.
