// ============================================================
// ZappTor 2.0.1 - Backend (Node.js + whatsapp-web.js)
// Deploy: Railway | Frontend: Vercel | DB: Supabase
// ============================================================

const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ── Configuração ─────────────────────────────────────────────
const PORT = 3001;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123'; // Chave global de fallback
const ROOT_KEY = process.env.ROOT_KEY || 'root123'; // Chave para acesso global Root

// Limites dos Planos
const PLAN_LIMITS = {
    'START': { maxUsers: 10, maxTeams: 0, maxPhones: 1 },
    'TEAM': { maxUsers: 20, maxTeams: 2, maxPhones: 1 },
    'BUSINESS': { maxUsers: 40, maxTeams: 4, maxPhones: 2 },
    'ENTERPRISE': { maxUsers: 999999, maxTeams: 999999, maxPhones: 10 }
};

// ── Supabase ──────────────────────────────────────────────────
let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    const cleanUrl = SUPABASE_URL.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
    supabase = createClient(cleanUrl, SUPABASE_SERVICE_KEY, {
        auth: {
            persistSession: false
        }
    });
    console.log('[Supabase] Conectado com URL:', cleanUrl);
} else {
    console.warn('[Supabase] AVISO: Variáveis de ambiente não configuradas. Rodando sem persistência.');
}

// ── Express + Socket.io ───────────────────────────────────────
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

// Headers CORS robustos
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key, x-root-key, x-company-id, x-user-id, x-user-name');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ── Estado Global: Multi-Tenant ────────────────────────────────
const companyClients = new Map(); // companyId -> ClientState { client, ready, qr, error }

// Inicialização dinâmica do cliente WhatsApp da Empresa
async function initCompanyClient(company, ioInstance) {
    if (companyClients.has(company.id)) {
        return companyClients.get(company.id);
    }

    console.log(`[WhatsApp - ${company.slug}] Inicializando cliente...`);

    const sessionPath = path.join(__dirname, '.wwebjs_auth', `session-${company.id}`);
    
    const isLocal = process.platform === 'win32' || !process.env.PUPPETEER_EXECUTABLE_PATH;
    console.log(`[WhatsApp - ${company.slug}] Rodando em ambiente local: ${isLocal} (headless: ${!isLocal})`);

    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    if (isLocal && process.platform === 'win32') {
        const standardChromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        const x86ChromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
        if (fs.existsSync(standardChromePath)) {
            executablePath = standardChromePath;
        } else if (fs.existsSync(x86ChromePath)) {
            executablePath = x86ChromePath;
        }
    }

    const client = new Client({
        authStrategy: new LocalAuth({ dataPath: sessionPath }),
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        puppeteer: {
            headless: isLocal ? false : true,
            executablePath: executablePath,
            handleSIGTERM: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ],
            timeout: 60000,
        },
    });

    const clientState = {
        client,
        ready: false,
        qr: null,
        error: null
    };

    companyClients.set(company.id, clientState);

    client.on('qr', async (qr) => {
        console.log(`[WhatsApp - ${company.slug}] QR Code gerado.`);
        try {
            clientState.qr = await qrcode.toDataURL(qr, { errorCorrectionLevel: 'M', scale: 6 });
            ioInstance.to(company.id).emit('whatsapp_qr', { qr: clientState.qr });
        } catch (err) {
            console.error(`[QR - ${company.slug}] Erro ao gerar QR:`, err.message);
        }
    });

    client.on('loading_screen', (percent, message) => {
        console.log(`[WhatsApp - ${company.slug}] Carregando: ${percent}% - ${message}`);
        ioInstance.to(company.id).emit('whatsapp_loading', { percent, message });
    });

    client.on('authenticated', () => {
        console.log(`[WhatsApp - ${company.slug}] Autenticado.`);
        clientState.qr = null;
        ioInstance.to(company.id).emit('whatsapp_authenticated');
    });

    client.on('ready', async () => {
        const connectedNumber = client.info.wid.user;
        console.log(`[WhatsApp - ${company.slug}] Pronto! Conectado no número: ${connectedNumber}`);

        // Validação do número autorizado se definido na empresa
        if (company.phone_number && company.phone_number.trim()) {
            const allowed = company.phone_number.split(',').map(n => n.replace(/\D/g, '').trim()).filter(Boolean);
            const cleanConnected = connectedNumber.replace(/\D/g, '').trim();

            if (allowed.length > 0) {
                const isAllowed = allowed.some(num => cleanConnected.endsWith(num) || num.endsWith(cleanConnected));
                if (!isAllowed) {
                    console.warn(`[WhatsApp - ${company.slug}] Número conectado (${connectedNumber}) não autorizado! Autorizados: ${company.phone_number}`);
                    clientState.ready = false;
                    clientState.error = `Número desconectado por falta de autorização. Número conectado: ${connectedNumber}. Permitidos: ${company.phone_number}`;
                    ioInstance.to(company.id).emit('whatsapp_status', { ready: false, error: 'unauthorized_number', number: connectedNumber, allowed: company.phone_number });
                    
                    try {
                        await client.logout();
                        await client.destroy();
                    } catch (e) {}
                    
                    // Limpar a pasta de autenticação para forçar um novo escaneamento
                    try {
                        fs.rmSync(sessionPath, { recursive: true, force: true });
                    } catch (e) {}
                    
                    companyClients.delete(company.id);
                    return;
                }
            }
        }

        clientState.ready = true;
        clientState.qr = null;
        clientState.error = null;
        ioInstance.to(company.id).emit('whatsapp_status', { ready: true });
    });

    client.on('auth_failure', async (msg) => {
        console.error(`[WhatsApp - ${company.slug}] Falha de autenticação:`, msg);
        clientState.ready = false;
        clientState.error = 'auth_failure';
        ioInstance.to(company.id).emit('whatsapp_status', { ready: false, error: 'auth_failure' });
        // Remove o cliente morto para permitir nova tentativa limpa
        companyClients.delete(company.id);
        try { await client.destroy(); } catch (e) {}
        // Limpa a sessão para forçar escaneamento de novo QR
        try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch (e) {}
        console.log(`[WhatsApp - ${company.slug}] Cliente removido após auth_failure. Pronto para novo QR.`);
    });

    client.on('disconnected', async (reason) => {
        console.log(`[WhatsApp - ${company.slug}] Desconectado:`, reason);
        clientState.ready = false;
        ioInstance.to(company.id).emit('whatsapp_status', { ready: false, reason });
        companyClients.delete(company.id);
        try { await client.destroy(); } catch (e) {}
    });

    // Interceptação de mensagens recebidas ou enviadas
    client.on('message_create', async (msg) => {
        const msgData = {
            id: msg.id._serialized,
            chatId: msg.id.remote || (msg.fromMe ? msg.to : msg.from),
            from: msg.from,
            to: msg.to,
            body: msg.body,
            timestamp: msg.timestamp,
            fromMe: msg.fromMe,
            hasMedia: msg.hasMedia,
            type: msg.type,
        };

        // Tratamento especial para Chat Interno da Equipe
        // Verifica se a mensagem foi enviada para si mesmo e contém a tag de chat interno
        const isSelf = msg.to === client.info.wid._serialized && msg.from === client.info.wid._serialized;
        let isInternal = false;
        let senderName = null;
        let receiverName = null;

        if (msg.body && msg.body.includes('*ZappTor Chat Interno*')) {
            isInternal = true;
            const match = msg.body.match(/\*De:\s*(.*?)\s*\|\s*Para:\s*(.*?)\*/);
            if (match) {
                senderName = match[1];
                receiverName = match[2];
                // Extrai o conteúdo real da mensagem
                const lines = msg.body.split('\n');
                msgData.body = lines.slice(2).join('\n').trim();
            }
        }

        msgData.isInternal = isInternal;
        msgData.senderName = senderName;
        msgData.receiverName = receiverName;

        ioInstance.to(company.id).emit('whatsapp_message', msgData);

        // Persiste no Supabase
        if (supabase) {
            try {
                await supabase.from('messages').upsert({
                    id: msgData.id,
                    company_id: company.id,
                    chat_id: msgData.chatId,
                    from_number: msgData.from,
                    to_number: msgData.to,
                    body: msgData.body,
                    timestamp: msgData.timestamp,
                    from_me: msgData.fromMe,
                    has_media: msgData.hasMedia,
                    type: msgData.type,
                    is_internal: isInternal,
                    sender_name: senderName || (msgData.fromMe ? 'Sistema' : null),
                    receiver_name: receiverName
                }, { onConflict: 'id', ignoreDuplicates: true });
            } catch (err) {
                // Silencioso
            }
        }
    });

    client.initialize().catch(err => {
        console.error(`[WhatsApp - ${company.slug}] Erro ao inicializar:`, err.message);
        clientState.error = err.message;
    });

    return clientState;
}

// ── Middlewares de Segurança ──────────────────────────────────

// Requer que o cliente WhatsApp da empresa esteja pronto
const requireCompanyClient = async (req, res, next) => {
    const companyId = req.headers['x-company-id'];
    if (!companyId) {
        return res.status(400).json({ error: 'ID da empresa não informado no cabeçalho (x-company-id).' });
    }
    const clientState = companyClients.get(companyId);
    if (!clientState || !clientState.ready) {
        return res.status(503).json({ error: 'WhatsApp da empresa não está conectado ainda.' });
    }
    req.companyClient = clientState.client;
    req.companyId = companyId;
    next();
};

// Requer autenticação de Administrador da Empresa
const requireAdmin = async (req, res, next) => {
    const key = req.headers['x-admin-key'];
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'ID da empresa não informado.' });

    if (supabase) {
        try {
            const { data: user, error } = await supabase
                .from('zaptor_users')
                .select('password')
                .eq('company_id', companyId)
                .eq('role', 'admin')
                .eq('active', true)
                .single();

            if (user && user.password === key) {
                req.companyId = companyId;
                return next();
            }
        } catch (e) {}
    }

    // Fallback para chave de administrador global do .env
    if (key === ADMIN_KEY) {
        req.companyId = companyId;
        return next();
    }

    return res.status(401).json({ error: 'Chave de administrador inválida.' });
};

// Requer autenticação de Root global do Sistema
const requireRoot = async (req, res, next) => {
    try {
        const key = req.headers['x-root-key'];
        const userId = req.headers['x-user-id'];

        // 1. Validar via chave de root clássica
        if (key && key === ROOT_KEY) {
            return next();
        }

        // 2. Validar via UUID do usuário (Root logado pelo Supabase)
        if (userId) {
            if (!supabase) {
                if (userId === 'root-id') {
                    return next();
                }
            } else {
                const { data: user, error } = await supabase
                    .from('zaptor_users')
                    .select('role, active')
                    .eq('id', userId)
                    .single();

                if (!error && user && user.role === 'root' && user.active) {
                    return next();
                }
            }
        }

        return res.status(401).json({ error: 'Chave de root inválida ou acesso Root não autorizado.' });
    } catch (err) {
        console.error('[requireRoot] Erro no middleware de autenticação root:', err);
        return res.status(500).json({ error: 'Erro interno na validação de Root.' });
    }
};

// Rota raiz para servir o frontend index.html caso acessado via navegador
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ── API: Status Geral e Conexão ────────────────────────────────
app.get('/api/status', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    if (!companyId) {
        return res.json({
            ready: false,
            hasQR: false,
            version: '2.0.1',
            message: 'ZappTor Multi-Tenant'
        });
    }

    const clientState = companyClients.get(companyId);
    res.json({
        ready: clientState ? clientState.ready : false,
        hasQR: clientState ? !!clientState.qr : false,
        error: clientState ? clientState.error : null,
        version: '2.0.1',
    });
});

app.get('/api/qr', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'ID da empresa não informado.' });

    const clientState = companyClients.get(companyId);
    if (!clientState) {
        // Inicializa o cliente se a empresa existir e não estiver rodando
        if (supabase) {
            const { data: company } = await supabase.from('companies').select('*').eq('id', companyId).single();
            if (company && company.active) {
                const newState = await initCompanyClient(company, io);
                if (newState.ready) return res.json({ ready: true });
                if (newState.qr) return res.json({ qr: newState.qr });
            }
        }
        return res.json({ waiting: true, message: 'Inicializando WhatsApp...' });
    }

    if (clientState.ready) return res.json({ ready: true });
    if (clientState.qr) return res.json({ qr: clientState.qr });
    if (clientState.error) return res.json({ error: clientState.error });
    res.json({ waiting: true, message: 'Aguardando QR Code...' });
});

// ── API: Login Unificado (Root, Admin, User) ───────────────────
app.post('/api/auth/login', async (req, res) => {
    const { name, password, companySlug, email, loginType } = req.body;

    // 1. Verificação de Acesso Root
    if (name?.trim().toLowerCase() === 'root' || loginType === 'root') {
        if (!supabase) {
            // Fallback local se Supabase não configurado
            if (password === ROOT_KEY) {
                return res.json({
                    valid: true,
                    user: { id: 'root-id', name: 'Root', role: 'root' }
                });
            }
            return res.status(401).json({ valid: false, error: 'Chave Root inválida.' });
        }

        try {
            // Autentica via Supabase Auth
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password
            });

            if (error || !data.user) {
                return res.status(401).json({ valid: false, error: 'E-mail ou senha de Root inválidos.' });
            }

            // Verifica se existe o registro do root na tabela zaptor_users
            let { data: dbUser } = await supabase
                .from('zaptor_users')
                .select('*')
                .eq('id', data.user.id)
                .single();

            if (!dbUser) {
                // Sincroniza automaticamente a referência do root no banco
                const { data: newUser, error: insErr } = await supabase
                    .from('zaptor_users')
                    .insert({
                        id: data.user.id,
                        name: 'Root',
                        role: 'root',
                        active: true
                    })
                    .select()
                    .single();

                if (insErr) {
                    return res.status(500).json({ valid: false, error: 'Erro ao registrar root no banco: ' + insErr.message });
                }
                dbUser = newUser;
            }

            if (dbUser.role !== 'root') {
                return res.status(403).json({ valid: false, error: 'Este usuário não possui privilégios de Root.' });
            }

            return res.json({
                valid: true,
                user: {
                    id: dbUser.id,
                    name: dbUser.name,
                    role: 'root'
                }
            });
        } catch (err) {
            console.error('[Root Auth Login] Erro:', err.message);
            return res.status(500).json({ valid: false, error: 'Erro interno na autenticação do Root.' });
        }
    }

    if (!name || !name.trim()) {
        return res.status(400).json({ valid: false, error: 'Nome de usuário é obrigatório.' });
    }

    // Para acessos de empresas comuns, precisa de slug
    if (!companySlug || !companySlug.trim()) {
        return res.status(400).json({ valid: false, error: 'Código (slug) da empresa é obrigatório.' });
    }

    if (!supabase) {
        // Modo desenvolvimento sem Supabase
        return res.json({
            valid: true,
            user: {
                id: 'mock-user-id',
                company_id: 'mock-company-id',
                name: name.trim(),
                role: name.trim().toLowerCase() === 'admin' ? 'admin' : 'user'
            },
            company: {
                id: 'mock-company-id',
                name: 'Empresa Dev',
                slug: companySlug.trim().toLowerCase(),
                plan: 'START',
                signature_type: 'none'
            }
        });
    }

    try {
        // 2. Busca a empresa
        const { data: company, error: cErr } = await supabase
            .from('companies')
            .select('*')
            .eq('slug', companySlug.trim().toLowerCase())
            .single();

        if (cErr || !company) {
            return res.json({ valid: false, error: 'Empresa não encontrada ou código incorreto.' });
        }

        if (!company.active) {
            return res.json({ valid: false, error: 'Acesso suspenso. Entre em contato com o suporte.' });
        }

        // 3. Busca o usuário
        const { data: user, error: uErr } = await supabase
            .from('zaptor_users')
            .select('id, name, role, password, active, team_id')
            .eq('company_id', company.id)
            .ilike('name', name.trim())
            .single();

        if (uErr || !user) {
            return res.json({ valid: false, error: 'Usuário não cadastrado nesta empresa.' });
        }

        if (!user.active) {
            return res.json({ valid: false, error: 'Usuário inativo. Fale com o administrador.' });
        }

        // 4. Validação da senha
        if (user.password !== password) {
            return res.json({ valid: false, error: 'Senha incorreta.' });
        }

        // Se for admin/user, já inicia o cliente do whatsapp em background
        initCompanyClient(company, io).catch(() => {});

        res.json({
            valid: true,
            user: {
                id: user.id,
                company_id: company.id,
                name: user.name,
                role: user.role,
                team_id: user.team_id
            },
            company: {
                id: company.id,
                name: company.name,
                slug: company.slug,
                phone_number: company.phone_number,
                plan: company.plan,
                signature_type: company.signature_type,
                due_day: company.due_day
            }
        });
    } catch (err) {
        console.error('[Auth Login] Erro:', err.message);
        res.status(500).json({ valid: false, error: 'Erro interno ao realizar login.' });
    }
});

// ── API: WhatsApp (Conversas e Ações) ─────────────────────────
app.get('/api/chats', requireCompanyClient, async (req, res) => {
    try {
        const chats = await req.companyClient.getChats();
        res.json(chats.map(c => ({
            id: c.id._serialized,
            name: c.name || c.id.user || 'Desconhecido',
            isGroup: c.isGroup,
            unreadCount: c.unreadCount,
            timestamp: c.timestamp,
        })));
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

app.get('/api/chats/:chatId/messages', requireCompanyClient, async (req, res) => {
    const { chatId } = req.params;
    const { isInternal } = req.query;

    if (isInternal === 'true') {
        if (!supabase) return res.json([]);
        try {
            // Busca o nome do outro usuário (chatId é o ID dele no banco)
            const { data: otherUser } = await supabase
                .from('zaptor_users')
                .select('name')
                .eq('id', chatId)
                .single();

            const currentUserName = req.headers['x-user-name'];
            if (!otherUser || !currentUserName) return res.json([]);

            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('company_id', req.companyId)
                .eq('is_internal', true)
                .or(`and(sender_name.eq."${currentUserName}",receiver_name.eq."${otherUser.name}"),and(sender_name.eq."${otherUser.name}",receiver_name.eq."${currentUserName}")`)
                .order('timestamp', { ascending: true });

            if (error) return res.status(500).json({ error: error.message });

            res.json((data || []).map(m => ({
                id: m.id,
                chatId: chatId,
                from: m.from_number,
                to: m.to_number,
                body: m.body,
                timestamp: m.timestamp,
                fromMe: m.sender_name === currentUserName,
                hasMedia: m.has_media,
                type: m.type,
                senderName: m.sender_name,
                receiverName: m.receiver_name
            })));
        } catch (err) {
            res.status(500).json({ error: err.toString() });
        }
        return;
    }

    try {
        const chat = await req.companyClient.getChatById(req.params.chatId);
        const messages = await chat.fetchMessages({ limit: 50 });
        res.json(messages.map(msg => ({
            id: msg.id._serialized,
            chatId: msg.id.remote || (msg.fromMe ? msg.to : msg.from),
            from: msg.from,
            to: msg.to,
            body: msg.body,
            timestamp: msg.timestamp,
            fromMe: msg.fromMe,
            hasMedia: msg.hasMedia,
            type: msg.type,
        })));
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

app.post('/api/chats/:chatId/read', requireCompanyClient, async (req, res) => {
    try {
        const chat = await req.companyClient.getChatById(req.params.chatId);
        await chat.sendSeen();
        io.to(req.companyId).emit('chat_read', { chatId: req.params.chatId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

app.post('/api/chats/:chatId/unread', requireCompanyClient, async (req, res) => {
    try {
        const chat = await req.companyClient.getChatById(req.params.chatId);
        await chat.markUnread();
        io.to(req.companyId).emit('chat_unread', { chatId: req.params.chatId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

app.get('/api/contacts/:contactId/profile-pic', requireCompanyClient, async (req, res) => {
    try {
        let profilePicUrl = null;
        try {
            profilePicUrl = await req.companyClient.pupPage.evaluate(async (cId) => {
                try {
                    const thumb = window.Store.ProfilePicThumb?.get(cId);
                    if (thumb?.eurl) return thumb.eurl;
                    const wid = window.Store.WidFactory.createWid(cId);
                    const pic = await window.Store.ProfilePic.profilePicFind(wid);
                    return pic?.eurl || null;
                } catch (e) { return null; }
            }, req.params.contactId);
        } catch (e) {}
        if (!profilePicUrl) {
            try { profilePicUrl = await req.companyClient.getProfilePicUrl(req.params.contactId); } catch (e) {}
        }
        res.json({ profilePicUrl });
    } catch (err) {
        res.json({ profilePicUrl: null });
    }
});

app.get('/api/messages/:msgId/media', requireCompanyClient, async (req, res) => {
    try {
        const msg = await req.companyClient.getMessageById(req.params.msgId);
        if (!msg?.hasMedia) return res.status(404).json({ error: 'Sem mídia.' });
        const media = await msg.downloadMedia();
        res.json(media);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// ── API ADMIN: Gerenciamento da Empresa ────────────────────────

// Listar Usuários
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    if (!supabase) return res.json([]);
    try {
        const { data, error } = await supabase
            .from('zaptor_users')
            .select(`
                id, name, role, active, password, whatsapp_contact, team_id, created_at,
                teams(name)
            `)
            .eq('company_id', req.companyId)
            .order('name');
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Criar Usuário com Validação de Limites de Plano
app.post('/api/admin/users', requireAdmin, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    const { name, password, whatsapp_contact, role, team_id } = req.body;
    if (!name?.trim() || !password?.trim()) {
        return res.status(400).json({ error: 'Nome e senha são obrigatórios.' });
    }

    try {
        // Obter plano da empresa para validar limites
        const { data: company } = await supabase.from('companies').select('plan').eq('id', req.companyId).single();
        const plan = company?.plan || 'START';
        const limits = PLAN_LIMITS[plan] || PLAN_LIMITS['START'];

        // Contar usuários atuais
        const { count, error: countErr } = await supabase
            .from('zaptor_users')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', req.companyId);

        if (countErr) return res.status(500).json({ error: countErr.message });

        if (count >= limits.maxUsers) {
            return res.status(400).json({
                error: `Limite de usuários atingido para o plano ${plan} (Máximo de ${limits.maxUsers} usuários). Faça upgrade do seu plano.`
            });
        }

        const { data, error } = await supabase
            .from('zaptor_users')
            .insert({
                name: name.trim(),
                password: password.trim(),
                whatsapp_contact: whatsapp_contact ? whatsapp_contact.trim() : null,
                role: role || 'user',
                company_id: req.companyId,
                team_id: team_id || null,
                active: true
            })
            .select()
            .single();

        if (error) return res.status(409).json({ error: 'Usuário já existe ou erro: ' + error.message });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Atualizar Usuário
app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    const { active, password, whatsapp_contact, role, team_id, name } = req.body;
    
    const updateData = {};
    if (active !== undefined) updateData.active = active;
    if (password !== undefined) updateData.password = password;
    if (whatsapp_contact !== undefined) updateData.whatsapp_contact = whatsapp_contact;
    if (role !== undefined) updateData.role = role;
    if (team_id !== undefined) updateData.team_id = team_id;
    if (name !== undefined) updateData.name = name;

    try {
        const { data, error } = await supabase
            .from('zaptor_users')
            .update(updateData)
            .eq('id', req.params.id)
            .eq('company_id', req.companyId)
            .select();

        if (error) return res.status(500).json({ error: error.message });
        if (!data || data.length === 0) return res.status(404).json({ error: 'Usuário não encontrado ou sem permissão para atualizar.' });
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Deletar Usuário
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    try {
        const { error } = await supabase
            .from('zaptor_users')
            .delete()
            .eq('id', req.params.id)
            .eq('company_id', req.companyId);

        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Gerenciar Equipes (Teams)
app.get('/api/admin/teams', requireAdmin, async (req, res) => {
    if (!supabase) return res.json([]);
    try {
        const { data, error } = await supabase
            .from('teams')
            .select('*')
            .eq('company_id', req.companyId)
            .order('name');
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Criar Equipe com Limite de Plano
app.post('/api/admin/teams', requireAdmin, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome da equipe é obrigatório.' });

    try {
        // Obter plano da empresa
        const { data: company } = await supabase.from('companies').select('plan').eq('id', req.companyId).single();
        const plan = company?.plan || 'START';
        const limits = PLAN_LIMITS[plan] || PLAN_LIMITS['START'];

        if (limits.maxTeams === 0) {
            return res.status(400).json({ error: `Seu plano ${plan} não permite a criação de equipes. Faça upgrade para o plano TEAM ou superior.` });
        }

        // Contar equipes atuais
        const { count, error: countErr } = await supabase
            .from('teams')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', req.companyId);

        if (countErr) return res.status(500).json({ error: countErr.message });

        if (count >= limits.maxTeams) {
            return res.status(400).json({ error: `Limite máximo de equipes atingido para o plano ${plan} (${limits.maxTeams} equipes).` });
        }

        const { data, error } = await supabase
            .from('teams')
            .insert({ name: name.trim(), company_id: req.companyId })
            .select()
            .single();

        if (error) return res.status(409).json({ error: 'Equipe já existe ou erro: ' + error.message });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Deletar Equipe
app.delete('/api/admin/teams/:id', requireAdmin, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    try {
        const { error } = await supabase
            .from('teams')
            .delete()
            .eq('id', req.params.id)
            .eq('company_id', req.companyId);

        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obter Mensalidades da Empresa (Admin View)
app.get('/api/admin/installments', requireAdmin, async (req, res) => {
    if (!supabase) return res.json([]);
    try {
        const { data, error } = await supabase
            .from('installments')
            .select('*')
            .eq('company_id', req.companyId)
            .order('due_date', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Configurar Assinatura de Mensagem da Empresa
app.post('/api/admin/companies/signature', requireAdmin, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    const { signature_type } = req.body;
    if (!['none', 'name', 'name_team'].includes(signature_type)) {
        return res.status(400).json({ error: 'Tipo de assinatura inválido.' });
    }

    try {
        const { data, error } = await supabase
            .from('companies')
            .update({ signature_type })
            .eq('id', req.companyId)
            .select();

        if (error) return res.status(500).json({ error: error.message });
        if (!data || data.length === 0) return res.status(404).json({ error: 'Empresa não encontrada ou sem permissão para atualizar.' });
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Desconectar / Deslogar WhatsApp da Empresa
app.post('/api/admin/disconnect', requireAdmin, async (req, res) => {
    const clientState = companyClients.get(req.companyId);
    if (clientState) {
        try { await clientState.client.logout(); } catch (e) {}
        try { await clientState.client.destroy(); } catch (e) {}
        
        const sessionPath = path.join(__dirname, '.wwebjs_auth', `session-${req.companyId}`);
        try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        } catch (e) {}
        
        companyClients.delete(req.companyId);
    }
    io.to(req.companyId).emit('whatsapp_status', { ready: false });
    res.json({ success: true });
});


// ── API ROOT: Controle Global ─────────────────────────────────

app.post('/api/root/login', (req, res) => {
    const { key } = req.body;
    if (key === ROOT_KEY) {
        return res.json({ valid: true });
    }
    res.status(401).json({ valid: false, error: 'Chave de root incorreta.' });
});

// Listar Empresas
app.get('/api/root/companies', requireRoot, async (req, res) => {
    if (!supabase) return res.json([]);
    try {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .order('name');
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Criar Empresa com Admin Principal e Dia de Vencimento
app.post('/api/root/companies', requireRoot, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    const { name, slug, plan, phone_number, adminName, adminPassword, adminWhatsapp, due_date, due_day } = req.body;
    const finalDueDay = due_day ? parseInt(due_day) : (due_date ? new Date(due_date).getUTCDate() : 10);
    
    if (!name?.trim() || !slug?.trim() || !adminName?.trim() || !adminPassword?.trim() || !finalDueDay) {
        return res.status(400).json({ error: 'Nome, slug, plano, nome do administrador, senha e dia de vencimento são obrigatórios.' });
    }

    try {
        // 1. Cria a empresa
        const { data: company, error: cErr } = await supabase
            .from('companies')
            .insert({
                name: name.trim(),
                slug: slug.trim().toLowerCase(),
                plan: plan || 'START',
                phone_number: phone_number ? phone_number.trim() : null,
                due_day: finalDueDay,
                signature_type: 'none',
                active: true
            })
            .select()
            .single();

        if (cErr) return res.status(409).json({ error: 'Erro ao criar empresa (slug em uso?): ' + cErr.message });

        // 2. Cria o administrador principal da empresa
        const { error: uErr } = await supabase
            .from('zaptor_users')
            .insert({
                company_id: company.id,
                name: adminName.trim(),
                password: adminPassword.trim(),
                whatsapp_contact: adminWhatsapp ? adminWhatsapp.trim() : null,
                role: 'admin',
                active: true
            });

        if (uErr) {
            // Rollback manual deletando a empresa
            await supabase.from('companies').delete().eq('id', company.id);
            return res.status(500).json({ error: 'Erro ao criar administrador: ' + uErr.message });
        }

        // 3. Cria a primeira fatura/mensalidade como 'pendente'
        // Calcula a data específica do vencimento (no fuso UTC para evitar offsets locais)
        const now = new Date();
        let year = now.getUTCFullYear();
        let month = now.getUTCMonth(); // 0-11
        
        let calculatedDueDate = new Date(Date.UTC(year, month, finalDueDay));
        // Se a data já passou no mês corrente, move para o próximo mês
        if (calculatedDueDate <= now) {
            month += 1;
            calculatedDueDate = new Date(Date.UTC(year, month, finalDueDay));
        }
        
        const due_date_str = calculatedDueDate.toISOString().split('T')[0];

        await supabase
            .from('installments')
            .insert({
                company_id: company.id,
                due_date: due_date_str,
                amount: plan === 'START' ? 79.00 : plan === 'TEAM' ? 149.00 : plan === 'BUSINESS' ? 249.00 : 399.00,
                status: 'pendente'
            });

        res.json({ success: true, company });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Atualizar Empresa (Editar Plano, Ativa/Inativa, Telefone, etc)
app.patch('/api/root/companies/:id', requireRoot, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    const { active, plan, phone_number, name, due_date, due_day } = req.body;
    
    const updateData = {};
    if (active !== undefined) updateData.active = active;
    if (plan !== undefined) updateData.plan = plan;
    if (phone_number !== undefined) updateData.phone_number = phone_number;
    if (name !== undefined) updateData.name = name;
    
    if (due_day !== undefined) {
        updateData.due_day = parseInt(due_day);
    } else if (due_date !== undefined) {
        updateData.due_day = new Date(due_date).getUTCDate();
    }

    try {
        const { data, error } = await supabase
            .from('companies')
            .update(updateData)
            .eq('id', req.params.id)
            .select();

        if (error) return res.status(500).json({ error: error.message });
        if (!data || data.length === 0) return res.status(404).json({ error: 'Empresa não encontrada ou sem permissão para atualizar. Verifique se a SUPABASE_SERVICE_KEY está correta.' });
        
        // Se a empresa foi desativada, desconecta seu whatsapp
        if (active === false && companyClients.has(req.params.id)) {
            const clientState = companyClients.get(req.params.id);
            try {
                await clientState.client.destroy();
            } catch (e) {}
            companyClients.delete(req.params.id);
        }

        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Deletar Empresa
app.delete('/api/root/companies/:id', requireRoot, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    try {
        // Desconecta whatsapp se ativo
        if (companyClients.has(req.params.id)) {
            const clientState = companyClients.get(req.params.id);
            try {
                await clientState.client.destroy();
            } catch (e) {}
            companyClients.delete(req.params.id);
        }

        const { error } = await supabase
            .from('companies')
            .delete()
            .eq('id', req.params.id);

        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Gerenciar Mensalidades Globais (Root View)
app.get('/api/root/installments', requireRoot, async (req, res) => {
    if (!supabase) return res.json([]);
    try {
        const { data, error } = await supabase
            .from('installments')
            .select(`
                *,
                companies(name, plan)
            `)
            .order('due_date', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Criar Mensalidade
app.post('/api/root/installments', requireRoot, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    const { company_id, due_date, amount, status } = req.body;
    if (!company_id || !due_date || !amount) {
        return res.status(400).json({ error: 'Empresa, data de vencimento e valor são obrigatórios.' });
    }

    try {
        const { data, error } = await supabase
            .from('installments')
            .insert({
                company_id,
                due_date,
                amount,
                status: status || 'agendada'
            })
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Atualizar Status da Mensalidade
app.patch('/api/root/installments/:id', requireRoot, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    const { status, due_date, amount } = req.body;

    const updateData = {};
    if (status !== undefined) updateData.status = status;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (amount !== undefined) updateData.amount = amount;

    try {
        const { data, error } = await supabase
            .from('installments')
            .update(updateData)
            .eq('id', req.params.id)
            .select();

        if (error) return res.status(500).json({ error: error.message });
        if (!data || data.length === 0) return res.status(404).json({ error: 'Fatura não encontrada ou sem permissão para atualizar.' });
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Deletar Mensalidade
app.delete('/api/root/installments/:id', requireRoot, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    try {
        const { error } = await supabase
            .from('installments')
            .delete()
            .eq('id', req.params.id);

        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ── Socket.io: Eventos e Tempo Real ───────────────────────────
io.on('connection', (socket) => {
    console.log('[Socket] Novo cliente conectado:', socket.id);

    // Cliente socket registra na sala da empresa
    socket.on('join_company', async (data) => {
        const { companyId, loginName, role } = data;
        if (!companyId) return;

        socket.join(companyId);
        console.log(`[Socket] Usuário "${loginName}" (${role}) entrou na sala da empresa: ${companyId}`);

        // Inicializa ou recupera cliente da empresa
        if (supabase) {
            try {
                const { data: company } = await supabase.from('companies').select('*').eq('id', companyId).single();
                if (company && company.active) {
                    const clientState = await initCompanyClient(company, io);
                    socket.emit('whatsapp_status', {
                        ready: clientState.ready,
                        error: clientState.error
                    });
                    if (clientState.qr) {
                        socket.emit('whatsapp_qr', { qr: clientState.qr });
                    }
                } else {
                    socket.emit('whatsapp_status', { ready: false, error: 'Empresa desativada pelo sistema.' });
                }
            } catch (err) {
                console.error('[Socket Join Error]', err.message);
            }
        } else {
            // Mock local sem Supabase
            const mockCompany = { id: companyId, name: 'Empresa Dev', slug: 'dev' };
            const clientState = await initCompanyClient(mockCompany, io);
            socket.emit('whatsapp_status', { ready: clientState.ready, error: clientState.error });
            if (clientState.qr) socket.emit('whatsapp_qr', { qr: clientState.qr });
        }
    });

    // Envio de Mensagem via Socket
    socket.on('send_message', async (data) => {
        const { companyId, loginName, userId, chatId, text, fileData, isInternal, receiverName } = data;

        if (!companyId) return;

        const clientState = companyClients.get(companyId);
        if (!clientState || !clientState.ready) {
            socket.emit('message_error', { error: 'WhatsApp da empresa não está conectado.' });
            return;
        }

        const client = clientState.client;

        try {
            let msgTextToSend = '';

            // Se for Chat Interno da Equipe
            if (isInternal && receiverName) {
                // Envia para si mesmo
                const ownJid = client.info.wid._serialized;
                
                // Formato de interceptação interna
                const internalPayload = `*ZappTor Chat Interno*\n*De: ${loginName} | Para: ${receiverName}*\n${text?.trim() || ''}`;
                
                let msg;
                if (fileData) {
                    const base64Data = fileData.data.includes(',') ? fileData.data.split(',')[1] : fileData.data;
                    const media = new MessageMedia(fileData.mimetype, base64Data, fileData.name);
                    msg = await client.sendMessage(ownJid, media, { caption: internalPayload });
                } else {
                    msg = await client.sendMessage(ownJid, internalPayload);
                }

                console.log(`[Chat Interno] De ${loginName} para ${receiverName} enviado ao próprio número.`);
                return;
            }

            // Mensagem normal do WhatsApp com assinatura aplicada
            let signature = '';
            if (supabase) {
                const { data: company } = await supabase.from('companies').select('signature_type').eq('id', companyId).single();
                const signatureType = company?.signature_type || 'none';

                if (signatureType === 'name') {
                    signature = `*${loginName}*\n`;
                } else if (signatureType === 'name_team') {
                    // Busca a equipe do usuário
                    const { data: user } = await supabase
                        .from('zaptor_users')
                        .select('teams(name)')
                        .eq('id', userId)
                        .single();
                    
                    const teamName = user?.teams?.name || 'Geral';
                    signature = `*${loginName}*\n_${teamName}_:\n`;
                }
            } else {
                // Mock
                signature = `*${loginName}*:\n`;
            }

            // Une assinatura ao texto da mensagem
            const formattedText = text?.trim() 
                ? `${signature}${text.trim()}`
                : `${signature}(Enviou um anexo)`;

            let msg;
            if (fileData) {
                const base64Data = fileData.data.includes(',') ? fileData.data.split(',')[1] : fileData.data;
                const media = new MessageMedia(fileData.mimetype, base64Data, fileData.name);
                msg = await client.sendMessage(chatId, media, { caption: formattedText });
            } else {
                msg = await client.sendMessage(chatId, formattedText);
            }

            console.log(`[Msg] Enviada para ${chatId} por ${loginName} na empresa: ${companyId}`);

            // Persiste no Supabase se configurado
            if (supabase && msg) {
                try {
                    await supabase.from('messages').upsert({
                        id: msg.id._serialized,
                        company_id: companyId,
                        chat_id: msg.id.remote || msg.to,
                        from_number: msg.from,
                        to_number: msg.to,
                        body: msg.body,
                        timestamp: msg.timestamp,
                        from_me: true,
                        has_media: msg.hasMedia,
                        type: msg.type,
                        sender_name: loginName,
                    }, { onConflict: 'id', ignoreDuplicates: true });
                } catch (e) {}
            }
        } catch (error) {
            console.error('[Socket Send Msg] Erro:', error.message);
            socket.emit('message_error', { error: 'Falha ao enviar mensagem pelo WhatsApp.' });
        }
    });

    socket.on('disconnect', () => {
        console.log('[Socket] Cliente desconectado:', socket.id);
    });
});

// Inicialização do Servidor
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 ZappTor Backend v2.0.1 rodando na porta ${PORT}`);
    console.log(`   Status:  http://localhost:${PORT}/api/status`);
    console.log(`   Chave Root: "${ROOT_KEY}"\n`);
});
