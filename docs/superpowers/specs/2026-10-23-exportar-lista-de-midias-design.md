# Exportação em PDF da lista de mídias — design

## Intenção

Permitir que Diretor e Administrador gerem uma versão imprimível da lista de mídias de uma parte da programação, para uso em cabine, ensaio ou distribuição física. A ação abre o diálogo nativo de impressão do navegador, no qual a pessoa pode escolher "Salvar como PDF".

## Objetivos

- Adicionar a ação "Gerar PDF" à seção de mídias do item atualmente selecionado.
- Produzir uma página A4 em português, com nome do evento, dia, turno, título da parte, horário previsto, responsável (quando houver), quantidade/progresso e mídias na ordem operacional.
- Mostrar em cada mídia: ordem, status, tipo, título e referência quando disponível.
- Preservar funcionamento local/offline e não introduzir dependências.

## Fora de escopo

- Download automático de arquivo PDF, envio a impressoras de rede, histórico de exportações ou alteração de dados.
- Exportação do turno inteiro ou de mais de uma parte por vez.

## Abordagens consideradas

1. Página HTML exclusiva com `window.print()` — escolhida. Reutiliza os dados já carregados em `AppState`, possibilita CSS de impressão A4, texto vetorial e o fluxo nativo "Salvar como PDF" sem dependência externa.
2. `html2pdf.js` no navegador — descartada: exigiria dependência e converte o layout por canvas, prejudicando fidelidade tipográfica em listas longas.
3. Renderização no servidor — descartada: adicionaria infraestrutura e dependências para uma função que não precisa persistir arquivos.

## Fluxo

1. Na tela do item, a pessoa seleciona "Gerar PDF".
2. O app obtém o item selecionado, mídias e contexto já presentes no estado.
3. Uma janela temporária recebe um documento HTML completo, com CSS de tela e `@page` para A4.
4. A janela abre o diálogo nativo de impressão; a pessoa imprime ou salva como PDF e a janela temporária é fechada após a impressão, quando suportado pelo navegador.
5. Se não houver item ou a janela for bloqueada, o app apresenta uma mensagem de erro clara e não altera o estado operacional.

## Layout do documento

- Cabeçalho compacto: marca EventosAPP, data/hora de emissão, evento e contexto (dia/turno).
- Bloco de identificação da parte: horário, título, responsável e indicador de progresso.
- Lista numerada com status, tipo, título e referência. Itens concluídos recebem marca de confirmação; pendentes permanecem visualmente distintos também em impressão monocromática.
- Rodapé com paginação via CSS quando disponível e a identificação da lista.

## Restrições e decisões

- Autorização: qualquer sessão autenticada que já pode visualizar as mídias pode gerar a versão de impressão; não é uma mutação e não exige endpoint novo.
- Dados: o documento usa somente `AppState.event`, dia/turno selecionados e `AppState.getCurrentItem()`.
- Segurança: todos os valores interpolados no HTML de impressão precisam ser escapados antes de montar o documento.
- A interface operacional e a ordem das mídias não mudam.

## Arquivos previstos

- `public/js/print-media-list.js` (novo): transformação segura dos dados da parte em HTML e abertura controlada da janela de impressão.
- `public/js/ui-director.js`: inclusão do botão e chamada ao módulo de impressão.
- `public/index.html`: carregamento do novo script.
- `public/css/director.css`: somente o estilo do botão na interface, se os estilos existentes não forem suficientes.
- Testes: um pequeno teste Node para a função pura de escape/renderização, condicionado à adição de uma infraestrutura de teste mínima que não exista hoje.
