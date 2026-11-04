# Importar backup do JW Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar um `.jwlibrary` criando uma parte por playlist (com suas mídias) num turno escolhido, acrescentando ou substituindo, e unificar a leitura com o import de `.jwlplaylist`.

**Architecture:** Um módulo `jwl-reader.js` extrai só o `userData.db` do zip e lê as playlists com `node:sqlite`. `db.js` cria as partes numa transação. Uma rota nova recebe o arquivo; a rota de `.jwlplaylist` passa a usar o mesmo leitor. A tela usa `Modals.askChoice` para turno e modo.

**Tech Stack:** Node 24 (`node:sqlite`, `zlib.crc32` nos testes), Express 5, multer, unzipper, JS puro no navegador, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-03-importar-jwlibrary-design.md`

## Global Constraints

- Mensagens exatas: `Arquivo do JW Library inválido.`, `Nenhuma playlist com itens neste arquivo.`, `Arquivo .jwlibrary não fornecido.`, `Turno não encontrado.`, `Este turno já tem N partes.` (`1 parte`), toast `N partes importadas, M mídias.` (`1 parte importada`, `1 mídia`).
- Opções: **Acrescentar abaixo** (`append`, ícone `plus`, `accent`), **Substituir** (`replace`, ícone `trash`, `danger`); título `Importar JW Library`.
- Classificação: `FilePath` com extensão de imagem → `image`, de vídeo → `video`; `Location.Type = 3` → `video`; rótulo bíblico (regex atual de server.js) → `bible`; senão `other`. Título via `playlistMediaTitle` existente; base = rótulo, ou nome do arquivo sem extensão, ou `Mídia N`. Observação `''`.
- Parte: título = nome da playlist aparado (vazio → `Playlist N`); horário = última parte do turno antes da importação, senão `start_time` do turno, senão `00:00` (com Substituir, ignora as partes que serão apagadas).
- Playlists em ordem de `Tag.TagId`; itens em ordem de `TagMap.Position`; só `Tag.Type = 2` com itens.
- Nada é alterado em erro (transação; validação antes de apagar).
- O pacote `sqlite3` sai de `package.json`/`package-lock.json` com `npm install --package-lock-only` (nunca mexer em `node_modules`: ele é compartilhado com o app em uso).
- Nunca abrir `data/eventos.db` (rastreado pelo git): testes usam diretório temporário; servidor de teste com `EVENTOS_DB_PATH=<temp> PORT=3999`, encerrado pelo PID. O `teste_total.jwlibrary` do usuário não entra no repositório.
- Sem dependências novas. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Arquivo que não é zip ou zip sem `userData.db` → 400 `Arquivo do JW Library inválido.`, nada muda (Task 1 teste do `extractUserDb`; Task 3 verificação ao vivo com um `.txt` renomeado).
2. Substituir com arquivo inválido não apaga as partes do turno (Task 3 verificação ao vivo).
3. Turno com Sentinela + Substituir: a Sentinela some e o turno aceita criar outra depois (Task 2 teste: partes apagadas; `shiftHasSentinela` já usa a lista atual).
4. `.jwlplaylist` continua importando igual (Task 1 verificação ao vivo com os dois arquivos em `~/Downloads`).
5. Item sem rótulo e sem arquivo → `Mídia N` (Task 1 teste).

---

### Task 1: Leitor do JW Library e rota de `.jwlplaylist`

**Files:**
- Create: `jwl-reader.js`, `test/jwl-reader.test.js`
- Modify: `server.js` (rota `POST /api/items/:itemId/import-playlist`), `package.json`, `package-lock.json`

**Interfaces:**
- Produces:
  - `readPlaylists(dbPath: string) -> Array<{ name: string, medias: Array<{ title: string, type: 'bible'|'image'|'video'|'other', reference: '' }> }>`
  - `extractUserDb(zipPath: string, destDir: string) -> Promise<string>` (caminho do `userData.db` extraído)
  - ambos lançam `Error('Arquivo do JW Library inválido.')` para banco ou zip inválido.

- [ ] **Step 1: Testes que falham** em `test/jwl-reader.test.js`. Um helper de teste `makeUserDb(dir)` cria com `node:sqlite` as tabelas `Tag(TagId, Type, Name)`, `TagMap(TagMapId, TagId, PlaylistItemId, Position)`, `PlaylistItem(PlaylistItemId, Label, StartTrimOffsetTicks, EndTrimOffsetTicks, EndAction)`, `PlaylistItemIndependentMediaMap(PlaylistItemId, IndependentMediaId)`, `IndependentMedia(IndependentMediaId, FilePath, MimeType)`, `PlaylistItemLocationMap(PlaylistItemId, LocationId)`, `Location(LocationId, Type, KeySymbol, BookNumber)` com: playlist 10 "Discurso" (itens: "Mateus 4:4" com Location Type 0, EndAction 0; "Lembre-se da morte de Jesus" com Location Type 3, EndAction 2; "foto.JPG" com IndependentMedia `x.JPG`, trim de início 10, EndAction 2), playlist 11 "Vazia" sem itens, playlist 12 "  Outra  " (item sem rótulo e sem arquivo/location, EndAction 2), e uma Tag Type 1 "pedro". Um helper `makeZip(entries)` monta um zip "stored" (método 0) com `zlib.crc32`.

```js
test('lê playlists com itens, em ordem, com tipos e regras', () => {
  const lists = readPlaylists(makeUserDb(tmp()));
  assert.deepEqual(lists.map(p => p.name), ['Discurso', 'Outra']);
  assert.deepEqual(lists[0].medias.map(m => m.type), ['bible', 'video', 'image']);
  assert.equal(lists[0].medias[0].title, 'Mateus 4:4 - "Continuar"');
  assert.equal(lists[0].medias[1].title, 'Lembre-se da morte de Jesus');
  assert.match(lists[0].medias[2].title, /"Editado"/);
  assert.deepEqual(lists[1].medias.map(m => [m.title, m.type]), [['Mídia 1', 'other']]);
  assert.ok(lists.every(p => p.medias.every(m => m.reference === '')));
});

test('banco sem as tabelas do JW Library é inválido', () => {
  const p = path.join(tmp(), 'x.db'); new DatabaseSync(p).exec('CREATE TABLE A(x)');
  assert.throws(() => readPlaylists(p), /Arquivo do JW Library inválido\./);
});

test('extractUserDb extrai só o userData.db; zip sem ele é inválido', async () => {
  const dir = tmp();
  const zip = path.join(dir, 'b.jwlibrary');
  fs.writeFileSync(zip, makeZip({ 'manifest.json': '{}', 'userData.db': fs.readFileSync(makeUserDb(tmp())), 'big.jpg': Buffer.alloc(1000) }));
  const out = await extractUserDb(zip, path.join(dir, 'out'));
  assert.equal(path.basename(out), 'userData.db');
  assert.deepEqual(fs.readdirSync(path.dirname(out)), ['userData.db']);
  const bad = path.join(dir, 'c.zip'); fs.writeFileSync(bad, makeZip({ 'a.txt': 'x' }));
  await assert.rejects(extractUserDb(bad, path.join(dir, 'out2')), /Arquivo do JW Library inválido\./);
  const notZip = path.join(dir, 'd.jwlibrary'); fs.writeFileSync(notZip, 'texto');
  await assert.rejects(extractUserDb(notZip, path.join(dir, 'out3')), /Arquivo do JW Library inválido\./);
});
```
  (`makeUserDb` devolve o caminho do banco criado.)
- [ ] **Step 2: Rodar** `npm test` — esperado: FAIL (módulo inexistente).
- [ ] **Step 3: Implementar `jwl-reader.js`.** Mover para lá as listas de extensões e a regex bíblica da rota atual (a rota passa a usar o módulo). Uma consulta por playlist com `LEFT JOIN` em `PlaylistItemIndependentMediaMap`/`IndependentMedia` e `PlaylistItemLocationMap`/`Location`; um item com várias linhas de join conta uma vez (agrupar por `PlaylistItemId`, mantendo `Position`). `extractUserDb` usa `unzipper.Open.file(zipPath)` e extrai só a entrada `userData.db`.
- [ ] **Step 4: Rota de `.jwlplaylist`.** Trocar a leitura por `extractUserDb` + `readPlaylists`, juntando as mídias de todas as playlists em ordem; manter `mode`, `importMedias`, a regra "playlist vazia não apaga", as respostas atuais e a limpeza de arquivos (`finally`). Remover `sqlite3` de `package.json` e rodar `npm install --package-lock-only`.
- [ ] **Step 5: Rodar** `npm test` — esperado: PASS. **Verificação ao vivo** (banco temporário, porta 3999): importar `~/Downloads/dede_e_Marina.jwlplaylist` e `~/Downloads/Discurso_46_Fortaleça_sua_confiança_em_Jeová_(LS).jwlplaylist` numa parte; conferir títulos e tipos em `/api/shifts/:id/full`. `git status` sem `data/` e sem `node_modules`.
- [ ] **Step 6: Commit** `feat: shared JW Library reader (node:sqlite), video detection; drop sqlite3`

---

### Task 2: Criar partes a partir das playlists

**Files:**
- Modify: `db.js`
- Test: `test/db.test.js`

**Interfaces:**
- Consumes: formato de `readPlaylists` (Task 1).
- Produces: `queries.importPlaylistsAsParts(shiftId: number, playlists, replace: boolean, scheduledTime: string) -> { partsCount: number, mediasCount: number }`.

- [ ] **Step 1: Testes que falham** em `test/db.test.js` (acrescentar no fim; usar um turno novo criado no próprio teste, pois testes anteriores restauram o evento):

```js
test('importPlaylistsAsParts acrescenta partes no fim do turno', () => {
  const sid = freshShift(); // cria dia + turno no evento ativo
  queries.createItem(sid, 'Existente', '09:00', '', '', '', 1);
  const r = queries.importPlaylistsAsParts(sid, [
    { name: 'A', medias: [{ title: 'm1', type: 'bible', reference: '' }, { title: 'm2', type: 'image', reference: '' }] },
    { name: 'B', medias: [{ title: 'm3', type: 'video', reference: '' }] }
  ], false, '09:00');
  assert.deepEqual(r, { partsCount: 2, mediasCount: 3 });
  const items = queries.getItemsByShift(sid);
  assert.deepEqual(items.map(i => [i.title, i.scheduled_time, i.order_num]), [['Existente', '09:00', 1], ['A', '09:00', 2], ['B', '09:00', 3]]);
  assert.deepEqual(queries.getMediasByItem(items[1].id).map(m => [m.title, m.order_num]), [['m1', 1], ['m2', 2]]);
});

test('importPlaylistsAsParts substitui as partes do turno', () => {
  const sid = freshShift();
  const old = queries.createItem(sid, 'Velha', '08:00', '', '', 'sentinela', 1, 901);
  queries.createMedia(old, '?', 'question', '', 1, { paragraph: 1, side: 'left', person: 'X' });
  queries.setShiftCurrentItem(sid, old);
  queries.importPlaylistsAsParts(sid, [{ name: 'Nova', medias: [{ title: 'm', type: 'other', reference: '' }] }], true, '10:00');
  assert.deepEqual(queries.getItemsByShift(sid).map(i => i.title), ['Nova']);
  assert.equal(queries.getMediasByItem(old).length, 0);
  assert.equal(queries.getShift(sid).current_item_id, null);
});

test('importPlaylistsAsParts não muda nada se falhar no meio', () => {
  const sid = freshShift();
  queries.createItem(sid, 'Fica', '08:00', '', '', '', 1);
  assert.throws(() => queries.importPlaylistsAsParts(sid, [{ name: 'X', medias: [{ title: null, type: 'other', reference: '' }] }], true, '10:00'));
  assert.deepEqual(queries.getItemsByShift(sid).map(i => i.title), ['Fica']);
});
```
- [ ] **Step 2: Rodar** `npm test` — esperado: FAIL.
- [ ] **Step 3: Implementar** com `BEGIN`/`COMMIT`/`ROLLBACK` como `importMedias`: `replace` → `UPDATE shifts SET current_item_id = NULL` e `DELETE FROM items WHERE shift_id = ?`; ordem das novas partes continua do maior `order_num` existente; título vazio → `Playlist N` (N = posição na lista recebida, começando em 1).
- [ ] **Step 4: Rodar** `npm test` — esperado: PASS.
- [ ] **Step 5: Commit** `feat: create parts from JW Library playlists in one transaction`

---

### Task 3: Rota de importação e tela

**Files:**
- Modify: `server.js`, `public/index.html` (opção do menu +), `public/js/ui-director.js` (`bindFab`), `public/js/app.js` (ou `modals.js`, onde ficar o fluxo), `public/js/api.js` se precisar de um método de upload

**Interfaces:**
- Consumes: `extractUserDb`, `readPlaylists` (Task 1); `queries.importPlaylistsAsParts` (Task 2); `Modals.askChoice`; `AppState.days`, `AppState.selectShift(dayId, shiftId)`.
- Produces: `POST /api/shifts/:id/import-jwlibrary` (multipart `file`, `mode`) → `{ success, partsCount, mediasCount }`.

- [ ] **Step 1: Rota** conforme a Seção "Rota nova" do spec e as mensagens das Global Constraints. Ordem: turno existe → arquivo existe → extrair/ler (erro → 400, nada muda) → sem playlists → 400 → horário (Global Constraints) → `importPlaylistsAsParts` → `broadcast('PROGRAM_UPDATED', { shiftId })` → resposta. Limpeza do upload e da pasta temporária em `finally`.
- [ ] **Step 2: Tela.** Opção `data-fab="jwlibrary"` "Importar JW Library" (ícone `download`) no menu +, visível só no modo editor como o resto do menu. Fluxo: `<input type="file" accept=".jwlibrary">` → `askChoice` de turno (um botão por turno, rótulo `Dia · Turno`, o selecionado primeiro com `style: 'accent'`, os outros sem estilo) → se o turno tem partes, `askChoice` Acrescentar/Substituir (texto com N do turno escolhido: usar `AppState.shiftData.items` se for o turno atual, senão buscar `/api/shifts/:id/full`) → envio com `FormData` (`file`, `mode`) → toast de sucesso → `AppState.selectShift` do destino e recarregar dados; erro → toast com a mensagem. ✕ em qualquer escolha cancela.
- [ ] **Step 3: Verificação ao vivo** (banco temporário, porta 3999) com `~/Downloads/teste_total.jwlibrary` via `curl`: `append` num turno com 1 parte → `partsCount 7`, `mediasCount 55`, partes no fim com o horário da última parte; `replace` → só as 7 partes; um `.txt` renomeado para `.jwlibrary` com `replace` → 400 `Arquivo do JW Library inválido.` e as partes continuam. No navegador sem tela (`/usr/bin/brave-browser --headless --no-sandbox`, via CDP como nas tarefas anteriores do projeto), percorrer o fluxo da tela até o toast e capturar a tela no scratchpad. `npm test` PASS; `git status` sem `data/`.
- [ ] **Step 4: Commit** `feat: import a JW Library backup as parts of a chosen shift`
