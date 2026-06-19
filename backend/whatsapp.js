const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { dbAll, dbGet, dbRun } = require('./database');
const fs = require('fs');
const path = require('path');

const stringifyId = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') return val._serialized || val.user || JSON.stringify(val);
    return String(val);
};

const clients = new Map();
const clientStates = new Map(); // tenantId -> { ready: boolean, qr: string|null, error: string|null }
let io = null;

const chatsCache = new Map(); // tenantId -> { chats: Array, timestamp: number }
const activeChatsPromises = new Map(); // tenantId -> Promise

const getClientState = (tenantId) => {
    return clientStates.get(tenantId) || { ready: false, qr: null, error: null };
};

const getClient = (tenantId) => {
    return clients.get(tenantId);
};

const updateChatCacheOnMessage = (tenantId, chatId, timestamp, fromMe) => {
    const cached = chatsCache.get(tenantId);
    if (cached && cached.chats) {
        const chat = cached.chats.find(c => stringifyId(c.id) === chatId);
        if (chat) {
            chat.timestamp = timestamp;
            if (!fromMe) {
                chat.unreadCount = (chat.unreadCount || 0) + 1;
            }
        }
    }
};

const updateChatCacheReadStatus = (tenantId, chatId, isRead) => {
    const cached = chatsCache.get(tenantId);
    if (cached && cached.chats) {
        const chat = cached.chats.find(c => stringifyId(c.id) === chatId);
        if (chat) {
            chat.unreadCount = isRead ? 0 : -1;
        }
    }
};

const getChatsCached = async (tenantId) => {
    const client = clients.get(tenantId);
    if (!client) throw new Error('WhatsApp client not found');

    const now = Date.now();
    const cached = chatsCache.get(tenantId);
    if (cached && (now - cached.timestamp) < 30000) {
        return cached.chats;
    }

    if (activeChatsPromises.has(tenantId)) {
        return activeChatsPromises.get(tenantId);
    }

    const promise = (async () => {
        try {
            const chats = await client.getChats();
            chatsCache.set(tenantId, { chats, timestamp: Date.now() });
            return chats;
        } finally {
            activeChatsPromises.delete(tenantId);
        }
    })();

    activeChatsPromises.set(tenantId, promise);
    return promise;
};

const createWhatsAppClient = (tenantId) => {
    if (clients.has(tenantId)) {
        return clients.get(tenantId);
    }

    console.log(`Creating WhatsApp client for Tenant ID: ${tenantId}`);

    // Clean up Chrome singleton locks that prevent startup when using docker volumes
    try {
        const sessionPath = path.join(process.cwd(), '.wwebjs_auth', `session-tenant_${tenantId}`);
        const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
        for (const lockFile of lockFiles) {
            const lockFilePath = path.join(sessionPath, lockFile);
            let shouldDelete = false;
            try {
                fs.lstatSync(lockFilePath);
                shouldDelete = true;
            } catch (e) {
                if (e.code !== 'ENOENT') {
                    shouldDelete = true;
                }
            }
            if (shouldDelete) {
                fs.unlinkSync(lockFilePath);
                console.log(`Removed ${lockFile} for Tenant ${tenantId}`);
            }
        }
    } catch (err) {
        console.error(`Error cleaning up singleton locks for Tenant ${tenantId}:`, err);
    }

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: `tenant_${tenantId}`,
            dataPath: './.wwebjs_auth'
        }),
        puppeteer: {
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--disable-extensions'
            ],
            timeout: 60000,
            protocolTimeout: 300000
        }
    });

    clientStates.set(tenantId, { ready: false, qr: null, error: null });

    client.on('qr', (qr) => {
        console.log(`QR Code generated for Tenant ${tenantId}`);
        clientStates.set(tenantId, { ready: false, qr, error: null });
        if (io) {
            io.to(`tenant_${tenantId}`).emit('whatsapp_status', { ready: false, qr });
        }
    });

    client.on('ready', () => {
        console.log(`WhatsApp Client is ready for Tenant ${tenantId}!`);
        clientStates.set(tenantId, { ready: true, qr: null, error: null });
        if (io) {
            io.to(`tenant_${tenantId}`).emit('whatsapp_status', { ready: true, qr: null });
        }
    });

    client.on('authenticated', () => {
        console.log(`WhatsApp Authenticated for Tenant ${tenantId}`);
    });

    client.on('auth_failure', (msg) => {
        console.error(`WhatsApp Authentication failure for Tenant ${tenantId}:`, msg);
        clientStates.set(tenantId, { ready: false, qr: null, error: 'Falha na autenticação' });
        if (io) {
            io.to(`tenant_${tenantId}`).emit('whatsapp_status', { ready: false, qr: null, error: 'Falha na autenticação' });
        }
    });

    client.on('disconnected', (reason) => {
        console.log(`WhatsApp Client was logged out for Tenant ${tenantId}. Reason:`, reason);
        clientStates.set(tenantId, { ready: false, qr: null, error: null });
        if (io) {
            io.to(`tenant_${tenantId}`).emit('whatsapp_status', { ready: false, qr: null });
        }
    });

    client.on('message_create', async (msg) => {
        const chatId = stringifyId(msg.id.remote || (msg.fromMe ? msg.to : msg.from));
        updateChatCacheOnMessage(tenantId, chatId, msg.timestamp, msg.fromMe);

        // Broadcast message to connected frontend clients
        if (io) {
            let quotedMsg = null;
            if (msg.hasQuotedMsg && msg._data && msg._data.quotedMsg) {
                quotedMsg = {
                    body: msg._data.quotedMsg.body,
                    type: msg._data.quotedMsg.type,
                    participant: stringifyId(msg._data.quotedMsg.participant || msg._data.quotedMsg.from)
                };
            }

            io.to(`tenant_${tenantId}`).emit('whatsapp_message', {
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
            });
        }

        // Auto-response: only for incoming messages from real contacts (not groups, not self)
        if (!msg.fromMe && msg.from && !msg.from.endsWith('@g.us')) {
            try {
                const autoResp = await dbGet(
                    "SELECT * FROM auto_responses WHERE tenant_id = ? AND type = 'first_of_day' AND enabled = 1",
                    [tenantId]
                );

                if (autoResp && autoResp.message) {
                    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
                    const contactId = msg.from;

                    // Check if already sent today
                    const alreadySent = await dbGet(
                        "SELECT id FROM auto_response_log WHERE tenant_id = ? AND contact_id = ? AND response_date = ?",
                        [tenantId, contactId, today]
                    );

                    if (!alreadySent) {
                        // Send auto-response
                        await client.sendMessage(contactId, autoResp.message);
                        console.log(`[AutoResp] Sent first-of-day response to ${contactId} for Tenant ${tenantId}`);

                        // Log it to prevent duplicate today
                        await dbRun(
                            "INSERT OR IGNORE INTO auto_response_log (tenant_id, contact_id, response_date) VALUES (?, ?, ?)",
                            [tenantId, contactId, today]
                        );
                    }
                }
            } catch (err) {
                console.error(`[AutoResp] Error processing auto-response for Tenant ${tenantId}:`, err);
            }
        } else if (msg.fromMe && msg.to && !msg.to.endsWith('@g.us')) {
            // If the operator sends a message first, log it to prevent sending the auto-response today
            try {
                const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
                const contactId = stringifyId(msg.to);
                await dbRun(
                    "INSERT OR IGNORE INTO auto_response_log (tenant_id, contact_id, response_date) VALUES (?, ?, ?)",
                    [tenantId, contactId, today]
                );
            } catch (err) {
                console.error(`[AutoResp] Error logging outgoing message for Tenant ${tenantId}:`, err);
            }
        }
    });

    client.on('message_ack', (msg, ack) => {
        if (io) {
            io.to(`tenant_${tenantId}`).emit('whatsapp_message_ack', {
                id: msg.id._serialized,
                chatId: stringifyId(msg.id.remote || (msg.fromMe ? msg.to : msg.from)),
                ack: ack
            });
        }
    });

    client.on('message_edit', async (msg, newBody, prevBody) => {
        if (io) {
            io.to(`tenant_${tenantId}`).emit('whatsapp_message_edit', {
                id: msg.id._serialized,
                chatId: stringifyId(msg.id.remote || (msg.fromMe ? msg.to : msg.from)),
                body: newBody || msg.body
            });
        }
    });

    // Incoming call notification
    client.on('call', async (call) => {
        console.log(`[Call] Incoming ${call.isVideo ? 'video' : 'voice'} call for Tenant ${tenantId} from ${call.from}`);
        if (io) {
            io.to(`tenant_${tenantId}`).emit('whatsapp_call', {
                from: call.from,
                isVideo: call.isVideo || false,
                timestamp: Date.now()
            });
        }
    });

    clients.set(tenantId, client);

    client.initialize().catch(err => {
        console.error(`Error initializing client for Tenant ${tenantId}:`, err);
        clientStates.set(tenantId, { ready: false, qr: null, error: 'Erro ao inicializar' });
    });

    return client;
};

const destroyWhatsAppClient = async (tenantId) => {
    const client = clients.get(tenantId);
    chatsCache.delete(tenantId);
    activeChatsPromises.delete(tenantId);
    if (client) {
        try {
            await client.destroy();
            console.log(`Destroyed WhatsApp client for Tenant ${tenantId}`);
        } catch (err) {
            console.error(`Error destroying client for Tenant ${tenantId}:`, err);
        }
        clients.delete(tenantId);
        clientStates.delete(tenantId);
        if (io) {
            io.to(`tenant_${tenantId}`).emit('whatsapp_status', { ready: false, qr: null });
        }
    }
};

const initWhatsApp = async (ioInstance) => {
    io = ioInstance;

    // Load active and non-expired tenants from DB and initialize them
    try {
        const currentDate = new Date().toISOString();
        const activeTenants = await dbAll(
            "SELECT id FROM tenants WHERE status = 'active' AND expires_at >= ?",
            [currentDate]
        );

        console.log(`Initializing ${activeTenants.length} active WhatsApp clients...`);
        for (const tenant of activeTenants) {
            createWhatsAppClient(tenant.id);
        }
    } catch (err) {
        console.error('Error during WhatsApp clients initialization:', err);
    }
};

module.exports = {
    initWhatsApp,
    createWhatsAppClient,
    destroyWhatsAppClient,
    getClient,
    getClientState,
    getChatsCached,
    updateChatCacheOnMessage,
    updateChatCacheReadStatus
};
