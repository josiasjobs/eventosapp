# Planos de câmera (transição entre oradores) — Design

**Data:** 2026-11-05
**Status:** aprovado em conversa, aguardando revisão do documento

## Objetivo

Na transição de um orador para outro, o diretor chama um **plano** de câmera: plano aberto, aberto curto, plano presidente, série discurso etc. O app guarda um cadastro desses planos (sigla, nome, câmera, preset). Cada parte indica o **plano de entrada** e o **plano de saída**, e o diretor vê os dois no ponto certo da parte, sem precisar decorar.

## Decisões

- O cadastro é **geral do app**: uma lista só, usada por todos os eventos.
- Um plano tem **sigla**, **nome**, **uma câmera** e **um preset** (números inteiros).
- Cada parte (incluindo Presidente e Sentinela) tem **plano de entrada** e **plano de saída**, opcionais e escolhidos do cadastro.
- A parte guarda a **referência** ao plano. Uma mudança no cadastro aparece em todas as partes que o usam.
- Na tela do diretor, a **entrada fica no topo** da lista de mídias e a **saída no final**, na ordem do que acontece no palco.
- A lista de partes mostra as siglas (`PP → PA`); a impressão mostra os planos.
- Só o admin (modo editor) altera o cadastro e os planos das partes.

## Fora do escopo

- Plano com mais de uma câmera, ou preset em texto.
- Planos no meio da parte (só entrada e saída).
- Marcar o plano como feito.
- Acionar a câmera pelo app.

## Banco

- Tabela nova `camera_plans`:
  - `id INTEGER PRIMARY KEY AUTOINCREMENT`
  - `sigla TEXT NOT NULL UNIQUE COLLATE NOCASE`
  - `name TEXT NOT NULL`
  - `camera INTEGER NOT NULL`
  - `preset INTEGER NOT NULL`
  - `created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))`
- `items` ganha `plan_in_id` e `plan_out_id`: `INTEGER REFERENCES camera_plans(id) ON DELETE SET NULL`, por `ALTER TABLE ... ADD COLUMN` em try/catch, como as migrações atuais.
- Apagar um plano deixa as partes que o usavam sem plano.
- Apagar ou restaurar um evento não mexe no cadastro.

## Regras do plano (puras, testáveis, em `public/js/logic.js`)

- `checkCameraPlan({ sigla, name, camera, preset }) -> string | null`: devolve a mensagem de erro ou `null`.
  - Sigla aparada, obrigatória, até **8** caracteres → `Informe a sigla (até 8 caracteres).`
  - Nome aparado, obrigatório → `Informe o nome do plano.`
  - Câmera e preset: `parsePositiveInt` → `Câmera e preset devem ser números inteiros maiores que zero.`
- `planLabel(plan) -> string`: `PP · Plano presidente · CAM 2 · P4`; plano ausente → `''`.
- `planSiglas(item) -> string`: `PP → PA`, `PP →` (só entrada), `→ PA` (só saída), `''` (nenhum).

## Servidor

- `GET /api/camera-plans` (qualquer sessão): lista ordenada pela sigla, cada um com `usage` (partes que o usam).
- `POST /api/camera-plans` e `PUT /api/camera-plans/:id` (admin):
  - Corpo `{ sigla, name, camera, preset }` validado por `checkCameraPlan` → 400 com a mensagem.
  - Sigla repetida (sem diferenciar maiúsculas) → 409 `Já existe um plano com a sigla X.`
  - Plano inexistente no PUT → 404 `Plano não encontrado.`
- `DELETE /api/camera-plans/:id` (admin): apaga; as partes ficam sem o plano.
- Toda mudança no cadastro → `broadcast('CAMERA_PLANS_UPDATED')`.
- Partes:
  - `POST /api/items` e `PUT /api/items/:id` aceitam `planInId` e `planOutId`: vazio ou `null` limpa; ausente no PUT mantém o atual.
  - Id que não existe no cadastro → 400 `Plano de câmera não encontrado.`
- Dados do turno (`/api/shifts/:id/full`): cada parte traz `plan_in` e `plan_out` como `{ id, sigla, name, camera, preset }` ou `null`.

## Cadastro na tela (botão próprio)

- Botão novo na barra de cima, com o ícone de câmera (`video`), ao lado de Imprimir. Aparece só com a edição ligada (`edit-only`), como o botão de Configurações.
- O botão abre a janela **Planos de câmera**, separada das Configurações.
- Uma linha por plano: `PP  Plano presidente  CAM 2 · P4`, mais ⋯ com **Editar** e **Excluir**.
- **+ Novo plano** e **Editar** abrem um formulário com Sigla, Nome, Câmera e Preset.
- **Excluir**:
  - Plano sem uso: apaga direto.
  - Plano em uso: `Modals.askChoice` com o texto `N partes usam este plano.` (singular `1 parte usa`) e as opções **Excluir** (`danger`) e ✕.
- Cadastro vazio: `Nenhum plano cadastrado.`

## Na parte (formulário)

- Dois seletores logo abaixo do campo Orador: **Plano de entrada** e **Plano de saída**.
- Opções: `— Nenhum —` e cada plano como `planLabel(plan)`.
- Com o cadastro vazio, os seletores ficam desativados com a dica `Cadastre planos no botão da câmera.`

## Onde aparece

- **Parte atual (diretor e editor):**
  - Uma linha de **entrada** antes da primeira mídia ou passo: `↑ Entrada · PP · Plano presidente · CAM 2 · P4`.
  - Uma linha de **saída** depois da última: `↓ Saída · PA · Plano aberto · CAM 1 · P1`.
  - Parte sem mídias: entrada, `Sem mídias`, saída.
  - Sentinela: a entrada vem antes do primeiro cartão e a saída depois do último.
  - As linhas são só informativas: sem bolinha de status, e não entram na navegação de mídias.
  - Sem plano, a linha não aparece.
- **Lista de partes:** `planSiglas(item)` em texto pequeno à direita do título.
- **Impressão:**
  - Roteiro completo e Só discursos: linha de entrada antes das mídias da parte e linha de saída depois delas, com `planLabel`.
  - Sentinela: uma linha de entrada no início da tabela e uma de saída no fim, ocupando a largura toda.

## Backup e restauração

- O backup ganha `camera_plans`: os planos usados pelo evento, como `{ sigla, name, camera, preset }`.
- Cada parte leva `plan_in` e `plan_out` como **sigla**, ou `null`.
- Na restauração, cada sigla é procurada no cadastro (sem diferenciar maiúsculas):
  - Se existe, a parte usa o plano local, que **não** é alterado.
  - Se não existe, o plano é criado com os dados do backup.
- Uma sigla da parte que não está em `camera_plans` nem no cadastro fica sem plano.
- Backups antigos, sem esses campos, restauram como hoje.

## Testes

- `logic.test.js`:
  - `checkCameraPlan`: sigla vazia, sigla com 9 caracteres, nome vazio, câmera `0`, preset `1.5`, válido.
  - `planLabel`: plano completo e plano ausente.
  - `planSiglas`: os quatro casos.
- `db.test.js`:
  - Criar plano; sigla repetida em maiúsculas/minúsculas falha.
  - Apagar plano deixa `plan_in_id` da parte `NULL`.
  - Backup leva os planos usados.
  - Restauração usa o plano local existente e cria o que falta.
  - Backup antigo sem planos restaura.
- `print-program.test.js`:
  - Entrada antes da primeira mídia e saída depois da última, na ordem do HTML.
  - Sem plano, nada é impresso.
  - Sentinela com entrada e saída.
- Verificação ao vivo em banco temporário:
  - Cadastro, seletores e linhas de entrada e saída.
  - Exclusão de plano em uso.
  - Backup e restauração.
