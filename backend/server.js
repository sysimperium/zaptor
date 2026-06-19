require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MessageMedia } = require('whatsapp-web.js');

const { initDatabase, dbRun, dbAll, dbGet } = require('./database');
const {
    initWhatsApp,
    createWhatsAppClient,
    destroyWhatsAppClient,
    getClient,
    getClientState,
    getChatsCached,
    updateChatCacheOnMessage,
    updateChatCacheReadStatus
} = require('./whatsapp');

const stringifyId = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') return val._serialized || val.user || JSON.stringify(val);
    return String(val);
};

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins for the intranet
        methods: ['GET', 'POST']
    }
});

const JWT_SECRET = process.env.JWT_SECRET || 'zapptor_secret_key_12345';

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: 'Token inválido ou expirado' });
        req.user = decoded;
        next();
    });
};

// Middleware to restrict access by role
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Acesso negado: permissão insuficiente' });
        }
        next();
    };
};

// Middleware to check company status and expiration
const checkTenantStatus = async (req, res, next) => {
    if (req.user.role === 'root') return next();

    try {
        const tenant = await dbGet("SELECT status, expires_at FROM tenants WHERE id = ?", [req.user.tenantId]);
        if (!tenant) {
            return res.status(404).json({ error: 'Empresa não encontrada' });
        }
        if (tenant.status !== 'active') {
            return res.status(403).json({ error: 'Empresa suspensa' });
        }

        const currentDate = new Date().toISOString();
        if (tenant.expires_at < currentDate) {
            // Expired! Stop the client session
            await destroyWhatsAppClient(req.user.tenantId);
            return res.status(403).json({ error: 'Assinatura vencida/expirada' });
        }
        next();
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
};

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    try {
        const user = await dbGet("SELECT u.*, t.name as tenant_name FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id WHERE u.username = ?", [username]);
        if (!user) {
            return res.status(401).json({ error: 'Usuário ou senha incorretos' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Usuário ou senha incorretos' });
        }

        // Check tenant status if not root
        if (user.role !== 'root') {
            const tenant = await dbGet("SELECT status, expires_at FROM tenants WHERE id = ?", [user.tenant_id]);
            if (!tenant) {
                return res.status(404).json({ error: 'Empresa vinculada não encontrada' });
            }
            if (tenant.status !== 'active') {
                return res.status(403).json({ error: 'Esta empresa está suspensa' });
            }

            const currentDate = new Date().toISOString();
            if (tenant.expires_at < currentDate) {
                return res.status(403).json({ error: 'A mensalidade desta empresa está vencida. Entre em contato com o suporte.' });
            }
        }

        const token = jwt.sign(
            {
                userId: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                tenantId: user.tenant_id,
                tenantName: user.tenant_name
            },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                tenantId: user.tenant_id,
                tenantName: user.tenant_name
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Get current session data
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    res.json({ user: req.user });
});

// ==========================================
// ROOT USER PANEL ENDPOINTS
// ==========================================

// Get all tenants (companies)
app.get('/api/root/tenants', authenticateToken, requireRole(['root']), async (req, res) => {
    try {
        const tenants = await dbAll("SELECT * FROM tenants ORDER BY id DESC");
        res.json(tenants);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Create a new tenant (company)
app.post('/api/root/tenants', authenticateToken, requireRole(['root']), async (req, res) => {
    const { name, expires_at, plan } = req.body;
    if (!name || !expires_at) {
        return res.status(400).json({ error: 'Nome da empresa e expiração são obrigatórios' });
    }

    try {
        const result = await dbRun(
            "INSERT INTO tenants (name, expires_at, plan) VALUES (?, ?, ?)",
            [name, expires_at, plan || 'free']
        );
        res.json({ id: result.lastID, name, expires_at, plan: plan || 'free', status: 'active' });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Update a tenant (company) status / expiration / name
app.put('/api/root/tenants/:id', authenticateToken, requireRole(['root']), async (req, res) => {
    const { name, status, expires_at, plan } = req.body;
    const tenantId = req.params.id;

    try {
        const currentTenant = await dbGet("SELECT * FROM tenants WHERE id = ?", [tenantId]);
        if (!currentTenant) return res.status(404).json({ error: 'Empresa não encontrada' });

        const newName = name !== undefined ? name : currentTenant.name;
        const newStatus = status !== undefined ? status : currentTenant.status;
        const newExpiresAt = expires_at !== undefined ? expires_at : currentTenant.expires_at;
        const newPlan = plan !== undefined ? plan : currentTenant.plan;

        await dbRun(
            "UPDATE tenants SET name = ?, status = ?, expires_at = ?, plan = ? WHERE id = ?",
            [newName, newStatus, newExpiresAt, newPlan, tenantId]
        );

        // Terminate WhatsApp connection if suspended/expired
        const currentDate = new Date().toISOString();
        if (newStatus !== 'active' || newExpiresAt < currentDate) {
            await destroyWhatsAppClient(Number(tenantId));
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Delete a tenant
app.delete('/api/root/tenants/:id', authenticateToken, requireRole(['root']), async (req, res) => {
    const tenantId = req.params.id;
    try {
        // Check if there are users linked to this tenant
        const userCount = await dbGet("SELECT COUNT(*) as count FROM users WHERE tenant_id = ?", [tenantId]);
        if (userCount.count > 0) {
            return res.status(400).json({ error: 'Não é possível excluir uma empresa que possui usuários vinculados. Remova os usuários primeiro.' });
        }

        await destroyWhatsAppClient(Number(tenantId));
        await dbRun("DELETE FROM tenants WHERE id = ?", [tenantId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Update a system user (root only)
app.put('/api/root/users/:id', authenticateToken, requireRole(['root']), async (req, res) => {
    const { name, username, password, role, tenantId } = req.body;
    const userId = req.params.id;

    try {
        const currentUser = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
        if (!currentUser) return res.status(404).json({ error: 'Usuário não encontrado' });
        if (currentUser.role === 'root' && req.user.userId !== currentUser.id) {
            return res.status(403).json({ error: 'Não é permitido editar outros usuários root' });
        }

        let sql = "UPDATE users SET name = ?, username = ?, role = ?, tenant_id = ?";
        let params = [
            name || currentUser.name,
            username || currentUser.username,
            role || currentUser.role,
            tenantId !== undefined ? tenantId : currentUser.tenant_id
        ];

        if (password) {
            const hash = await bcrypt.hash(password, 10);
            sql += ", password_hash = ?";
            params.push(hash);
        }

        sql += " WHERE id = ?";
        params.push(userId);

        await dbRun(sql, params);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Delete a system user (root only)
app.delete('/api/root/users/:id', authenticateToken, requireRole(['root']), async (req, res) => {
    const userId = req.params.id;
    try {
        const userToDelete = await dbGet("SELECT role FROM users WHERE id = ?", [userId]);
        if (!userToDelete) return res.status(404).json({ error: 'Usuário não encontrado' });
        if (userToDelete.role === 'root') return res.status(403).json({ error: 'Não é permitido excluir usuários root' });

        await dbRun("DELETE FROM users WHERE id = ?", [userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Create admin user for a tenant
app.post('/api/root/users', authenticateToken, requireRole(['root']), async (req, res) => {
    const { name, username, password, role, tenantId } = req.body;
    if (!name || !username || !password || !role || !tenantId) {
        return res.status(400).json({ error: 'Campos obrigatórios incompletos' });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await dbRun(
            "INSERT INTO users (name, username, password_hash, role, tenant_id) VALUES (?, ?, ?, ?, ?)",
            [name, username, hash, role, tenantId]
        );
        res.json({ id: result.lastID, name, username, role, tenantId });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Usuário já cadastrado' });
        }
        res.status(500).json({ error: err.toString() });
    }
});

// List all users in system
app.get('/api/root/users', authenticateToken, requireRole(['root']), async (req, res) => {
    try {
        const users = await dbAll(
            "SELECT u.id, u.name, u.username, u.role, u.tenant_id, t.name as tenant_name FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id"
        );
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// ==========================================
// PAYMENT ENDPOINTS (ROOT ONLY)
// ==========================================

// Get all payments for a tenant
app.get('/api/root/tenants/:id/payments', authenticateToken, requireRole(['root']), async (req, res) => {
    try {
        const payments = await dbAll(
            "SELECT * FROM payments WHERE tenant_id = ? ORDER BY due_date ASC",
            [req.params.id]
        );
        res.json(payments);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Create a new payment record
app.post('/api/root/tenants/:id/payments', authenticateToken, requireRole(['root']), async (req, res) => {
    const { amount, due_date } = req.body;
    if (!amount || !due_date) {
        return res.status(400).json({ error: 'Valor e data de vencimento são obrigatórios' });
    }

    try {
        await dbRun(
            "INSERT INTO payments (tenant_id, amount, due_date, status) VALUES (?, ?, ?, 'pending')",
            [req.params.id, amount, due_date]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Mark a payment as PAID and extend tenant expiration
app.post('/api/root/payments/:id/pay', authenticateToken, requireRole(['root']), async (req, res) => {
    try {
        const payment = await dbGet("SELECT * FROM payments WHERE id = ?", [req.params.id]);
        if (!payment) return res.status(404).json({ error: 'Mensalidade não encontrada' });
        if (payment.status === 'paid') return res.status(400).json({ error: 'Esta mensalidade já está paga' });

        const tenant = await dbGet("SELECT expires_at, plan FROM tenants WHERE id = ?", [payment.tenant_id]);
        if (!tenant) return res.status(404).json({ error: 'Empresa não encontrada' });

        const paidAt = new Date().toISOString();
        
        // Calculate new expiration based on the plan duration:
        // free = 60 days, mensal = 30 days, trimestral = 90 days, semestral = 180 days, 9meses = 270 days, anual = 365 days
        const plan = tenant.plan || 'free';
        let daysToAdd = 30;
        if (plan === 'free') daysToAdd = 60;
        else if (plan === 'mensal') daysToAdd = 30;
        else if (plan === 'trimestral') daysToAdd = 90;
        else if (plan === 'semestral') daysToAdd = 180;
        else if (plan === '9meses') daysToAdd = 270;
        else if (plan === 'anual') daysToAdd = 365;

        let currentExp = new Date(tenant.expires_at);
        let now = new Date();
        let baseDate = currentExp > now ? currentExp : now;
        
        const newExp = new Date(baseDate);
        newExp.setDate(newExp.getDate() + daysToAdd);
        const newExpStr = newExp.toISOString();

        // Update payment status
        await dbRun("UPDATE payments SET status = 'paid', paid_at = ? WHERE id = ?", [paidAt, req.params.id]);
        
        // Update tenant expiration and status
        await dbRun("UPDATE tenants SET expires_at = ?, status = 'active' WHERE id = ?", [newExpStr, payment.tenant_id]);

        res.json({ success: true, new_expires_at: newExpStr });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Delete a payment
app.delete('/api/root/payments/:id', authenticateToken, requireRole(['root']), async (req, res) => {
    try {
        await dbRun("DELETE FROM payments WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// ==========================================
// SYSTEM SETTINGS ENDPOINTS
// ==========================================

// Get a system setting
app.get('/api/settings/:key', authenticateToken, async (req, res) => {
    try {
        const row = await dbGet("SELECT value FROM settings WHERE key = ?", [req.params.key]);
        res.json({ key: req.params.key, value: row ? row.value : '' });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Update a system setting (root only)
app.put('/api/settings/:key', authenticateToken, requireRole(['root']), async (req, res) => {
    const { value } = req.body;
    try {
        await dbRun(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [req.params.key, value || '']
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// ==========================================
// TENANT ADMIN PANEL ENDPOINTS
// ==========================================

// Get current tenant info (for tenant admin)
app.get('/api/admin/tenant', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const tenant = await dbGet("SELECT name, status, expires_at, plan FROM tenants WHERE id = ?", [req.user.tenantId]);
        if (!tenant) return res.status(404).json({ error: 'Empresa não encontrada' });
        res.json(tenant);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Get payments for the current tenant (for tenant admin)
app.get('/api/admin/payments', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const payments = await dbAll(
            "SELECT * FROM payments WHERE tenant_id = ? ORDER BY due_date ASC",
            [req.user.tenantId]
        );
        res.json(payments);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Get tenant operators
app.get('/api/admin/operators', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const operators = await dbAll(
            "SELECT id, name, username, role, created_at FROM users WHERE tenant_id = ? AND role = 'operator' ORDER BY id DESC",
            [req.user.tenantId]
        );
        res.json(operators);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Create tenant operator
app.post('/api/admin/operators', authenticateToken, requireRole(['admin']), async (req, res) => {
    const { name, username, password } = req.body;
    if (!name || !username || !password) {
        return res.status(400).json({ error: 'Campos incompletos' });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await dbRun(
            "INSERT INTO users (name, username, password_hash, role, tenant_id) VALUES (?, ?, ?, ?, ?)",
            [name, username, hash, 'operator', req.user.tenantId]
        );
        res.json({ id: result.lastID, name, username, role: 'operator', tenantId: req.user.tenantId });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Este nome de usuário já está em uso' });
        }
        res.status(500).json({ error: err.toString() });
    }
});

// Delete operator
app.delete('/api/admin/operators/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
    const operatorId = req.params.id;
    try {
        const user = await dbGet("SELECT tenant_id FROM users WHERE id = ? AND role = 'operator'", [operatorId]);
        if (!user || user.tenant_id !== req.user.tenantId) {
            return res.status(403).json({ error: 'Não autorizado ou operador não encontrado' });
        }
        await dbRun("DELETE FROM users WHERE id = ?", [operatorId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// WhatsApp client lifecycle control (for tenant admin to trigger connect)
app.post('/api/admin/whatsapp/connect', authenticateToken, requireRole(['admin']), checkTenantStatus, async (req, res) => {
    try {
        createWhatsAppClient(req.user.tenantId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

app.post('/api/admin/whatsapp/disconnect', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        await destroyWhatsAppClient(req.user.tenantId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// ==========================================
// AUTO-RESPONSE ENDPOINTS (ADMIN)
// ==========================================

const DEFAULT_FIRST_OF_DAY_MSG = `*Mensagem automática*\nOlá, bem vindo ao suporte DS5! Pra iniciarmos teu atendimento, nos informa por gentileza:\n*Teu nome*:\n*CNPJ da empresa*:`;

// Get all auto-response settings for this tenant
app.get('/api/admin/auto-responses', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const rows = await dbAll(
            "SELECT type, enabled, message FROM auto_responses WHERE tenant_id = ?",
            [req.user.tenantId]
        );
        // If not configured yet, return defaults
        const firstOfDay = rows.find(r => r.type === 'first_of_day') || {
            type: 'first_of_day',
            enabled: 0,
            message: DEFAULT_FIRST_OF_DAY_MSG
        };
        res.json({ first_of_day: firstOfDay });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Save auto-response setting
app.put('/api/admin/auto-responses/:type', authenticateToken, requireRole(['admin']), async (req, res) => {
    const { enabled, message } = req.body;
    const type = req.params.type;
    if (!['first_of_day'].includes(type)) {
        return res.status(400).json({ error: 'Tipo inválido' });
    }
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Mensagem não pode ser vazia' });
    }
    try {
        await dbRun(
            `INSERT INTO auto_responses (tenant_id, type, enabled, message)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(tenant_id, type) DO UPDATE SET enabled = excluded.enabled, message = excluded.message`,
            [req.user.tenantId, type, enabled ? 1 : 0, message.trim()]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// ==========================================
// WHATSAPP OPERATOR ENDPOINTS
// ==========================================

// Get chats
app.get('/api/chats', authenticateToken, checkTenantStatus, async (req, res) => {
    const tenantId = req.user.tenantId;
    console.log(`[API] Fetching chats for Tenant ${tenantId}...`);
    if (!tenantId) return res.status(400).json({ error: 'Operação inválida' });

    const client = getClient(tenantId);
    const state = getClientState(tenantId);
    if (!client || !state.ready) {
        console.log(`[API] Client not ready for Tenant ${tenantId}. ready=${state.ready}`);
        return res.status(503).json({ error: 'WhatsApp não está conectado para esta empresa' });
    }

    try {
        console.log(`[API] Calling getChatsCached() for Tenant ${tenantId}...`);
        const chats = await getChatsCached(tenantId);
        console.log(`[API] Successfully fetched ${chats ? chats.length : 0} chats for Tenant ${tenantId}`);
        const simplifiedChats = Object.values(chats).map(chat => ({
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            pinned: chat.pinned || false,
            unreadCount: chat.unreadCount,
            timestamp: chat.timestamp
        }));
        
        // Sort: pinned chats first, then sort by timestamp descending
        simplifiedChats.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return (b.timestamp || 0) - (a.timestamp || 0);
        });

        res.json(simplifiedChats);
    } catch (err) {
        console.error(`[API] Error fetching chats for Tenant ${tenantId}:`, err);
        res.status(500).json({ error: err.toString() });
    }
});

// Get messages for a specific chat
app.get('/api/chats/:chatId/messages', authenticateToken, checkTenantStatus, async (req, res) => {
    const tenantId = req.user.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Operação inválida' });

    const client = getClient(tenantId);
    const state = getClientState(tenantId);
    if (!client || !state.ready) {
        return res.status(503).json({ error: 'WhatsApp não conectado' });
    }

    try {
        let messages = [];
        try {
            const chat = await client.getChatById(req.params.chatId);
            messages = await chat.fetchMessages({ limit: 50 });
        } catch (fetchErr) {
            console.warn(`[API] fetchMessages failed for chat ${req.params.chatId}, returning empty list:`, fetchErr.message);
        }
        res.json(messages.map(msg => {
            let quotedMsg = null;
            if (msg.hasQuotedMsg && msg._data && msg._data.quotedMsg) {
                quotedMsg = {
                    body: msg._data.quotedMsg.body,
                    type: msg._data.quotedMsg.type,
                    participant: stringifyId(msg._data.quotedMsg.participant || msg._data.quotedMsg.from)
                };
            }
            return {
                id: msg.id._serialized,
                chatId: stringifyId(msg.id.remote || (msg.fromMe ? msg.to : msg.from)),
                from: stringifyId(msg.from),
                to: stringifyId(msg.to),
                body: msg.body,
                timestamp: msg.timestamp,
                fromMe: msg.fromMe,
                hasMedia: msg.hasMedia,
                type: msg.type,
                ack: msg.ack,
                quotedMsg: quotedMsg
            };
        }));
    } catch (err) {
        console.error(`[API] Error processing messages for chat ${req.params.chatId}:`, err);
        res.status(500).json({ error: err.toString() });
    }
});

// Get profile picture
app.get('/api/contacts/:contactId/profile-pic', authenticateToken, checkTenantStatus, async (req, res) => {
    const tenantId = req.user.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Operação inválida' });

    const client = getClient(tenantId);
    const state = getClientState(tenantId);
    if (!client || !state.ready) {
        return res.status(503).json({ error: 'WhatsApp não conectado' });
    }

    try {
        let profilePicUrl = null;
        try {
            profilePicUrl = await client.pupPage.evaluate(async (cId) => {
                try {
                    const thumb = window.Store.ProfilePicThumb?.get(cId);
                    if (thumb && thumb.eurl) return thumb.eurl;

                    const wid = window.Store.WidFactory.createWid(cId);
                    const pic = await window.Store.ProfilePic.profilePicFind(wid);
                    return pic ? pic.eurl : null;
                } catch (e) {
                    return null;
                }
            }, req.params.contactId);
        } catch (evalErr) {
            console.error('Eval error for profile pic:', evalErr.message);
        }

        if (!profilePicUrl) {
            try {
                profilePicUrl = await client.getProfilePicUrl(req.params.contactId);
            } catch (fallbackErr) {
                // silent
            }
        }
        res.json({ profilePicUrl });
    } catch (err) {
        res.status(500).json({ profilePicUrl: null });
    }
});

// Get message media
app.get('/api/messages/:msgId/media', authenticateToken, checkTenantStatus, async (req, res) => {
    const tenantId = req.user.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Operação inválida' });

    const client = getClient(tenantId);
    const state = getClientState(tenantId);
    if (!client || !state.ready) {
        return res.status(503).json({ error: 'WhatsApp não conectado' });
    }

    try {
        const msg = await client.getMessageById(req.params.msgId);
        if (!msg || !msg.hasMedia) return res.status(404).json({ error: 'No media found' });
        const media = await msg.downloadMedia();
        res.json(media);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Mark chat as unread
app.post('/api/chats/:chatId/unread', authenticateToken, checkTenantStatus, async (req, res) => {
    const tenantId = req.user.tenantId;
    const client = getClient(tenantId);
    if (!client) return res.status(503).json({ error: 'WhatsApp não conectado' });
    try {
        const chat = await client.getChatById(req.params.chatId);
        await chat.markUnread();
        updateChatCacheReadStatus(tenantId, req.params.chatId, false);
        io.to(`tenant_${tenantId}`).emit('chat_unread', { chatId: req.params.chatId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Mark chat as read
app.post('/api/chats/:chatId/read', authenticateToken, checkTenantStatus, async (req, res) => {
    const tenantId = req.user.tenantId;
    const client = getClient(tenantId);
    if (!client) return res.status(503).json({ error: 'WhatsApp não conectado' });
    try {
        const chat = await client.getChatById(req.params.chatId);
        await chat.sendSeen();
        updateChatCacheReadStatus(tenantId, req.params.chatId, true);
        io.to(`tenant_${tenantId}`).emit('chat_read', { chatId: req.params.chatId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// ==========================================
// SOCKET.IO REAL-TIME COMMUNICATION
// ==========================================

io.on('connection', (socket) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
        console.log('Socket connection rejected: No token provided');
        socket.disconnect(true);
        return;
    }

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) {
            console.log('Socket connection rejected: Invalid token');
            socket.disconnect(true);
            return;
        }

        const { tenantId, name, role } = decoded;

        if (!tenantId && role !== 'root') {
            console.log('Socket connection rejected: Non-root user has no tenant ID');
            socket.disconnect(true);
            return;
        }

        const roomName = role === 'root' ? 'root_admin' : `tenant_${tenantId}`;
        socket.join(roomName);
        console.log(`Socket ${socket.id} connected for user ${name} (${role}). Joined room: ${roomName}`);

        // Emit current status for the tenant
        if (role !== 'root') {
            const state = getClientState(tenantId);
            socket.emit('whatsapp_status', state);
        }

        // Listen for message sending
        socket.on('send_message', async (data) => {
            if (role === 'root') return; // root doesn't send messages

            // Re-verify tenant status during execution to prevent expired sessions from sending messages
            try {
                const tenant = await dbGet("SELECT status, expires_at FROM tenants WHERE id = ?", [tenantId]);
                if (!tenant || tenant.status !== 'active' || tenant.expires_at < new Date().toISOString()) {
                    socket.emit('message_error', { error: 'Assinatura vencida ou suspensa.' });
                    await destroyWhatsAppClient(tenantId);
                    return;
                }
            } catch (err) {
                socket.emit('message_error', { error: 'Erro de validação da empresa.' });
                return;
            }

            const client = getClient(tenantId);
            const state = getClientState(tenantId);
            if (!client || !state.ready) {
                socket.emit('message_error', { error: 'WhatsApp não conectado' });
                return;
            }

            const { chatId, text, fileData, quotedMessageId } = data;
            const formattedText = text ? `*${name}:*\n${text}` : `*${name}* (Enviou um anexo)`;

            try {
                let msg;
                const options = quotedMessageId ? { quotedMessageId } : {};

                if (fileData) {
                    const base64Data = fileData.data.includes(',') ? fileData.data.split(',')[1] : fileData.data;
                    let mimetype = fileData.mimetype;
                    let filename = fileData.name;
                    const isVoice = mimetype === 'audio/ogg' || 
                                    mimetype === 'audio/webm' || 
                                    (filename && filename.startsWith('Áudio Gravado'));
                    
                    if (isVoice) {
                        // Force mimetype and filename to standard audio/ogg so WhatsApp treats it as a native voice note (PTT)
                        mimetype = 'audio/ogg';
                        filename = 'Áudio Gravado.ogg';
                    }

                    const media = new MessageMedia(mimetype, base64Data, filename);
                    
                    if (mimetype && mimetype.startsWith('audio/')) {
                        // Audio files (voice notes or uploaded audio) do not support captions in WhatsApp
                        msg = await client.sendMessage(chatId, media, { 
                            sendAudioAsVoice: isVoice, 
                            ...options 
                        });
                    } else {
                        msg = await client.sendMessage(chatId, media, { 
                            caption: formattedText, 
                            ...options 
                        });
                    }
                } else {
                    msg = await client.sendMessage(chatId, formattedText, options);
                }

                let quotedMsg = null;
                if (msg.hasQuotedMsg && msg._data && msg._data.quotedMsg) {
                    quotedMsg = {
                        body: msg._data.quotedMsg.body,
                        type: msg._data.quotedMsg.type,
                        participant: msg._data.quotedMsg.participant || msg._data.quotedMsg.from
                    };
                }

                updateChatCacheOnMessage(tenantId, chatId, msg.timestamp, true);

                io.to(roomName).emit('whatsapp_message', {
                    id: msg.id._serialized,
                    chatId: msg.id.remote || (msg.fromMe ? msg.to : msg.from),
                    from: msg.from,
                    to: msg.to,
                    body: msg.body,
                    timestamp: msg.timestamp,
                    fromMe: true,
                    hasMedia: msg.hasMedia,
                    type: msg.type,
                    ack: msg.ack,
                    senderName: name,
                    quotedMsg: quotedMsg
                });
            } catch (error) {
                console.error(`Error sending message for tenant ${tenantId}:`, error);
                socket.emit('message_error', { error: 'Falha ao enviar mensagem' });
            }
        });

        socket.on('edit_message', async (data) => {
            if (role === 'root') return;

            try {
                const tenant = await dbGet("SELECT status, expires_at FROM tenants WHERE id = ?", [tenantId]);
                if (!tenant || tenant.status !== 'active' || tenant.expires_at < new Date().toISOString()) {
                    socket.emit('message_error', { error: 'Assinatura vencida ou suspensa.' });
                    await destroyWhatsAppClient(tenantId);
                    return;
                }
            } catch (err) {
                socket.emit('message_error', { error: 'Erro de validação da empresa.' });
                return;
            }

            const client = getClient(tenantId);
            const state = getClientState(tenantId);
            if (!client || !state.ready) {
                socket.emit('message_error', { error: 'WhatsApp não conectado' });
                return;
            }

            const { messageId, newText } = data;
            const formattedText = `*${name}:*\n${newText}`;

            try {
                const msg = await client.getMessageById(messageId);
                if (!msg) {
                    socket.emit('message_error', { error: 'Mensagem não encontrada' });
                    return;
                }
                
                await msg.edit(formattedText);
                
                io.to(roomName).emit('whatsapp_message_edit', {
                    id: messageId,
                    chatId: msg.id.remote || (msg.fromMe ? msg.to : msg.from),
                    body: formattedText
                });
            } catch (error) {
                console.error(`Error editing message for tenant ${tenantId}:`, error);
                socket.emit('message_error', { error: 'Falha ao editar mensagem. WhatsApp limita a edição a mensagens recentes (até 15 minutos).' });
            }
        });

        socket.on('disconnect', () => {
            console.log(`Socket disconnected: ${socket.id}`);
        });
    });
});

// Proxy Reverso para o Frontend na Vercel
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://zapping-frontend.vercel.app';

app.use((req, res, next) => {
    // Ignorar rotas de API, database e conexões do socket.io
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
    }

    // Apenas tratar requisições GET/HEAD para páginas e arquivos estáticos
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
    }

    try {
        const targetUrl = new URL(req.url, FRONTEND_URL);
        const protocol = targetUrl.protocol === 'https:' ? https : http;

        const options = {
            method: req.method,
            headers: {
                ...req.headers,
                host: targetUrl.host // Necessário para a Vercel identificar o host correto
            }
        };

        // Limpar headers de conexão para evitar problemas com keep-alive/proxy
        delete options.headers['connection'];
        delete options.headers['host'];
        options.headers['host'] = targetUrl.host;

        const proxyReq = protocol.request(targetUrl.toString(), options, (proxyRes) => {
            // Repassar os headers e o status da Vercel para o navegador
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('Erro no Proxy Reverso do Frontend:', err);
            res.status(502).send(`Erro ao carregar o frontend da nuvem: ${err.message}`);
        });

        req.pipe(proxyReq);
    } catch (error) {
        console.error('Configuração inválida de FRONTEND_URL:', error);
        res.status(500).send('Erro de configuração do servidor: FRONTEND_URL inválida.');
    }
});

// Periodic check to suspend expired clients (runs every hour)
setInterval(async () => {
    try {
        const currentDate = new Date().toISOString();
        const expiredTenants = await dbAll(
            "SELECT id FROM tenants WHERE status != 'active' OR expires_at < ?",
            [currentDate]
        );
        for (const tenant of expiredTenants) {
            await destroyWhatsAppClient(tenant.id);
        }
    } catch (err) {
        console.error('Error during periodic expiration check:', err);
    }
}, 60 * 60 * 1000);

// --- AUTO UPDATE SYSTEM ROUTINES ---
let updateStatus = { status: 'idle', progress: 0, error: null };

// GET /api/status (Health check for frontend connection check)
app.get('/api/status', (req, res) => {
    res.json({ status: 'online' });
});

// GET /api/system/version
app.get('/api/system/version', (req, res) => {
    try {
        const packageJson = require('./package.json');
        res.json({ version: packageJson.version });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao obter versão do sistema.' });
    }
});

// GET /api/system/update/status
app.get('/api/system/update/status', (req, res) => {
    res.json(updateStatus);
});

// POST /api/system/update
app.post('/api/system/update', async (req, res) => {
    const { downloadUrl } = req.body;
    if (!downloadUrl) {
        return res.status(400).json({ error: 'downloadUrl é obrigatório.' });
    }

    // Respond immediately to the frontend that the update process has begun
    res.json({ message: 'Processo de atualização iniciado.' });

    // Run the rest in background
    (async () => {
        try {
            const fs = require('fs');
            const path = require('path');
            const os = require('os');
            const http = require('http');
            const https = require('https');

            const tarPath = path.join(__dirname, 'zapping-backend.tar');

            // Helper to download file with progress
            const downloadFileWithProgress = (url, destPath) => {
                return new Promise((resolve, reject) => {
                    const file = fs.createWriteStream(destPath);
                    updateStatus = { status: 'downloading', progress: 0, error: null };

                    function get(urlToGet) {
                        const lib = urlToGet.startsWith('https') ? https : http;
                        lib.get(urlToGet, {
                            headers: {
                                'User-Agent': 'NodeJS-Downloader'
                            }
                        }, (response) => {
                            if (response.statusCode === 301 || response.statusCode === 302) {
                                get(response.headers.location);
                                return;
                            }

                            if (response.statusCode !== 200) {
                                reject(new Error(`Erro HTTP: ${response.statusCode}`));
                                return;
                            }

                            const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
                            let downloadedBytes = 0;

                            response.on('data', (chunk) => {
                                downloadedBytes += chunk.length;
                                if (totalBytes > 0) {
                                    const percent = Math.round((downloadedBytes / totalBytes) * 100);
                                    updateStatus.progress = percent;
                                }
                            });

                            response.pipe(file);

                            file.on('finish', () => {
                                file.close();
                                resolve();
                            });
                        }).on('error', (err) => {
                            fs.unlink(destPath, () => {});
                            reject(err);
                        });
                    }

                    get(url);
                });
            };

            // Helper to post file to docker images load endpoint
            const loadDockerImage = (filePath) => {
                return new Promise((resolve, reject) => {
                    const req = http.request({
                        socketPath: '/var/run/docker.sock',
                        path: '/images/load',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-tar'
                        }
                    }, (res) => {
                        let data = '';
                        res.on('data', (chunk) => { data += chunk; });
                        res.on('end', () => {
                            if (res.statusCode === 200) {
                                resolve(data);
                            } else {
                                reject(new Error(`Load image error: ${data}`));
                            }
                        });
                    });
                    req.on('error', reject);
                    const readStream = fs.createReadStream(filePath);
                    readStream.pipe(req);
                });
            };

            // Helper to pull image
            const pullImage = (imageName, tag = 'latest') => {
                return new Promise((resolve, reject) => {
                    const req = http.request({
                        socketPath: '/var/run/docker.sock',
                        path: `/images/create?fromImage=${imageName}&tag=${tag}`,
                        method: 'POST'
                    }, (res) => {
                        res.on('data', (chunk) => {});
                        res.on('end', () => {
                            if (res.statusCode === 200) {
                                resolve();
                            } else {
                                reject(new Error(`Pull image status: ${res.statusCode}`));
                            }
                        });
                    });
                    req.on('error', reject);
                    req.end();
                });
            };

            // Helper to perform Docker API requests
            const dockerApiRequest = (options, body = null) => {
                return new Promise((resolve, reject) => {
                    const req = http.request({
                        socketPath: '/var/run/docker.sock',
                        ...options
                    }, (res) => {
                        let data = '';
                        res.on('data', (chunk) => { data += chunk; });
                        res.on('end', () => {
                            if (res.statusCode >= 200 && res.statusCode < 300) {
                                try {
                                    resolve(data ? JSON.parse(data) : null);
                                } catch (e) {
                                    resolve(data);
                                }
                            } else {
                                reject(new Error(`Docker API error (${res.statusCode}): ${data}`));
                            }
                        });
                    });
                    req.on('error', reject);
                    if (body) {
                        req.write(typeof body === 'string' ? body : JSON.stringify(body));
                    }
                    req.end();
                });
            };

            // 1. Download new version tar
            console.log(`Iniciando download da atualização de: ${downloadUrl}`);
            await downloadFileWithProgress(downloadUrl, tarPath);
            console.log('Download concluído com sucesso.');

            // 2. Load docker image
            updateStatus = { status: 'loading_image', progress: 100, error: null };
            console.log('Carregando imagem tar no Docker...');
            await loadDockerImage(tarPath);
            console.log('Imagem carregada no Docker com sucesso.');

            // Remove tar file to save disk space
            try {
                fs.unlinkSync(tarPath);
                console.log('Arquivo tar temporário excluído.');
            } catch (err) {
                console.error('Erro ao excluir arquivo tar temporário:', err);
            }

            // 3. Inspect configuration
            updateStatus = { status: 'restarting', progress: 100, error: null };
            const containerId = os.hostname();
            console.log(`Inspecionando container ID: ${containerId}`);
            
            const containerInfo = await dockerApiRequest({
                path: `/containers/${containerId}/json`,
                method: 'GET'
            });

            const containerName = containerInfo.Name.replace(/^\//, '');
            const image = containerInfo.Config.Image;

            // Ports
            const portBindings = containerInfo.HostConfig.PortBindings || {};
            let portsStr = '';
            for (const [containerPort, bindings] of Object.entries(portBindings)) {
                if (bindings && bindings.length > 0) {
                    for (const binding of bindings) {
                        portsStr += ` -p ${binding.HostPort}:${containerPort}`;
                    }
                }
            }

            // Volumes
            const binds = containerInfo.HostConfig.Binds || [];
            let volumesStr = '';
            for (const bind of binds) {
                volumesStr += ` -v "${bind}"`;
            }

            // Envs
            const envs = containerInfo.Config.Env || [];
            let envsStr = '';
            for (const env of envs) {
                if (!env.startsWith('PATH=') && !env.startsWith('NODE_VERSION=')) {
                    envsStr += ` -e "${env.replace(/"/g, '\\"')}"`;
                }
            }

            // Networks
            const networks = Object.keys(containerInfo.NetworkSettings.Networks || {});
            let networkStr = '';
            if (networks.length > 0) {
                networkStr = ` --network ${networks[0]}`;
            }

            // Pull helper image
            console.log('Puxando imagem docker:latest para o updater...');
            await pullImage('docker', 'latest');

            // Start updater container
            const runCmd = `sleep 3 && docker stop ${containerName} && docker rm ${containerName} && docker run -d --name ${containerName}${portsStr}${volumesStr}${envsStr}${networkStr} --restart unless-stopped ${image}`;
            
            const updaterConfig = {
                Image: 'docker:latest',
                Cmd: ['sh', '-c', runCmd],
                HostConfig: {
                    Binds: ['/var/run/docker.sock:/var/run/docker.sock'],
                    AutoRemove: true
                }
            };

            console.log('Criando container updater...');
            const updater = await dockerApiRequest({
                path: '/containers/create',
                method: 'POST'
            }, updaterConfig);

            console.log('Iniciando container updater...');
            await dockerApiRequest({
                path: `/containers/${updater.Id}/start`,
                method: 'POST'
            });

            console.log('Updater iniciado com sucesso. Este container desligará em breve.');
        } catch (err) {
            console.error('Erro no fluxo de auto-atualização:', err);
            updateStatus = { status: 'failed', progress: 0, error: err.message };
        }
    })();
});

// Initialize DB and start servers
const PORT = 3001;
initDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`Backend server running on http://localhost:${PORT}`);
        initWhatsApp(io);
    });
});
