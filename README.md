# 🚀 EventosAPP — Operação & Direção de Eventos ao Vivo
**Versão 1.0 — MVP**

Aplicação web local de alta performance para operação e gerenciamento de eventos ao vivo, mídias e programação em rede local (LAN), com persistência SQLite e sincronização em tempo real via WebSocket.

---

## 🌟 Princípio Central do Produto
> **Uma aplicação, uma interface, dois modos de uso.**

- **Modo Diretor (Padrão):** Interface limpa, imersiva e sem distrações. Destaca o item em execução, checklist interativo de mídias com alternância instantânea, navegação ergonômica com atalhos de teclado (`[←]` / `[→]`), e visão geral da programação.
- **Modo Edição:** Ativado por botão discreto no topo mediante PIN administrativo. Revela ferramentas de criação, edição, exclusão, reordenação de itens e mídias, e configuração de dias e turnos **na mesma interface, sem recarregar a página e sem perder o estado operacional**.

---

## 🛠️ Tecnologias Utilizadas

- **Backend:** Node.js (v24), Express, WebSockets (`ws`), hash de segurança com `bcryptjs`, gerador de QR Code (`qrcode`).
- **Banco de Dados:** SQLite nativo (`node:sqlite` DatabaseSync) com modo **WAL** (*Write-Ahead Logging*) para máxima velocidade concorrente e integridade referencial.
- **Frontend:** Single Page Application (SPA) em Vanilla HTML5, Vanilla CSS modular e JavaScript moderno, com Dark Mode profissional e suporte completo a operação 100% offline.
- **Rede Local (LAN):** Detecção automática do endereço IP da máquina na rede Wi-Fi/Ethernet com QR Code exibido na tela para pareamento instantâneo de smartphones e tablets da equipe de produção.

---

## 🚀 Como Executar

### 1. Iniciar o servidor
Na pasta do projeto, execute:
```bash
npm start
```
*(ou `node server.js`)*

### 2. Acessar a aplicação
- **Na mesma máquina:** Abra seu navegador em:  
  👉 **`http://localhost:3000`**
- **Em outros dispositivos na mesma rede Wi-Fi / LAN (celulares, tablets, notebooks na cabine):**  
  👉 **`http://<IP-LOCAL>:3000`** *(O IP exato e um QR Code são informados no terminal e no botão de status da tela)*.

---

## 🔐 Autenticação e Níveis de PIN

O sistema utiliza PINs numéricos de 4 a 8 dígitos criptografados com `bcrypt` no banco de dados SQLite local, com proteção contra força bruta (*rate-limiting*):

1. **PIN do Diretor (Padrão inicial: `1234`):**
   - Permite visualizar a programação e o item atual.
   - Permite marcar mídias como concluídas ou reabri-las.
   - Permite avançar e retroceder os itens em execução.
   - Bloqueia alterações estruturais (criar/excluir itens, editar evento).

2. **PIN de Administrador / Edição (Padrão inicial: `9999`):**
   - Libera o **Modo Edição**.
   - Criar, editar, excluir e reordenar itens e mídias.
   - Gerenciar Dias, Turnos e dados gerais do evento.
   - Alterar os PINs de acesso.

---

## ⌨️ Atalhos de Teclado Operacionais

- **Seta para a Esquerda `[←]` / `[PageUp]`:** Item Anterior
- **Seta para a Direita `[→]` / `[PageDown]`:** Próximo Item
- **Tecla `[E]`:** Alternar entre Modo Diretor e Modo Edição
- **Tecla `[Esc]`:** Fechar qualquer modal ativo

---

## 📁 Estrutura de Diretórios

```
EventosAPP/
├── package.json          # Dependências e scripts
├── server.js             # Servidor HTTP, WebSockets, IP LAN e APIs REST
├── db.js                 # Camada SQLite com integridade referencial e WAL
├── auth.js               # Hash de PINs (bcryptjs), sessões e rate-limit
├── data/
│   └── eventos.db        # Banco de dados local SQLite persistido
└── public/
    ├── index.html        # Interface semântica com IDs únicos
    ├── css/
    │   ├── variables.css # Design system tokens e paleta Studio Dark
    │   ├── base.css      # Header, relógio digital e layout base
    │   ├── components.css# Modais, keypad numérico, botões e toasts
    │   ├── director.css  # Hero Spotlight, checklist de mídias e timeline
    │   └── editor.css    # Ferramentas e botões do Modo Edição
    └── js/
        ├── state.js      # AppState reativo com subscribers
        ├── api.js        # Cliente REST e WebSocket com auto-reconnect
        ├── modals.js     # Gerenciamento de janelas modais e keypad
        ├── ui-director.js# Renderizador do Modo Diretor e navegação
        └── app.js        # Ciclo de vida, relógio ao vivo e atalhos
```

---

## ✅ Requisitos do PRD Atendidos no MVP

- **RF-01 (Configuração inicial):** Onboarding automático se o banco estiver vazio.
- **RF-02 (Acesso por PIN):** Keypad virtual + teclado físico, sessões com token e rate-limit.
- **RF-03 (Evento ativo único):** Apenas um evento ativo com integridade SQLite.
- **RF-04 (Programação):** Listagem e ordenação por turnos.
- **RF-05 (Item atual):** Destaque ao vivo ("AO VIVO / EM EXECUÇÃO"), avanço e retrocesso.
- **RF-06 (Edição de itens):** Criar, editar, excluir e reordenar itens no Modo Edição.
- **RF-07 (Gerenciamento de mídias):** Bíblia, Imagem, Vídeo, Entrevista, Teatro, Outro com referências.
- **RF-08 (Progresso de mídias):** Checklist interativo com persistência e propagação instantânea.
- **RF-09 (Alternância de modo):** Modo Diretor e Modo Edição na mesma interface sem recarregar.
- **RF-10 (Sincronização em LAN):** WebSockets bidirecionais propagando alterações para todos os clientes em tempo real.
- **RF-11 (Persistência):** SQLite com WAL e integridade referencial.
- **RF-12 (Responsividade):** Interface perfeitamente adaptada para Desktop, Tablets e Smartphones.
- **RF-13 (Feedback operacional):** Status de conexão LAN, toasts e reconexão automática.
- **RF-14 (Autorização no backend):** Ações administrativas bloqueadas na API para sessões sem privilégio de administrador.
