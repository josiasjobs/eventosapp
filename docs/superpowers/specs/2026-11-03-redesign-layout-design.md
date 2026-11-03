# Redesign do layout e do visual — Design

**Data:** 2026-11-03
**Status:** aprovado em conversa, aguardando revisão do documento

## Objetivo

Deixar a operação do EventosAPP o mais fácil possível durante um evento ao vivo: visual limpo, menos toques, menos informação na tela e ícones no lugar de palavras sempre que possível. A inspiração visual é o JW Hub: fundo preto, superfícies cinza lisas, uma única cor de destaque e listas simples em linhas.

## Contexto de uso

- A operação ao vivo acontece em **tablet (horizontal) e celular (vertical)**, com toque. O notebook é secundário.
- Ações mais frequentes, em ordem: marcar mídias → avançar para a próxima parte → concluir a parte → pular para outra parte.
- A edição também acontece **durante o evento**, para ajustes rápidos, principalmente no tablet ou no notebook.

## Fora do escopo

- Mudanças na API, no banco de dados ou na sincronização via WebSocket. A única mudança no backend é a regra do PIN (veja "PIN").
- Trocar a stack do frontend. Ele continua em HTML, CSS e JS puros, sem build.
- Novas funcionalidades além das listadas aqui.

## Terminologia

Todo texto que aparece na tela usa **"Parte"** para os itens da programação ("Nova parte", "Sem partes neste turno"). No código, os nomes continuam `item`.

## 1. Sistema visual

### Cores

Substituem toda a paleta de `public/css/variables.css`.

| Token | Valor | Uso |
|---|---|---|
| fundo | `#000000` | fundo da página |
| superfície | `#262626` | linhas, topo, barra de baixo |
| superfície elevada | `#1b1b1b` + sombra | gavetas, menus, janelas |
| superfície 2 | `#333333` | botões neutros |
| borda | `#3a3a3a` | divisórias |
| texto | `#eeeeee` | texto principal |
| texto secundário | `#9a9a9a` | horários, observações, ícones neutros |
| destaque | `#f26a1b` | parte atual, botão ▶, edição ligada, botão + |
| concluído | `#3fb950` | apenas para estado concluído |
| perigo | `#f05252` | apenas para excluir e erros |

Saem os gradientes, brilhos, efeitos de vidro e animações de pulso. Ficam apenas transições curtas, de 150 ms.

### Tipografia

- Fonte do sistema: `system-ui, "Noto Sans", Roboto, "Segoe UI", sans-serif`. O link do Google Fonts sai do `index.html`, para o app funcionar 100% offline.
- Três tamanhos: título da parte atual (~22px), texto normal (16px) e texto secundário (13px).
- Horários com `font-variant-numeric: tabular-nums`.

### Ícones

- Um único conjunto de ícones de traço (estilo Lucide), embutido em `public/js/icons.js` e exposto como `icon(nome)`, que retorna o SVG como string. Nenhum emoji na interface.
- Tipos de mídia: `bible` → livro, `video` → câmera, `image` → moldura, `interview` → microfone, `theater` → máscaras, `other` → arquivo. Os ícones ficam em cinza; sai a cor por tipo.
- Todo botão que só tem ícone recebe `title` e `aria-label` em português.

### Toque

- Área mínima de toque de 44×44px em todo elemento clicável.

## 2. Tela de operação

Corte entre os layouts: **768px** de largura. Acima disso, duas colunas (programação | parte atual). Abaixo, uma coluna com a parte atual e a programação numa gaveta.

### Barra do topo (~48px)

- Esquerda: quadrado laranja com ▶ (a marca) e a etiqueta de dia e turno (ex.: "Sáb · Manhã"). Tocar na etiqueta abre a **gaveta de dia e turno**.
- Direita, só ícones:
  - **Conexão**: verde se conectado, vermelho se desconectado. Tocar abre a gaveta de **Conexão**.
  - **✎**: liga ou desliga a edição.
  - **⚙**: só aparece com a edição ligada e abre as **Configurações**.
- Saem: o nome do evento, o texto "Conectado (LAN)", o texto "Modo Edição" e o botão de sair (que vai para a gaveta de Conexão).

### Lista da programação

Fica na coluna esquerda no tablet e na gaveta no celular.

- Cada linha mostra o horário, o título e a bolinha de status.
- Bolinha de status: vazia (nenhuma mídia concluída), meia (algumas concluídas) ou cheia e verde (parte concluída).
- Parte atual: faixa laranja de 3px à esquerda, fundo `superfície` e horário em laranja.
- Parte concluída: título riscado, em `texto secundário`.
- Tocar na linha torna a parte atual; no celular, a gaveta também fecha.
- Tocar na bolinha marca ou desmarca a parte inteira (área de toque própria de 44px). Substitui o botão "Concluir".
- Ao abrir, a lista rola até a parte atual.
- Saem: o número de ordem, o orador ("Por: …"), a etiqueta de tipo de atividade, as etiquetas "AO VIVO" e "CONCLUÍDO", o contador "2/5 mídias", a barra de progresso do turno e o contador "N itens".

### Parte atual

- Título em destaque, com uma bolinha de concluir ao lado (mesmo comportamento da lista).
- Linha de detalhes: ícone de relógio com o horário e ícone de pessoa com o orador (se houver).
- Observações da parte, em texto secundário (se houver).
- Lista de mídias. Cada linha mostra o círculo de marcar, o ícone do tipo, o título e as observações da mídia em texto pequeno (sem o prefixo "Ref:"). Tocar em qualquer ponto da linha marca ou desmarca.
- Mídia concluída: opacidade reduzida, título riscado e círculo verde com ✓.
- Saem: as etiquetas "AO VIVO", "CONCLUÍDO" e de tipo de atividade, o cabeçalho "Mídias do Item", o texto "N de M concluídas (X%)", a barra de progresso e o botão "Editar Item".

### Conclusão automática da parte

- Ao marcar a última mídia pendente de uma parte, a parte é marcada como concluída. Não avança sozinha e não pergunta nada.
- Ao desmarcar uma mídia de uma parte concluída, a parte volta a ficar pendente.
- Marcar uma mídia enquanto ainda restam outras pendentes não altera a parte. Assim, uma parte concluída manualmente continua concluída.
- Implementação no frontend: depois de alternar uma mídia, a função pura `itemCompletionAfterToggle(medias, itemCompleted, mediaNowCompleted)` retorna o novo estado da parte (`true` ou `false`) ou `null` se nada deve mudar. Quando não é `null`, o app chama a rota de concluir que já existe.

### Barra de baixo

- Celular: `◀` `☰` `▶`. O ▶ é laranja e tem o dobro da largura; o ☰ abre a gaveta da programação.
- Tablet: `◀` `▶`, sem o ☰.
- Botões desabilitados (na primeira ou na última parte) ficam com opacidade reduzida.
- As setas do teclado continuam funcionando.

### Estados vazios

- Um ícone e uma frase curta: "Sem partes neste turno" ou "Sem mídias". Com a edição ligada, o botão + fica visível.

## 3. Edição

### Ligar e desligar

- Tocar em ✎ pede o PIN de admin (se a sessão ainda não for de admin) e liga a edição. Com ela ligada, o ✎ fica laranja e aparece uma linha laranja de 2px embaixo do topo. Tocar em ✎ de novo desliga.
- Sai o aviso "Modo Edição Ativo — …".

### Menu ⋯

Só aparece com a edição ligada.

- Parte: ✎ editar · ⤓ importar playlist (`.jwlplaylist`) · 🗑 excluir.
- Mídia: ✎ editar · 🗑 excluir.
- O menu abre colado à linha e fecha ao tocar fora dele ou ao escolher uma ação.
- **Excluir com dois toques:** o primeiro toque deixa o 🗑 vermelho e pulsando; o segundo, dentro de 3 segundos, confirma. Tocar fora ou esperar cancela. Substitui o `confirm()` do navegador.

### Botão + flutuante

- Fica no canto inferior direito, acima da barra de baixo, e só aparece com a edição ligada.
- Tocar abre duas opções com ícone e uma palavra: **Parte** e **Mídia**. A mídia é adicionada à parte atual; a opção Mídia fica desabilitada quando não há parte atual.

### Reordenar

- Segurar a linha por 500 ms e arrastar. Funciona para partes e mídias, no toque e no mouse, e só com a edição ligada.
- Saem os botões ▲ ▼ e a alça ⋮⋮.
- A nova ordem é enviada pelas rotas de reordenar que já existem.

### Formulários

- Gaveta de baixo no celular; janela central a partir de 768px.
- Cabeçalho: título curto ("Nova parte", "Editar parte", "Nova mídia", "Editar mídia"), ✕ fechar e ✓ salvar. Sem botões no rodapé.
- **Parte:** título (obrigatório), horário (obrigatório), orador e observações.
- **Mídia:** tipo como fileira de 6 ícones tocáveis (um selecionado; o padrão é `bible`), título (obrigatório) e observações.
- O primeiro campo recebe foco ao abrir. Enter salva (exceto dentro de um textarea). Esc fecha.

## 4. Telas secundárias

### PIN

- **O PIN tem exatamente 4 dígitos.** O servidor passa a exigir `/^\d{4}$/` na configuração inicial e na troca de PIN (`isValidPin` em `auth.js` e as mensagens de erro em `server.js`).
- Tela de login: tela cheia e escura, com o quadrado laranja, 4 bolinhas e o teclado numérico com teclas de 64px (1–9, C, 0, ⌫). Ao digitar o 4º dígito, o PIN é enviado sozinho. Sai o botão "Confirmar Acesso".
- PIN errado: as bolinhas tremem e ficam vermelhas, e o PIN digitado é limpo. Sem mensagem de texto, exceto quando o servidor bloqueia por excesso de tentativas; nesse caso aparece uma linha curta com o tempo de espera.
- **Migração:** quem tiver um PIN com mais de 4 dígitos, criado pela configuração inicial antiga, precisa trocá-lo antes de atualizar. Os PINs padrão (`1234`, `9999`) não são afetados.

### Gaveta de dia e turno

- Os dias aparecem como títulos e os turnos como linhas tocáveis. O turno atual fica marcado em laranja. Um toque troca e fecha.
- Com a edição ligada: ⋯ em cada dia e turno (✎ renomear, 🗑 excluir com dois toques) e um + para novo dia e novo turno. Substitui a aba "Dias & Turnos" das configurações.
- **Lembrar o turno:** o turno escolhido é salvo no `localStorage` do aparelho (`eventos_shift_id`). Ao abrir o app, se esse turno ainda existir, ele é usado; senão, vale o comportamento atual (primeiro dia, primeiro turno).

### Configurações (⚙)

- Uma janela com uma lista de três seções, sem abas:
  - **Evento:** nome e categoria.
  - **PINs:** novo PIN do diretor e novo PIN de admin (4 dígitos; em branco mantém o atual).
  - **Backup:** ⤓ baixar `.json` · ⤒ restaurar (arquivo, a opção "manter PINs atuais" e um aviso de uma linha de que os dados atuais serão sobrescritos; confirma com dois toques).

### Conexão

- Gaveta (celular) ou janela (tablet) com o QR code grande, o endereço da rede local logo abaixo (tocar copia e mostra um aviso curto) e o botão de sair no rodapé.
- Saem o parágrafo explicativo e o botão "Entendido".

### Configuração inicial

- Campos: nome do evento, PIN do diretor e PIN de admin (4 dígitos cada).
- O primeiro dia ("Dia 1") e o primeiro turno ("Geral") são criados automaticamente; a categoria fica vazia. Tudo isso pode ser editado depois.

### Avisos (toasts)

- Ficam embaixo, acima da barra de baixo, e duram 2 segundos.
- Ações bem-sucedidas que já mudam a tela não mostram aviso. Só erros, o resultado de importações e "endereço copiado" mostram.

## 5. Implementação

### Arquivos

| Arquivo | Mudança |
|---|---|
| `public/css/variables.css` | nova paleta, tipografia e espaçamentos |
| `public/css/base.css` | reset, fonte do sistema, alvos de toque |
| `public/css/components.css` | linha, gaveta, menu ⋯, botão +, botões de ícone, teclado do PIN, toasts, janelas |
| `public/css/director.css` | topo, layout em duas colunas e em uma coluna, lista, parte atual, barra de baixo |
| `public/css/editor.css` | linha de edição ligada, ⋯, segurar e arrastar, exclusão com dois toques |
| `public/js/icons.js` (novo) | ícones SVG e `icon(nome)`; carregado antes dos outros scripts |
| `public/index.html` | novo topo, gavetas e janelas; sem estilos inline e sem Google Fonts |
| `public/js/ui-director.js` | novos templates, menu ⋯, segurar e arrastar (partes e mídias), exclusão com dois toques, gaveta da programação |
| `public/js/modals.js` | formulários enxutos, PIN de 4 dígitos com envio automático, gaveta de dia e turno, configurações em lista, conexão |
| `public/js/app.js` | lembrar o turno, ligar a conclusão automática depois de alternar mídias |
| `public/js/state.js` | ler e gravar `eventos_shift_id` |
| `auth.js`, `server.js` | PIN de exatamente 4 dígitos e mensagens de erro |

### Lógica pura e testável

Fica em `public/js/logic.js` (novo), usável no navegador (`window.Logic`) e no Node (`module.exports`):

- `itemCompletionAfterToggle(medias, itemCompleted, mediaNowCompleted)` → `true` se a mídia foi marcada, todas estão concluídas e a parte ainda não estava concluída; `false` se a mídia foi desmarcada e a parte estava concluída; `null` em qualquer outro caso.
- `pickInitialShift(days, savedShiftId)` → `{ dayId, shiftId }` do turno salvo se ele existir; senão, do primeiro turno do primeiro dia que tiver turnos; senão, `null`.
- `itemStatus(item)` → `'empty' | 'partial' | 'done'`, para a bolinha de status.

- `escapeHtml(value)` → texto seguro para entrar em templates HTML.

`isValidPin` vai para um módulo próprio, `pin.js`, que `auth.js` reexporta. Assim os testes não precisam carregar `auth.js`, que abre o banco real.

### Erros

- As ações de operação (marcar mídia, concluir parte, trocar a parte atual) atualizam a tela antes da resposta do servidor. Se a requisição falhar, a tela volta ao estado anterior e um aviso vermelho curto aparece.
- A conexão perdida aparece apenas pelo ícone vermelho no topo.

### Testes

- `node:test` nativo, sem dependências, com o script `"test": "node --test"` no `package.json`.
- Testes unitários para `itemCompletionAfterToggle`, `pickInitialShift`, `itemStatus` e `isValidPin`.
- Verificação manual rodando o app em 390px (celular) e 1024px (tablet), seguindo uma lista de conferência no plano de implementação: marcar mídias, conclusão automática, navegar, pular parte, trocar turno, ligar e desligar a edição, ⋯, +, arrastar, exclusão com dois toques, login com PIN, configurações, conexão, backup e importação de playlist.
