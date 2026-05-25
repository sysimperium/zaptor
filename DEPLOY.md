# 🚀 ZapTor 2.0 — Guia de Deploy

> **Objetivo:** Colocar o ZapTor na nuvem sem precisar de Docker ou PC servidor na intranet.
> - **Backend (WhatsApp):** Railway
> - **Frontend (Interface):** Vercel
> - **Banco de dados / Usuários:** Supabase

---

## PASSO 1 — Criar o Banco de Dados no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita
2. Clique em **New Project** → escolha um nome (ex: `zaptor`) → anote a senha do banco
3. Aguarde o projeto ser criado (~1 minuto)
4. Vá em **SQL Editor** (menu lateral esquerdo)
5. Clique em **New Query**
6. Copie todo o conteúdo do arquivo `supabase_schema.sql` e cole no editor
7. Clique em **Run** (ou `Ctrl+Enter`)
8. Você verá a mensagem "Success. No rows returned" — tabelas criadas!

### Coletando as chaves do Supabase:
- Vá em **Settings → API**
- Copie: **Project URL** → será o `SUPABASE_URL`
- Copie: **service_role** key (a chave longa embaixo) → será o `SUPABASE_SERVICE_KEY`

---

## PASSO 2 — Deploy do Backend no Railway

1. Acesse [railway.app](https://railway.app) e crie uma conta (pode usar GitHub)
2. Clique em **New Project → Deploy from GitHub repo**
3. Conecte seu repositório GitHub (ou faça o upload dos arquivos manualmente)
   - **Importante:** O Railway precisa ver os arquivos da pasta `ZapTor_HTML/`
   - Se preferir, crie um novo repo só com os arquivos desta pasta
4. O Railway vai detectar o `Dockerfile` automaticamente e fazer o build

### Configurar Variáveis de Ambiente no Railway:
Vá em **Variables** no seu projeto Railway e adicione:

```
SUPABASE_URL          = https://xxxx.supabase.co
SUPABASE_SERVICE_KEY  = eyJhbGci...
COMPANY_SLUG          = minha-empresa
ADMIN_KEY             = SuaSenhaAdminSegura
```

> ⚠️ **IMPORTANTE:** Troque `SuaSenhaAdminSegura` por algo difícil. Esta é a "senha" do painel admin.

5. Aguarde o deploy terminar (3-8 minutos na primeira vez — instala o Chrome)
6. Anote a **URL do seu serviço** (ex: `https://zaptor-backend-production.up.railway.app`)

### Escanear o QR Code:
- Após o deploy, abra: `https://sua-url.railway.app/api/status`
- Se aparecer `{"ready":false,"hasQR":true}`, vá para o PASSO 3

---

## PASSO 3 — Deploy do Frontend na Vercel

1. Acesse [vercel.com](https://vercel.com) e crie uma conta
2. Clique em **New Project → Import Git Repository**
3. Selecione o repositório com os arquivos do ZapTor

### Configurar o projeto na Vercel:
- **Framework Preset:** Other (nenhum)
- **Root Directory:** `ZapTor_HTML` (se o repo tem a pasta, selecione ela)
- **Build Command:** (deixe em branco)
- **Output Directory:** `.` (ponto)

4. Clique em **Deploy**
5. Após o deploy, anote a URL (ex: `https://zaptor.vercel.app`)

---

## PASSO 4 — Conectar o Frontend ao Backend

O frontend detecta automaticamente o backend pela URL do Railway, mas na primeira vez você precisa informá-lo:

1. Abra sua URL da Vercel no navegador
2. Se aparecer a tela de erro "Servidor não encontrado", cole a URL do Railway no campo e clique em **Tentar Conectar**
3. O endereço fica salvo no seu navegador automaticamente

> 💡 **Para todos os PCs da equipe:** Após acessar pela primeira vez e configurar a URL do Railway, ela fica salva. Os próximos acessos são automáticos.

---

## PASSO 5 — Escanear o QR Code do WhatsApp

1. Abra o frontend (URL da Vercel)
2. Se o WhatsApp não estiver conectado, a tela de QR Code aparecerá automaticamente
3. Abra o **WhatsApp no celular** → **Dispositivos Conectados** → **Conectar dispositivo**
4. Escaneie o QR Code na tela
5. Aguarde a mensagem "WhatsApp Conectado ✓"

---

## PASSO 6 — Criar Usuários (Painel Admin)

1. Na tela de login do ZapTor, clique em **"Acessar painel admin"**
2. Digite a `ADMIN_KEY` que você configurou no Railway
3. No painel admin, adicione os nomes dos usuários que poderão usar o sistema
   - Ex: `João (Vendas)`, `Maria (Suporte)`, `Pedro (TI)`
4. Cada pessoa entra no ZapTor digitando exatamente o nome cadastrado

---

## Resumo das URLs

| Serviço | URL |
|---|---|
| Frontend | `https://seu-projeto.vercel.app` |
| Backend | `https://seu-projeto.railway.app` |
| Status Backend | `https://seu-projeto.railway.app/api/status` |
| QR Code | `https://seu-projeto.railway.app/api/qr` |

---

## ❓ Problemas Comuns

**"Servidor não encontrado"**
→ O Railway ainda está fazendo o deploy ou a URL está errada. Aguarde e tente de novo.

**QR Code não aparece**
→ Aguarde 2-3 minutos após o deploy do Railway. O Chrome precisa inicializar.

**"Nome não cadastrado"**
→ O administrador precisa cadastrar o nome no painel admin antes do usuário entrar.

**WhatsApp desconecta sempre**
→ Normal nas primeiras 24h. Após a sessão estabilizar, permanece conectado.

---

## 🔄 Manutenção

- **Ver logs do backend:** Railway → seu projeto → clique em **Logs**
- **Reiniciar backend:** Railway → seu projeto → **Redeploy**
- **Gerenciar usuários:** Botão de escudo no painel do chat (ícone admin)
