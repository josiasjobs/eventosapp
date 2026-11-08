# Modelo inicial sem PINs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Popular novas instalações com a programação-modelo e impedir que PINs ou hashes circulem em backups.

**Architecture:** Um JSON estático sanitizado conterá apenas a hierarquia de programação e os planos de câmera. `db.js` ganhará uma rotina reutilizável para popular um evento existente; a configuração inicial a chamará logo após criar o evento com os PINs informados. A restauração continuará criando uma cópia do evento, mas usará exclusivamente os hashes do evento ativo.

**Tech Stack:** Node.js 24, `node:sqlite`, Express 5, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-08-modelo-inicial-sem-pins-design.md`

## Global Constraints

- Não adicionar dependências.
- O modelo não pode conter `event`, `director_pin_hash` ou `admin_pin_hash`.
- A configuração inicial usa o nome e os PINs enviados pelo usuário.
- Exports e restores não podem substituir PINs do evento ativo.

## Review Focus

- Modelo sem PINs: teste de que o JSON versionado não contém chaves de PIN/hash.
- Nova instalação: teste de que o `POST /api/setup` traz toda a hierarquia e planos do modelo.
- Dados da instalação: teste de que o nome e ambos os PINs vêm da configuração inicial, não do modelo.
- Export: teste de que o payload exportado omite hashes de PIN.
- Restore: teste de que hashes maliciosos ou legados no JSON não alteram os PINs ativos.

---

### Task 1: Modelo sanitizado e importação de hierarquia

**Files:**
- Create: `seed/default-event.json`
- Modify: `db.js: restoreEventBackup` e novo helper de população
- Test: `test/db.test.js`

**Interfaces:**
- Produces: `queries.populateEventFromTemplate(eventId, template)`; importa `camera_plans` e `days` para um evento existente.
- Consumes: o formato de hierarquia já produzido por `getFullEventBackup()`.

- [ ] **Step 1: Write the failing tests**

Teste que o modelo não possui campos de evento/PIN e que `populateEventFromTemplate` cria dias, turnos, itens, mídias, fotos e planos a partir dele.

- [ ] **Step 2: Run the focused database test to verify it fails**

Run: `node --test test/db.test.js`
Expected: FAIL porque o helper ainda não existe ou o modelo não existe.

- [ ] **Step 3: Create the sanitized model and implement `populateEventFromTemplate(eventId, template)` in `db.js`**

Extraia do backup fornecido somente `camera_plans` e `days`. Reutilize a lógica de inserção da restauração, preservando ordem, fotos e referências de planos por sigla.

- [ ] **Step 4: Make `restoreEventBackup(backupData)` always keep hashes from the active event**

Remova o parâmetro de escolha de PIN. Ignore quaisquer hashes presentes no backup e mantenha a validação de evento ativo.

- [ ] **Step 5: Run the focused database test to verify it passes**

Run: `node --test test/db.test.js`
Expected: PASS.

### Task 2: Configuração inicial e exportação sem credenciais

**Files:**
- Modify: `server.js: POST /api/setup` e rota de restauração
- Modify: `db.js: getFullEventBackup`
- Modify: `public/index.html: seção de restauração`
- Modify: `public/js/api.js: restoreBackup`
- Modify: `public/js/modals.js: restoreEventBackup`
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: `queries.populateEventFromTemplate(eventId, template)` e `seed/default-event.json`.
- Produces: uma configuração inicial povoada pelo modelo e uma API de restauração sem `keepPins`.

- [ ] **Step 1: Write the failing server tests**

Teste em banco isolado que `POST /api/setup` usa o nome/PINs enviados, importa as contagens do modelo e que o export não inclui hashes dos PINs.

- [ ] **Step 2: Run the focused server test to verify it fails**

Run: `node --test test/server.test.js`
Expected: FAIL porque a configuração ainda cria os exemplos antigos ou o export contém hashes.

- [ ] **Step 3: Load the model in `server.js` and use it in `POST /api/setup`**

Após `createEvent`, chame o helper com o JSON do modelo e defina como atual o primeiro item do primeiro turno quando existir. Não use nome, categoria ou PINs do modelo.

- [ ] **Step 4: Remove credentials from exports and the UI/API option to restore them**

Exclua hashes em `getFullEventBackup`; remova `keepPins` do endpoint, cliente e checkbox. O restore chama a nova assinatura que preserva PINs.

- [ ] **Step 5: Run the focused server test to verify it passes**

Run: `node --test test/server.test.js`
Expected: PASS.

### Task 3: Regressão completa

**Files:**
- Test: `test/*.test.js`

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: todas as suítes passam sem tocar em `data/eventos.db`.

- [ ] **Step 2: Inspect version-control state**

Run: `git diff --check && git status --short`
Expected: sem erros de whitespace e apenas os arquivos desta alteração, além da remoção já preparada de `data/eventos.db`.

### Task 4: Guia de instalação e uso

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document installation and startup**

Explique os pré-requisitos e os comandos `npm install` e `npm start`, nessa ordem.

- [ ] **Step 2: Document how the application works**

Descreva os papéis Diretor e Administrador, organização de evento/programação/mídias, uso pela rede local e o fluxo de configuração e operação.

- [ ] **Step 3: Verify rendered Markdown and working commands**

Run: `npm test && git diff --check`
Expected: testes passam e não há erros de whitespace.
