# Foto do participante (Sentinela) — Design

**Data:** 2026-11-03
**Status:** aprovado em conversa, aguardando revisão do documento
**Base:** `docs/superpowers/specs/2026-11-03-sentinela-design.md` (a coluna `medias.photo` já existe e hoje fica sempre vazia)

## Objetivo

Anexar a foto 3x4 de cada participante da Sentinela para o diretor reconhecer quem está no palco. A foto é enquadrada à mão e reduzida e comprimida automaticamente, para ficar o mais leve possível.

## Decisões

- A foto pertence a **cada pergunta (passo)**, não à pessoa: cada participante comenta uma vez só.
- **Só o recorte é manual.** Tamanho e compressão são fixos: **240×320 px**, **WebP** (JPEG quando o navegador não gera WebP).
- A foto é guardada **dentro do banco**, na coluna `medias.photo`, como data URL. Backup, restauração e exclusão funcionam sem código extra. Custo aceito: cada recarga da programação traz as fotos do turno (uns 500 KB para 30 participantes, em rede local).
- O arquivo original nunca vai para o servidor; só a versão final.
- Impressão da Sentinela pergunta **com fotos** ou **sem fotos**.

## Fora do escopo

- Ajuste manual de tamanho ou de qualidade.
- Foto em mídias ou em partes comuns.
- Reaproveitar a foto entre passos ou entre Sentinelas.
- Girar a imagem ou aplicar filtros.

## Anexar e recortar (modo editor)

### Formulário da pergunta

- No topo, um **quadro 3x4** com a foto atual ou, sem foto, as iniciais (`Logic.initials`).
- Botão **📷 Foto**: um `<input type="file" accept="image/*">`. No tablet e no celular ele oferece câmera ou galeria.
- Botão **Remover**, visível só quando há foto.
- A foto nova ou a remoção só é gravada quando a pergunta é salva. Fechar com ✕ não muda nada.
- **"Salvar e próxima"** limpa a foto do formulário reaberto.

### Tela de recorte

- Abre ao escolher a imagem, por cima do formulário.
- **Moldura 3x4 fixa** no centro, com a imagem por baixo.
- **Arrastar** move a imagem. **Pinça** (dois dedos) e a **roda do mouse** dão zoom, e um **controle deslizante de zoom** faz o mesmo.
- O zoom mínimo e o arraste mantêm a moldura **sempre coberta** pela imagem, sem área vazia.
- **✕** cancela e volta ao formulário sem mudar a foto. **✓** gera a foto e volta ao formulário com o quadro atualizado.
- A imagem escolhida é carregada e reduzida para no máximo **1600 px** no lado maior antes do recorte, para não travar o aparelho com fotos de 12 MP. A orientação EXIF é respeitada (`createImageBitmap(file, { imageOrientation: 'from-image' })`, ou a imagem já orientada pelo navegador).
- Saída: canvas 240×320, `toDataURL('image/webp', 0.72)`. Se o resultado não começar com `data:image/webp`, usa `toDataURL('image/jpeg', 0.8)`.
- Arquivo que não é imagem ou não carrega: aviso "Não foi possível abrir esta imagem." e a tela de recorte não abre.

### Regras puras (testáveis, em `public/js/logic.js`)

- `coverScale(imgW, imgH, frameW, frameH) -> number`: menor zoom que cobre a moldura.
- `clampPan(offsetX, offsetY, imgW, imgH, scale, frameW, frameH) -> { x, y }`: limita o arraste para a moldura ficar coberta.
- `fitWithin(w, h, max) -> { w, h }`: reduz mantendo a proporção, sem aumentar.
- `isValidPhoto(value) -> boolean`: `''` ou data URL `image/webp` ou `image/jpeg` em base64 com até **100 KB** de texto.

## Servidor, banco e backup

- `POST /api/medias` e `PUT /api/medias/:id` aceitam `photo`.
  - No PUT, `photo` **ausente mantém** a foto atual; `''` remove.
  - `photo` só é aceita em perguntas (`type = 'question'`). Em mídias é ignorada e gravada vazia.
  - Valor que não passa em `isValidPhoto` → **400** `Foto inválida ou grande demais.`
- `db.js`: `createMedia`, `createMediaAfter` e `updateMedia` gravam `step.photo` (ausente → `''`).
- `express.json` passa a aceitar até **20 MB** (`express.json({ limit: '20mb' })`), para a restauração de backups com fotos.
- Backup e restauração já levam `photo`; nenhuma mudança de formato.

## Onde a foto aparece

- **Tela do diretor (cartões):** a foto preenche o quadro 3x4 (`object-fit: cover`) no lugar das iniciais. Sem foto, iniciais como hoje. O destaque laranja da pessoa da vez continua.
- **Modo editor (lista):** a miniatura da linha mostra a foto no lugar das iniciais.
- A foto é inserida como `<img src="data:...">` só depois de passar por `isValidPhoto`; valor inválido vindo de um backup editado mostra as iniciais.

## Impressão

- **Imprimir → Sentinela**: se pelo menos uma pergunta tiver foto, aparece a escolha **"Com fotos"** / **"Sem fotos"** (`Modals.askChoice`). Se nenhuma tiver, imprime direto sem fotos.
- `buildSentinelaHtml(data, opts)` recebe `data.withPhotos`.
  - **Com fotos:** cada pessoa ganha a foto **1,8 × 2,4 cm** acima do nome. Pessoa sem foto mostra só o nome.
  - **Sem fotos:** folha idêntica à de hoje.
- O cabeçalho ESQUERDA | DIREITA continua repetindo a cada página e as linhas continuam sem quebra.

## Testes

- `coverScale`, `clampPan`, `fitWithin`: imagem retrato, paisagem, menor que a moldura; arraste além das bordas.
- `isValidPhoto`: vazio, webp, jpeg, png recusado, texto qualquer, acima de 100 KB.
- Banco: criar e editar passo com foto; backup e restauração com foto.
- Impressão: com fotos mostra `<img` só para quem tem foto; sem fotos não mostra nenhum `<img`; foto inválida não entra no HTML.
- Servidor (verificação ao vivo em banco temporário): foto válida grava; inválida → 400; PUT sem `photo` mantém; `''` remove; restauração de backup acima de 100 KB funciona.
