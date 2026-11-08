# AGENTS.md — EventosAPP

App web local (LAN) para operar eventos ao vivo: programação por dia/turno/parte, checklist de mídias, modo Diretor e modo Edição, sincronização em tempo real.

## Stack
- Node.js 24 (usa `node:sqlite` `DatabaseSync`, sem ORM), CommonJS.
- Express 5, `ws` (WebSocket no mesmo servidor HTTP), `bcryptjs`, `qrcode`, `multer` (upload), `unzipper` (ler `.jwlplaylist`/`.jwlibrary`).
- Frontend: SPA em HTML/CSS/JS puro em `public/`, sem build. Scripts globais (`window.Logic`, `AppState`, `Api`, `Modals`...).

## Comandos
- Rodar: `npm start` (porta `PORT`, padrão 3000, escuta em `0.0.0.0`).
- Testes: `npm test` (`node --test test/*.test.js`).
- Banco alternativo: `EVENTOS_DB_PATH=/caminho/x.db` — use sempre em testes e experimentos para não tocar em `data/eventos.db` (banco real, versionado).

## Estrutura
- `server.js` — rotas REST `/api/*`, broadcast WebSocket, validações de entrada (`check*`).
- `db.js` — schema, migrações (`ALTER TABLE` em try/catch) e todas as queries (`queries.*`); transações manuais com `BEGIN/COMMIT/ROLLBACK`.
- `auth.js` — hash de PIN, sessões (tabela `sessions`), rate limit em memória, middleware `authenticate(role)`.
- `pin.js`, `playlist-title.js`, `jwl-reader.js` — módulos puros/isolados (testáveis sem o banco).
- `public/js/logic.js` — lógica pura compartilhada entre navegador e Node (UMD); o servidor importa validações dele.
- `public/js/` — `api.js` (fetch + WS), `state.js`, `app.js`, `ui-director.js`, `modals.js`, `print-program.js`, `photo-cropper.js`, `icons.js`.
- `test/` — testes `node:test`; `db.test.js` define `EVENTOS_DB_PATH` antes de `require('../db')`.
- `docs/superpowers/` — specs e planos de features.

## Convenções e cuidados
- Textos de UI e mensagens de erro em português; comentários em inglês ou português.
- Papéis: `director` (navegar, marcar concluído) e `admin` (editar estrutura). Rotas de escrita estrutural usam `authenticate('admin')`.
- PIN tem exatamente 4 dígitos (`pin.js`).
- Toda mudança de dados deve chamar `broadcast(TIPO, ...)` para os outros clientes atualizarem (`PROGRAM_UPDATED`, `EVENT_UPDATED`, `CAMERA_PLANS_UPDATED`, etc.).
- Ao renderizar dados do banco no frontend, escape sempre (`Logic.escapeHtml`/`uiEsc`).
- Lógica nova sem DOM deve ir para `logic.js` com teste em `test/logic.test.js`.
- Mídias do tipo `question` só existem em parte `sentinela`; uma Sentinela por turno, e ela exige número de discurso (único por evento).
- Fotos são data URLs webp/jpeg até ~100 KB (`isValidPhoto`).
- `.worktrees/` contém worktrees git de features; não edite lá ao trabalhar no `master`.
