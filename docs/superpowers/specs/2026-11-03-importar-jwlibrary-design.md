# Importar backup do JW Library (.jwlibrary) — Design

**Data:** 2026-11-03
**Status:** aprovado em conversa, aguardando revisão do documento

## Objetivo

Importar um backup do JW Library (`.jwlibrary`) e transformar **cada playlist com itens em uma parte** de um turno escolhido, com as mídias da playlist, sem cadastrar parte por parte.

## O arquivo

- Zip com `manifest.json`, `userData.db` (SQLite) e os arquivos de mídia (imagens, miniaturas).
- Playlists: `Tag` com `Type = 2`; itens em `TagMap` (`TagId`, `PlaylistItemId`, `Position`); dados em `PlaylistItem` (`Label`, `StartTrimOffsetTicks`, `EndTrimOffsetTicks`, `EndAction`).
- Item com arquivo próprio: `PlaylistItemIndependentMediaMap` → `IndependentMedia` (`FilePath`, `MimeType`).
- Item do jw.org ou da Bíblia: `PlaylistItemLocationMap` → `Location` (`Type`, `KeySymbol`, `BookNumber`). `Location.Type = 3` é vídeo.
- Outras tabelas (notas, favoritos, marcações) são ignoradas.
- Exemplo analisado (`teste_total.jwlibrary`, 50 MB): 9 playlists, 7 com itens, 55 itens.

## Decisões

- Todas as playlists com itens são importadas; as vazias são ignoradas sem aviso.
- Entrada pelo menu **+** do modo editor: **"Importar JW Library"**. O botão Restaurar continua só para o backup do app.
- O usuário escolhe o **turno de destino**; depois, se o turno já tem partes, **Acrescentar abaixo** ou **Substituir**.
- Mídias seguem as regras do import de playlist atual (tipo, `"Continuar"`, `"Repetir"`, `"Editado"`, observação em branco).
- Vídeos do jw.org (`Location.Type = 3`) passam a entrar como **Vídeo**, também no import de `.jwlplaylist`.
- Os arquivos de mídia não são copiados para o app.

## Fora do escopo

- Escolher quais playlists importar ou reordenar antes de importar.
- Dividir as playlists entre vários turnos.
- Importar notas, favoritos ou marcações.

## Fluxo na tela

1. Modo editor → **+ → Importar JW Library** → seletor de arquivo (`accept=".jwlibrary"`).
2. **Turno de destino:** `Modals.askChoice` com um botão por turno do evento (`"Dia · Turno"`), o turno selecionado primeiro e destacado (`style: 'accent'`). ✕ cancela.
3. Se o turno escolhido tem partes: `Modals.askChoice` com título `Importar JW Library`, texto `Este turno já tem N partes.` (singular `1 parte`), opções **Acrescentar abaixo** (`append`, ícone `plus`, `accent`) e **Substituir** (`replace`, ícone `trash`, `danger`). ✕ cancela. Turno vazio → `append` direto.
4. Envio para a rota nova. Sucesso → toast `N partes importadas, M mídias.` (singulares `1 parte importada`, `1 mídia`), o app seleciona o turno de destino e recarrega.
5. Erro → toast com a mensagem do servidor; nada muda.

## Parte criada

- **Título:** nome da playlist (aparado; vazio → `Playlist N`).
- **Horário:** o `scheduled_time` da última parte do turno antes da importação; turno vazio (ou com Substituir) → `start_time` do turno; sem `start_time` → `00:00`.
- Demais campos vazios; não é discurso nem Sentinela.
- **Mídias:** na ordem de `TagMap.Position`.

## Classificação da mídia

Para cada item, em ordem:
1. Com `IndependentMedia.FilePath`: extensão de imagem → `image`; de vídeo → `video`.
2. Com `Location.Type = 3` → `video`.
3. Rótulo que casa o padrão de texto bíblico atual → `bible`.
4. Senão → `other`.

Título: `playlistMediaTitle(base, row)` (existente), com `base` = rótulo, ou o nome do arquivo sem extensão, ou `Mídia N`.

## Servidor

### Módulo `jwl-reader.js` (raiz)

- `readPlaylists(dbPath) -> [{ name: string, medias: [{ title, type, reference: '' }] }]` em ordem de `Tag.TagId`, só playlists com itens.
- Usa `node:sqlite` em modo somente leitura (`new DatabaseSync(path, { readOnly: true })`).
- Banco sem as tabelas esperadas → lança `Error('Arquivo do JW Library inválido.')`.
- `extractUserDb(zipPath, destDir) -> Promise<string>`: extrai **apenas** `userData.db` do zip (unzipper); sem essa entrada → `Error('Arquivo do JW Library inválido.')`.

### `.jwlplaylist` (rota existente)

- `POST /api/items/:itemId/import-playlist` passa a usar `extractUserDb` + `readPlaylists`, juntando as mídias de todas as playlists do arquivo (o `.jwlplaylist` traz uma só). Comportamento e respostas iguais aos de hoje.
- O pacote `sqlite3` sai de `package.json`.

### Rota nova `POST /api/shifts/:id/import-jwlibrary` (admin)

- `multipart/form-data`: `file` (o `.jwlibrary`), `mode` (`append` | `replace`; outro valor = `append`).
- Turno inexistente → 404 `Turno não encontrado.`.
- Sem arquivo → 400 `Arquivo .jwlibrary não fornecido.`.
- Inválido ou sem playlists com itens → 400 `Arquivo do JW Library inválido.` / `Nenhuma playlist com itens neste arquivo.`; nada é alterado.
- `db.js` → `importPlaylistsAsParts(shiftId, playlists, replace, scheduledTime)` numa transação: com `replace`, apaga as partes do turno (as mídias caem em cascata; `current_item_id` do turno vira `NULL`); cria as partes em ordem no fim do turno e as mídias de cada uma. Erro → `ROLLBACK`.
- Resposta `{ success: true, partsCount, mediasCount }`; `broadcast('PROGRAM_UPDATED', { shiftId })`.
- Arquivo enviado e pasta temporária apagados em `finally`.

## Testes

- `test/jwl-reader.test.js` monta um `userData.db` mínimo no diretório temporário com `node:sqlite` (tabelas `Tag`, `TagMap`, `PlaylistItem`, `PlaylistItemIndependentMediaMap`, `IndependentMedia`, `PlaylistItemLocationMap`, `Location`):
  - duas playlists com itens e uma vazia → duas playlists, na ordem;
  - texto bíblico → `bible`; vídeo do jw.org (`Location.Type = 3`) → `video`; arquivo `.jpg` → `image`; outro → `other`;
  - `EndAction = 0` → `- "Continuar"`; trim → `"Editado"`;
  - banco sem `Tag` → erro `Arquivo do JW Library inválido.`
- `test/db.test.js`: `importPlaylistsAsParts` acrescentando (partes no fim, horário dado, mídias em ordem) e substituindo (partes antigas e suas mídias somem); falha no meio (ex.: mídia sem título) → nada muda.
- Verificação ao vivo em banco temporário com `~/Downloads/teste_total.jwlibrary`: Acrescentar e Substituir → 7 partes, 55 mídias; `.jwlplaylist` de exemplo continua importando.
