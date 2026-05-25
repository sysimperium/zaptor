// ============================================================
// ZapTor 2.0 - Backend (Node.js + whatsapp-web.js)
// Deploy: Railway | Frontend: Vercel | DB: Supabase
// ============================================================

const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

// ── Configuração ─────────────────────────────────────────────
const PORT = 3001;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123'; // Troque em produção!
const COMPANY_SLUG = process.env.COMPANY_SLUG || 'minha-empresa';
const ROOT_KEY = process.env.ROOT_KEY || 'root123'; // Chave para acesso global

// ── Supabase ──────────────────────────────────────────────────
let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    console.log('[Supabase] Conectado.');
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
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ── WhatsApp Client ───────────────────────────────────────────
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018.665-alpha.html',
    },
    puppeteer: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        handleSIGTERM: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process',
            '--no-zygote',
        ],
        timeout: 60000,
    },
});

// ── Estado Global ─────────────────────────────────────────────
let isReady = false;
let currentQRDataUrl = null;

// ── Eventos do WhatsApp ───────────────────────────────────────
client.on('qr', async (qr) => {
    console.log('[WhatsApp] QR Code gerado. Escaneie no celular.');
    try {
        currentQRDataUrl = await qrcode.toDataURL(qr, { errorCorrectionLevel: 'M', scale: 6 });
        io.emit('whatsapp_qr', { qr: currentQRDataUrl });
    } catch (err) {
        console.error('[QR] Erro ao gerar QR:', err.message);
    }
});

client.on('loading_screen', (percent, message) => {
    console.log(`[WhatsApp] Carregando: ${percent}% - ${message}`);
    io.emit('whatsapp_loading', { percent, message });
});

client.on('authenticated', () => {
    console.log('[WhatsApp] Autenticado com sucesso!');
    currentQRDataUrl = null;
    io.emit('whatsapp_authenticated');
});

client.on('ready', () => {
    console.log('[WhatsApp] Pronto e conectado!');
    isReady = true;
    currentQRDataUrl = null;
    io.emit('whatsapp_status', { ready: true });
});

client.on('auth_failure', (msg) => {
    console.error('[WhatsApp] Falha de autenticação:', msg);
    isReady = false;
    io.emit('whatsapp_status', { ready: false, error: 'auth_failure' });
});

client.on('disconnected', (reason) => {
    console.log('[WhatsApp] Desconectado:', reason);
    isReady = false;
    io.emit('whatsapp_status', { ready: false, reason });
});

// Captura e broadcast de todas as mensagens (enviadas e recebidas)
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

    io.emit('whatsapp_message', msgData);

    // Persiste no Supabase se configurado
    if (supabase) {
        try {
            // Busca o ID da empresa
            const { data: company } = await supabase
                .from('companies')
                .select('id')
                .eq('slug', COMPANY_SLUG)
                .single();

            await supabase.from('messages').upsert({
                id: msgData.id,
                company_id: company?.id || null,
                chat_id: msgData.chatId,
                from_number: msgData.from,
                to_number: msgData.to,
                body: msgData.body,
                timestamp: msgData.timestamp,
                from_me: msgData.fromMe,
                has_media: msgData.hasMedia,
                type: msgData.type,
            }, { onConflict: 'id', ignoreDuplicates: true });
        } catch (err) {
            // Silencioso - não quebra o fluxo por erro de persistência
        }
    }
});

// ── Middleware de Admin ───────────────────────────────────────
const requireAdmin = (req, res, next) => {
    const key = req.headers['x-admin-key'];
    if (key !== ADMIN_KEY) {
        return res.status(401).json({ error: 'Chave de administrador inválida.' });
    }
    next();
};

// ── Middleware de Root ───────────────────────────────────────
const requireRoot = (req, res, next) => {
    const key = req.headers['x-root-key'];
    if (key !== ROOT_KEY) {
        return res.status(401).json({ error: 'Chave de root inválida.' });
    }
    next();
};

// ── API: Status e QR ─────────────────────────────────────────
app.get('/api/status', (req, res) => {
    res.json({
        ready: isReady,
        hasQR: !!currentQRDataUrl,
        version: '2.0.0',
    });
});

app.get('/api/qr', (req, res) => {
    if (isReady) return res.json({ ready: true });
    if (currentQRDataUrl) return res.json({ qr: currentQRDataUrl });
    res.json({ waiting: true, message: 'Aguardando QR Code ser gerado...' });
});

// ── API: Autenticação de Usuários ─────────────────────────────
app.post('/api/auth/login', async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ valid: false, error: 'Nome é obrigatório.' });
    }

    // Se Supabase não configurado, aceita qualquer nome (modo dev)
    if (!supabase) {
        console.warn('[Auth] Supabase não configurado - aceitando qualquer nome (modo dev).');
        return res.json({ valid: true, user: { name: name.trim(), role: 'user' } });
    }

    try {
        const { data: company } = await supabase
            .from('companies')
            .select('id')
            .eq('slug', COMPANY_SLUG)
            .eq('active', true)
            .single();

        if (!company) {
            return res.json({ valid: false, error: 'Empresa não encontrada.' });
        }

        const { data: user, error } = await supabase
            .from('zaptor_users')
            .select('id, name, role')
            .eq('company_id', company.id)
            .ilike('name', name.trim())
            .eq('active', true)
            .single();

        if (error || !user) {
            return res.json({ valid: false, error: 'Nome não cadastrado. Fale com o administrador.' });
        }

        res.json({ valid: true, user });
    } catch (err) {
        console.error('[Auth] Erro:', err.message);
        res.status(500).json({ valid: false, error: 'Erro interno.' });
    }
});

// ── API: Conversas ────────────────────────────────────────────
app.get('/api/chats', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'WhatsApp não está pronto ainda.' });
    try {
        const chats = await client.getChats();
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

// ── API: Mensagens de uma conversa ────────────────────────────
app.get('/api/chats/:chatId/messages', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'WhatsApp não está pronto ainda.' });
    try {
        const chat = await client.getChatById(req.params.chatId);
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

// ── API: Marcar como lida/não lida ───────────────────────────
app.post('/api/chats/:chatId/read', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'WhatsApp não está pronto.' });
    try {
        const chat = await client.getChatById(req.params.chatId);
        await chat.sendSeen();
        io.emit('chat_read', { chatId: req.params.chatId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

app.post('/api/chats/:chatId/unread', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'WhatsApp não está pronto.' });
    try {
        const chat = await client.getChatById(req.params.chatId);
        await chat.markUnread();
        io.emit('chat_unread', { chatId: req.params.chatId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// ── API: Foto de Perfil ───────────────────────────────────────
app.get('/api/contacts/:contactId/profile-pic', async (req, res) => {
    if (!isReady) return res.json({ profilePicUrl: null });
    try {
        let profilePicUrl = null;
        try {
            profilePicUrl = await client.pupPage.evaluate(async (cId) => {
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
            try { profilePicUrl = await client.getProfilePicUrl(req.params.contactId); } catch (e) {}
        }
        res.json({ profilePicUrl });
    } catch (err) {
        res.json({ profilePicUrl: null });
    }
});

// ── API: Mídia de Mensagens ───────────────────────────────────
app.get('/api/messages/:msgId/media', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'WhatsApp não está pronto.' });
    try {
        const msg = await client.getMessageById(req.params.msgId);
        if (!msg?.hasMedia) return res.status(404).json({ error: 'Sem mídia.' });
        const media = await msg.downloadMedia();
        res.json(media);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// ── API ADMIN: Gerenciar Usuários ─────────────────────────────
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    if (!supabase) return res.json([]);
    const { data: company } = await supabase.from('companies').select('id').eq('slug', COMPANY_SLUG).single();
    if (!company) {
        return res.status(404).json({ error: 'Empresa não encontrada no banco. Verifique o COMPANY_SLUG.' });
    }
    const { data, error } = await supabase
        .from('zaptor_users')
        .select('id, name, role, active, created_at')
        .eq('company_id', company.id)
        .order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório.' });

    const { data: company } = await supabase.from('companies').select('id').eq('slug', COMPANY_SLUG).single();
    if (!company) {
        return res.status(404).json({ error: 'Empresa não encontrada no banco. Verifique o COMPANY_SLUG.' });
    }
    const { data, error } = await supabase
        .from('zaptor_users')
        .insert({ name: name.trim(), company_id: company.id, role: 'user', active: true })
        .select()
        .single();
    if (error) return res.status(409).json({ error: 'Usuário já existe ou erro: ' + error.message });
    res.json(data);
});

app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    const { active } = req.body;
    const { data, error } = await supabase
        .from('zaptor_users')
        .update({ active })
        .eq('id', req.params.id)
        .select()
        .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    const { error } = await supabase.from('zaptor_users').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// ── API ROOT: Gerenciar Empresas e Admins Globais ──────────────
app.post('/api/root/login', (req, res) => {
    const { key } = req.body;
    if (key === ROOT_KEY) {
        return res.json({ valid: true });
    }
    res.status(401).json({ valid: false, error: 'Chave de root incorreta.' });
});

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

app.post('/api/root/companies', requireRoot, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    const { name, slug, adminName } = req.body;
    if (!name?.trim() || !slug?.trim() || !adminName?.trim()) {
        return res.status(400).json({ error: 'Nome, slug e nome do administrador são obrigatórios.' });
    }

    try {
        // 1. Cria a empresa
        const { data: company, error: cErr } = await supabase
            .from('companies')
            .insert({ name: name.trim(), slug: slug.trim().toLowerCase(), active: true })
            .select()
            .single();
        if (cErr) return res.status(409).json({ error: 'Erro ao criar empresa (slug em uso?): ' + cErr.message });

        // 2. Cria o usuário admin para esta empresa
        const { error: uErr } = await supabase
            .from('zaptor_users')
            .insert({ company_id: company.id, name: adminName.trim(), role: 'admin', active: true });

        if (uErr) {
            // Rollback manual deletando a empresa
            await supabase.from('companies').delete().eq('id', company.id);
            return res.status(500).json({ error: 'Erro ao criar administrador: ' + uErr.message });
        }

        res.json({ success: true, company });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/root/companies/:id', requireRoot, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    const { active } = req.body;
    try {
        const { data, error } = await supabase
            .from('companies')
            .update({ active })
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/root/companies/:id', requireRoot, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });
    try {
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

// ── Socket.io: Envio de Mensagens em Tempo Real ───────────────
io.on('connection', (socket) => {
    console.log('[Socket] Novo cliente conectado:', socket.id);

    // Envia estado atual ao conectar
    socket.emit('whatsapp_status', { ready: isReady });
    if (currentQRDataUrl) socket.emit('whatsapp_qr', { qr: currentQRDataUrl });

    // Envio de mensagem
    socket.on('send_message', async (data) => {
        if (!isReady) {
            socket.emit('message_error', { error: 'WhatsApp não está pronto.' });
            return;
        }

        const { loginName, chatId, text, fileData } = data;
        const formattedText = text?.trim()
            ? `*${loginName}:* ${text.trim()}`
            : `*${loginName}* (Enviou um anexo)`;

        try {
            let msg;
            if (fileData) {
                const base64Data = fileData.data.includes(',')
                    ? fileData.data.split(',')[1]
                    : fileData.data;
                const media = new MessageMedia(fileData.mimetype, base64Data, fileData.name);
                msg = await client.sendMessage(chatId, media, { caption: formattedText });
            } else {
                msg = await client.sendMessage(chatId, formattedText);
            }

            console.log(`[Msg] Enviada para ${chatId} por ${loginName}`);

            // Salva no Supabase
            if (supabase && msg) {
                try {
                    const { data: company } = await supabase
                        .from('companies').select('id').eq('slug', COMPANY_SLUG).single();
                    await supabase.from('messages').upsert({
                        id: msg.id._serialized,
                        company_id: company?.id || null,
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
            console.error('[Socket] Erro ao enviar mensagem:', error.message);
            socket.emit('message_error', { error: 'Falha ao enviar mensagem.' });
        }
    });

    socket.on('disconnect', () => {
        console.log('[Socket] Cliente desconectado:', socket.id);
    });
});

// ── Inicializa WhatsApp e Servidor ────────────────────────────
client.initialize().catch(err => {
    console.error('[WhatsApp] Erro ao inicializar:', err.message);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 ZapTor Backend v2.0 rodando na porta ${PORT}`);
    console.log(`   Status:  http://localhost:${PORT}/api/status`);
    console.log(`   Admin:   Chave configurada = "${ADMIN_KEY}"\n`);
});
