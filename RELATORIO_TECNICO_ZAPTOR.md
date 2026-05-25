# Relatório Técnico - Projeto ZapTor 2.0

## 1. Objetivo
Migrar o aplicativo de compartilhamento de WhatsApp (Zapping) de uma infraestrutura local/intranet para uma arquitetura baseada em nuvem (Cloud), utilizando Render (Backend) e Vercel (Frontend), eliminando a necessidade de instalações nos computadores dos clientes.

## 2. Mudanças Realizadas
- **Rebranding:** Alteração do nome de "Zapping" para "ZapTor".
- **Backend (Render):**
    - Criação de um servidor Node.js otimizado para Docker.
    - Implementação do `whatsapp-web.js` com estratégia de `LocalAuth`.
    - Configuração de Puppeteer para rodar em modo "single-process" para economizar RAM.
    - Adição de endpoints de API para listar conversas (`/api/chats`) e mensagens (`/api/chats/:id/messages`).
- **Frontend (Vercel/HTML):**
    - Criação de um "Super HTML" único contendo CSS (Tailwind) e lógica de Socket.io.
    - Implementação de interface com barra lateral de chats e área de mensagens.

## 3. Estado Atual do Código
- O código está versionado no GitHub: `https://github.com/sysimperium/zaptor`.
- O backend está configurado no Render com Dockerfile customizado.
- O frontend possui um arquivo `vercel.json` para tentativa de roteamento estático.

## 4. Erros Identificados e Pendências

### A. Erro 502 Bad Gateway (Render)
- **Sintoma:** O backend no Render para de responder ou não inicia corretamente.
- **Causa Técnica:** O limite de 512MB de RAM do plano Free do Render é insuficiente para manter o Chromium (navegador do WhatsApp) estável por muito tempo. O processo "morre" por falta de memória (OOM Kill), resultando no erro 502.
- **Sugestão de Correção:** Migrar o backend para uma VPS com pelo menos 2GB de RAM (ex: Oracle Cloud Always Free) ou utilizar uma API paga de WhatsApp (Z-API, Evolution).

### B. Vercel - Tela em Branco (ERR_CONNECTION_CLOSED)
- **Sintoma:** O link da Vercel não carrega o conteúdo.
- **Causa Técnica:** Conflito de detecção de projeto. A Vercel detecta o `package.json` e tenta realizar um build de Node.js no lado do cliente, falhando ao servir o `index.html` como arquivo estático.
- **Sugestão de Correção:** Mover o `index.html` para uma pasta chamada `public` e configurar o `Root Directory` na Vercel para essa pasta, separando o código do frontend do código do backend.

### C. Erros de CORS no Console
- **Sintoma:** `Access to XMLHttpRequest ... has been blocked by CORS policy`.
- **Causa Técnica:** O navegador bloqueia requisições vindas de `file://` (abrir arquivo local) ou de domínios diferentes quando os cabeçalhos do servidor não estão perfeitamente alinhados ou quando o servidor está fora do ar (Erro 502).

## 5. Próximos Passos Recomendados
1. Validar a execução do servidor em uma máquina com mais memória RAM.
2. Separar o repositório do Frontend (HTML Estático) do repositório do Backend (Node.js/Docker) para evitar conflitos na Vercel.
3. Implementar a persistência de sessão (RemoteAuth) no Supabase Storage para evitar que o celular deslogue quando o servidor reiniciar.
