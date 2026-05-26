# Documentação de Atualizações do ZappTor — v2.0.8

Este documento detalha as novas funcionalidades de navegação, melhorias de experiência de usuário (UX) e os recursos premium de interação equivalentes ao WhatsApp Web implementados no ZappTor.

---

## 🚀 Novos Recursos Premium do WhatsApp Web (v2.0.8)

### 1. Gravação e Envio de Áudios (Mensagens de Voz)
* **Interface (Frontend)**:
  - Um botão de microfone (`🎤`) foi adicionado na barra inferior do chat.
  - Ao clicar para gravar, o input de texto tradicional é ocultado e substituído pelo status de gravação ativo com indicador piscante ("● Gravando..."), timer de duração e botão de descarte/cancelamento (`❌`).
  - O atendente pode finalizar e enviar a gravação clicando no **botão verde de enviar**, pressionando a tecla **Enter** ou clicando novamente no **microfone vermelho**.
  - O áudio é capturado do microfone físico do atendente via API `MediaRecorder` do navegador, compactado com o codec `Opus` no container `Ogg` e convertido em Base64 para envio via socket.
* **Processamento (Backend)**:
  - O backend intercepta o arquivo e, se for do tipo áudio, envia oficial e nativamente como mensagem de voz no WhatsApp usando a opção `{ sendAudioAsVoice: true }`.
  - No celular do cliente final, a gravação aparece como uma nota de voz oficial (com barra de reprodução e foto do atendente), sem a indicação de "arquivo anexado".
  - *Nota*: Em chats de equipe internos, o áudio é enviado como anexo de áudio comum para permitir o parsing correto da tag interna de roteamento.

### 2. Player de Áudio Embutido no Chat
* **Interface (Frontend)**:
  - Mensagens que contêm áudios (sejam notas de voz recebidas dos clientes ou enviadas pelos atendentes) agora exibem um player de áudio nativo HTML5 (`<audio controls>`) diretamente dentro do balão de mensagem no chat.
  - O atendente pode dar "Play", pausar e controlar o volume sem precisar fazer o download manual do arquivo de áudio.

### 3. Sistema de Respostas (Replies / Quotes)
* **Interface (Frontend)**:
  - Ao passar o mouse sobre qualquer mensagem do histórico, um botão de resposta (`↩`) é exibido.
  - Clicar nele ativa o painel de citação acima do campo de texto com o nome do remetente e a prévia do conteúdo da mensagem original.
  - Ao enviar a resposta, a nova mensagem exibe o balão citado de forma compacta dentro do histórico do ZappTor.
  - **Destaque Dinâmico**: Ao clicar na mensagem citada no histórico, a tela rola suavemente (`scrollIntoView`) até a mensagem original e pisca um fundo amarelo temporário para destacar o contexto.
* **Processamento (Backend)**:
  - O backend repassa a propriedade `{ quotedMessageId }` ao método `client.sendMessage(...)` do WhatsApp, garantindo que o cliente final receba a resposta encadeada oficialmente no seu celular.
  - O histórico de mensagens do ZappTor agora mapeia e serializa de forma assíncrona as mensagens respondidas (`quotedMsg`) diretamente dos metadados do WhatsApp.

### 4. Reações com Emojis nas Mensagens
* **Interface (Frontend)**:
  - Adicionado um menu flutuante de reações rápidas (`😀`) ao passar o mouse pelas mensagens.
  - O atendente pode escolher um emoji (👍, ❤️, 😂, 😮, 😢, 🙏) para reagir à mensagem.
  - As reações de cada mensagem são renderizadas em pequenos balões empilhados logo abaixo da mensagem, com a contagem acumulada.
* **Processamento (Backend)**:
  - A ação de reações do frontend é enviada via socket e executa `message.react(emoji)`.
  - O backend escuta o evento nativo `message_reaction` do WhatsApp e notifica todos os operadores via socket para atualizar o contador de reações instantaneamente em tela.

### 5. Confirmação de Entrega e Leitura (Ticks de Status)
* **Interface (Frontend)**:
  - Mensagens enviadas pelos atendentes agora exibem os tradicionais indicadores de leitura (ticks) no rodapé de cada balão:
    - `⏱` : Mensagem pendente/enviando.
    - `✓` : Mensagem enviada com sucesso ao servidor do WhatsApp.
    - `✓✓` (Cinza) : Mensagem entregue no aparelho celular do cliente.
    - `✓✓` (Azul) : Mensagem aberta/lida pelo cliente.
* **Processamento (Backend)**:
  - O backend escuta o evento `message_ack` do WhatsApp e transmite instantaneamente as mudanças de status da mensagem via socket para atualização em tempo real.

---

## 🔧 Melhorias de UX e Identidade Visual (v2.0.7)

### 1. Fechamento de Telas e Chat com a Tecla ESC
- Adicionado um escutador global para a tecla **Escape (ESC)**.
- Ao pressionar ESC, o sistema executa na ordem de prioridade:
  1. Fecha o modal de confirmação ativo (`view-confirm`).
  2. Fecha o Painel de Administração (`view-admin`).
  3. Fecha o Painel do Root (`view-root`).
  4. Limpa a seleção do chat atual (`deselectChat()`) e retorna a tela principal para o painel de boas-vindas do ZappTor.

### 2. Título Dinâmico da Empresa na Tela Inicial
- O título genérico "ZappTor Premium" exibido no banner inicial de boas-vindas foi substituído.
- Agora, o sistema detecta a empresa vinculada ao usuário logado e exibe dinamicamente: **"ZappTor [Nome da Empresa]"**.

---

## 🔧 Manutenção e Diagnóstico Técnico
* **Exposição de Erros do WhatsApp**:
  - Modifiquei o bloco `catch` do envio de mensagens em `server.js` para retransmitir a mensagem de erro original do Puppeteer/WhatsApp para o frontend (`error.message`).
  - Caso haja falhas de envio (ex: falhas de autenticação do Puppeteer, conexão instável com a internet ou falta de saldo/bloqueio de número), o sistema exibirá o motivo exato do erro no banner de erro do frontend para fácil diagnóstico.
