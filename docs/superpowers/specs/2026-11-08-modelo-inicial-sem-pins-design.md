# Modelo inicial e backups sem PINs

## Intenção

Uma instalação sem banco deve começar com a programação do backup-modelo fornecido, mas cada pessoa define o nome do seu evento e seus próprios PINs na configuração inicial. Backups não podem transportar PINs nem hashes de PIN.

## Decisões

- O arquivo `seed/default-event.json` conterá somente `camera_plans` e `days` do backup fornecido; `event`, `director_pin_hash` e `admin_pin_hash` ficam fora do arquivo.
- `POST /api/setup` continuará recebendo `eventName`, `category`, `directorPin` e `adminPin`; depois de criar o evento, importará a estrutura do modelo em vez de criar os exemplos atuais.
- A exportação manterá metadados do evento (`name` e `category`), mas excluirá os hashes dos PINs.
- A restauração sempre preservará os hashes do evento ativo. A opção de escolher se mantém PINs será removida da API e da tela.

## Abordagens consideradas

1. Importar o modelo ao fim da configuração inicial, usando o nome e PINs informados — escolhida. Mantém cada instalação independente e já pronta para uso.
2. Usar também o nome `aaa` do backup — descartada, pois não representa o evento de cada nova instalação.
3. Definir PINs no modelo — descartada por expor ou repetir credenciais.

## Fora de escopo

- Não alterar os dados atuais de bancos já existentes.
- Não restaurar backups em um banco sem evento ativo; esse endpoint exige autenticação administrativa.

## Documentação

- O README explicará a instalação com `npm install` seguido de `npm start`.
- O README descreverá o propósito do app, seus modos de acesso, recursos principais e o fluxo básico de uso.
