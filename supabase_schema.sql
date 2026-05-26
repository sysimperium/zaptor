-- ============================================================
-- ZappTor 2.0.1 - Schema do Banco de Dados (Supabase/PostgreSQL)
-- Execute este script no SQL Editor do seu projeto Supabase
-- ============================================================

-- ── 1. ATUALIZAÇÃO DE TABELAS EXISTENTES (Caso já possua dados) ──
-- Estes comandos adicionam as novas colunas necessárias sem apagar seus dados atuais.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'START' CHECK (plan IN ('START', 'TEAM', 'BUSINESS', 'ENTERPRISE'));
ALTER TABLE companies ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS signature_type TEXT DEFAULT 'none' CHECK (signature_type IN ('none', 'name', 'name_team'));

-- Criação da tabela de equipes (precisa existir antes do campo team_id na tabela de usuários)
CREATE TABLE IF NOT EXISTS teams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, name)
);

ALTER TABLE zaptor_users ADD COLUMN IF NOT EXISTS password TEXT DEFAULT '123456';
ALTER TABLE zaptor_users ADD COLUMN IF NOT EXISTS whatsapp_contact TEXT;
ALTER TABLE zaptor_users ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS receiver_name TEXT;

-- Criação da tabela de faturas/mensalidades
CREATE TABLE IF NOT EXISTS installments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    due_date DATE NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    status TEXT DEFAULT 'agendada' CHECK (status IN ('agendada', 'paga', 'atrasada', 'pendente')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── 2. CRIAÇÃO DE TABELAS DO ZERO (Caso seja um projeto novo) ──

CREATE TABLE IF NOT EXISTS companies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    phone_number TEXT,
    plan TEXT DEFAULT 'START' CHECK (plan IN ('START', 'TEAM', 'BUSINESS', 'ENTERPRISE')),
    due_date DATE,
    signature_type TEXT DEFAULT 'none' CHECK (signature_type IN ('none', 'name', 'name_team')),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zaptor_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    password TEXT DEFAULT '123456',
    whatsapp_contact TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('root', 'admin', 'user')),
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, name)
);

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
    is_internal BOOLEAN DEFAULT FALSE,
    receiver_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── 3. ÍNDICES ──
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_zaptor_users_company ON zaptor_users(company_id);
CREATE INDEX IF NOT EXISTS idx_teams_company ON teams(company_id);
CREATE INDEX IF NOT EXISTS idx_installments_company ON installments(company_id);

-- ============================================================
-- DADOS INICIAIS (SEED)
-- ============================================================

-- Cria a empresa padrão
INSERT INTO companies (name, slug, phone_number, plan, due_date, signature_type, active)
VALUES ('Minha Empresa', 'minha-empresa', '', 'START', '2026-06-25', 'none', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Cria o usuário admin padrão
INSERT INTO zaptor_users (company_id, name, password, role, active)
SELECT id, 'Admin', 'admin123', 'admin', TRUE
FROM companies WHERE slug = 'minha-empresa'
ON CONFLICT (company_id, name) DO NOTHING;

-- ============================================================
-- SEGURANÇA: Row Level Security (RLS)
-- O backend usa a SERVICE KEY que bypassa o RLS
-- O frontend usa a ANON KEY com as políticas abaixo
-- ============================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaptor_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;

-- Políticas para leitura (DROP antes de CREATE para evitar erros em execuções sucessivas)
DROP POLICY IF EXISTS "Leitura pública de empresas" ON companies;
CREATE POLICY "Leitura pública de empresas" ON companies FOR SELECT USING (active = TRUE);

DROP POLICY IF EXISTS "Leitura pública de usuários" ON zaptor_users;
CREATE POLICY "Leitura pública de usuários" ON zaptor_users FOR SELECT USING (active = TRUE);

DROP POLICY IF EXISTS "Leitura pública de equipes" ON teams;
CREATE POLICY "Leitura pública de equipes" ON teams FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Leitura pública de mensagens" ON messages;
CREATE POLICY "Leitura pública de mensagens" ON messages FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Leitura pública de mensalidades" ON installments;
CREATE POLICY "Leitura pública de mensalidades" ON installments FOR SELECT USING (TRUE);
