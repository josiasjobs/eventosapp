# Parte "A Sentinela" — Design

**Data:** 2026-11-03
**Status:** aprovado em conversa, aguardando revisão do documento

## Objetivo

Organizar a parte "A Sentinela", em que participantes sobem ao palco para responder perguntas. O diretor precisa ver, de relance, **quem responde agora, de que lado do palco e para qual câmera cortar**, e continuar controlando as mídias da parte como hoje.

## Como a parte acontece

- Os participantes entram pelo **lado esquerdo ou direito** do palco, em grupos de 1 a 3 pessoas (raramente 4).
- O orador faz uma pergunta e **uma pessoa definida antes** responde. Depois vem a próxima pergunta.
- Um parágrafo pode ter uma, duas ou mais perguntas (inclusive perguntas adicionais).
- Mídias (texto bíblico, foto etc.) aparecem **no meio da sequência**, entre as perguntas.
- Uma pessoa também pode ler um texto ("Salmo 119:9") em vez de responder uma pergunta.

## Fora do escopo

- **Upload de fotos.** Esta versão só reserva o espaço 3x4 e mostra as iniciais.
- **Sincronizar o passo atual entre aparelhos.** Cada aparelho acompanha o seu próprio passo.
- Mudanças nas outras partes. Elas continuam exatamente como estão.

## Dados

### Parte Sentinela

- `items.activity_type = 'sentinela'` identifica a parte. A coluna já existe e hoje está sempre vazia.
- Novas colunas em `items`, todas inteiras e opcionais:
  - `cam_left`: câmera que filma quem está à **esquerda**.
  - `cam_right`: câmera que filma quem está à **direita**.
  - `cam_speaker`: câmera do orador.
- A Sentinela é **sempre discurso**: `talk_number` é obrigatório e segue a regra atual (inteiro maior que zero, único no evento).
- As câmeras guardam **o lado que a câmera filma**. "Esquerda = CAM 1" quer dizer que a CAM 1 filma quem está à esquerda.

### Passos

A tabela `medias` passa a guardar os **passos** da parte. Assim, perguntas e mídias ficam numa única lista ordenada, e arrastar para reordenar, ☐, sincronização da lista, backup e importação continuam funcionando.

- Novo tipo `type = 'question'` para perguntas.
- Novas colunas em `medias`:
  - `paragraph INTEGER`: número do parágrafo. Opcional nas mídias e obrigatório nas perguntas.
  - `side TEXT`: `'left'` ou `'right'`. Só nas perguntas.
  - `person TEXT`: nome de quem responde. Só nas perguntas.
  - `photo TEXT`: reservado para a foto futura. Fica sempre vazio nesta versão.
- Numa pergunta, o `title` guarda o **texto abaixo da foto** ("?", "A?", "Salmo 119:9"). O padrão é `?`.
- Perguntas **não têm ☐**: o campo `completed` delas é ignorado e elas não entram no cálculo de conclusão da parte.
- Perguntas só podem existir numa parte Sentinela. O servidor recusa uma pergunta numa parte comum.

### Cartões

Os cartões **não são guardados**. A tela agrupa os passos com `Logic.groupSentinelaSteps(steps)`:

- Perguntas **seguidas** com o mesmo `paragraph` e o mesmo `side` formam um cartão.
- Cada mídia é um cartão próprio.
- Uma mídia no meio, ou a mudança de parágrafo ou de lado, abre um cartão novo.

### Validação no servidor

- `side` só aceita `left` ou `right`.
- `paragraph` e as câmeras são inteiros maiores que zero, ou vazios onde forem opcionais.
- Pergunta sem `person` ou sem `paragraph` é recusada com 400 e mensagem em português.

## Cadastro (modo editor)

### Criar a Sentinela

O menu **+** (FAB) ganha a opção **"Sentinela"**, ao lado de "Parte" e "Mídia". Ela abre o formulário da parte com:

- título pré-preenchido "A Sentinela", editável;
- horário, orador e observações, como em qualquer parte;
- caixa "Discurso" **escondida e sempre marcada**, com o campo **Nº do discurso** visível, vazio e obrigatório;
- três campos numéricos de câmera: **Esquerda**, **Direita** e **Orador**.

Editar uma Sentinela pelo ⋯ abre o mesmo formulário.

### Adicionar passos

Quando a parte atual é Sentinela, o menu **+** mostra também **"Pergunta"** (ícone de pessoa). "Mídia" continua lá e abre o formulário de mídia de hoje, com o campo opcional **§ Parágrafo**.

Formulário da pergunta:

- **§ Parágrafo**: número.
- **Lado**: dois botões grandes, ESQUERDA | DIREITA.
- **Nome**: texto, com sugestão dos nomes já usados nesta Sentinela (`<datalist>`).
- **Texto abaixo da foto**: começa com `?`.
- **Salvar** e **Salvar e próxima**. "Salvar e próxima" salva e reabre o formulário com o mesmo § e o mesmo lado já marcados, e o nome e o texto limpos.

### Na tela, com a edição ligada

- Cada pessoa e cada mídia tem o **⋯** (editar / excluir), como hoje.
- **Arrastar** reordena os passos, como as mídias hoje. Os cartões se refazem sozinhos.
- Cada cartão de pergunta tem um **+** pequeno que abre o formulário da pergunta com o § e o lado do cartão.

### Importar playlist numa Sentinela

- As mídias importadas entram **no fim** da lista, sem parágrafo.
- **Substituir** apaga **só as mídias** e mantém as perguntas. O texto da pergunta de confirmação deixa isso claro.

## Tela do diretor

Quando a parte atual é Sentinela, a área da parte troca a lista de mídias pelos cartões:

```
 Nº 3  A Sentinela                     Orador CAM 2
 ┌──────────── ESQUERDA ──────┬────── DIREITA ─────────┐
 │ §1  [PE] [JO]              │            🎥 CAM 1    │
 │     Pedro Jonas            │                        │
 │      A?    B?              │                        │
 ├────────────────────────────┼────────────────────────┤
 │ §2  🎥 CAM 3               │          [JO] Joana    │
 │                            │                ?       │
 ├────────────────────────────┴────────────────────────┤
 │ §2  ☐ 📖 Salmo 119:9                                 │
 └─────────────────────────────────────────────────────┘
```

- Duas colunas fixas: **ESQUERDA** e **DIREITA**. As pessoas aparecem no lado delas, e o ícone da câmera fica **do lado oposto**, imitando a posição física da câmera.
- Cada pessoa é um cartão 3x4 com o **nome** em cima e o **texto** embaixo. Sem foto, o quadro mostra as **iniciais** (até 2 letras).
- Cartão de mídia: ocupa a largura toda, com ícone do tipo, título e ☐ manual.

### Passo atual

- Guardado **só no aparelho**, em `localStorage` (`eventos_step_ids`: `{itemId: mediaId}`). Nada vai para o servidor.
- Se não houver passo salvo, ou se ele não existir mais, o destaque começa no **primeiro passo**.
- O cartão atual ganha **borda laranja**, a pessoa da vez ganha **contorno laranja** na foto e o nome em negrito, e o ícone da câmera do cartão atual fica **laranja**.
- A lista rola para mostrar o cartão atual **só quando o passo muda**.

### Navegação

- **◀ ▶** andam de passo em passo. Fora da Sentinela, continuam andando de parte em parte.
- No **último passo**, ▶ vai para a próxima parte. No **primeiro**, ◀ volta para a anterior.
- **Tocar** numa pessoa ou mídia move o destaque direto para ela.
- Uma Sentinela sem passos se comporta como uma parte comum.
- A navegação é uma função pura, `Logic.stepNav(stepIds, currentId, dir)`, que devolve `{ stepId }` ou `{ leave: 'next' | 'prev' }`.

### Conclusão da parte

Continua a regra de hoje, mas contando **só as mídias**. As perguntas ficam de fora. Uma Sentinela sem mídias só é concluída pelo toque manual na parte.

### Celular

- As duas colunas continuam. As fotos ficam menores e as pessoas de um cartão se empilham.
- ◀ ▶ ficam no rodapé, como hoje.

## Impressão

A Sentinela aparece no roteiro como as outras partes, com o Nº do discurso, e também entra em **"Só discursos"**. No cabeçalho da parte aparece **"Orador CAM N"**, quando definido. A lista segue os cartões:

```
§1  ESQUERDA · CAM 1   Pedro — A?   ·   Jonas — B?
§2  DIREITA · CAM 3    Joana — ?
§2  ☐ Bíblia  Salmo 119:9
```

Só as mídias têm ☐.

## Backup e restauração

- A exportação inclui `activity_type`, `cam_left`, `cam_right` e `cam_speaker` das partes e `paragraph`, `side`, `person` e `photo` dos passos.
- Um backup antigo, sem esses campos, continua restaurando normalmente, com os campos vazios.

## Testes

- `Logic.groupSentinelaSteps`: mesmo §/lado vira um cartão; quebra quando muda o §, o lado ou quando há uma mídia no meio; lista vazia.
- `Logic.stepNav`: avançar e voltar; sair para a próxima e para a anterior nas pontas; passo salvo inexistente.
- Validação: lado inválido, pergunta sem nome, pergunta sem parágrafo, pergunta numa parte comum, Sentinela sem Nº de discurso.
- Conclusão da parte ignora as perguntas.
- Impressão da Sentinela: cartões, câmeras, "Orador CAM N", ☐ só nas mídias.
- Backup e restauração com os campos novos, e restauração de um backup antigo.
- Importação com **Substituir** numa Sentinela mantém as perguntas.
