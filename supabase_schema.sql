-- ============================================================
-- ZapTor 2.0 - Schema do Banco de Dados (Supabase/PostgreSQL)
-- Execute este script no SQL Editor do seu projeto Supabase
-- ============================================================

-- 1. Tabela de Empresas
CREATE TABLE IF NOT EXISTS companies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Usuários do ZapTor
CREATE TABLE IF NOT EXISTS zaptor_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK (role IN ('root', 'admin', 'user')),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, name)
);

-- 3. Tabela de Mensagens (histórico persistente)
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    chat_id TEXT NOT NULL,
    from_number TEXT,
    to_number TEXT,
    body TEXT,
    timestamp BIGINT,
    from_me BOOLEAN DEFAULT FALSE,
    has_media BOOLEAN DEFAULT FALSE,
    type TEXT DEFAULT 'chat',
    sender_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_zaptor_users_company ON zaptor_users(company_id);

-- ============================================================
-- DADOS INICIAIS (SEED)
-- ============================================================

-- Cria a empresa padrão
INSERT INTO companies (name, slug, active)
VALUES ('Minha Empresa', 'minha-empresa', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Cria o usuário admin padrão (troque 'Admin' pelo nome real)
-- O ADMIN_KEY definido no .env é a "senha" para acessar o painel admin
INSERT INTO zaptor_users (company_id, name, role, active)
SELECT id, 'Admin', 'admin', TRUE
FROM companies WHERE slug = 'minha-empresa'
ON CONFLICT (company_id, name) DO NOTHING;

-- ============================================================
-- SEGURANÇA: Row Level Security (RLS)
-- O backend usa a SERVICE KEY que bypassa o RLS
-- O frontend usa a ANON KEY com as políticas abaixo
-- ============================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaptor_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Permite que qualquer pessoa autenticada leia a lista de usuários ativos
-- (o backend valida o nome, mas o frontend pode fazer o fetch também)
CREATE POLICY "Leitura pública de usuários ativos"
ON zaptor_users FOR SELECT
USING (active = TRUE);

-- Apenas o backend (service key) pode inserir/atualizar/deletar usuários
-- Políticas mais restritivas para INSERT/UPDATE/DELETE são gerenciadas pelo backend

-- Permite leitura pública de mensagens (o backend já filtra por company)
CREATE POLICY "Leitura pública de mensagens"
ON messages FOR SELECT
USING (TRUE);
