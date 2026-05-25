const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Middleware CORS Robusto
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    if ('OPTIONS' === req.method) return res.sendStatus(200);
    next();
});

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*", methods: ["GET", "POST"] } 
});

const client = new Client({
    authStrategy: new LocalAuth(),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018.665-alpha.html',
    },
    puppeteer: {
        handleSIGTERM: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process',
            '--no-zygote',
            '--disable-gpu'
        ],
    }
});

let qrCodeData = null;
let isReady = false;

client.on('qr', (qr) => {
    qrCodeData = qr;
    io.emit('whatsapp_qr', { qr });
});

client.on('ready', () => {
    isReady = true;
    qrCodeData = null;
    io.emit('whatsapp_status', { ready: true });
    console.log('ZapTor Online!');
});

app.get('/api/chats', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'Aguardando WhatsApp...' });
    try {
        const chats = await client.getChats();
        res.json(chats.slice(0, 20).map(c => ({ id: c.id._serialized, name: c.name || c.id.user })));
    } catch (err) { res.status(500).json({ error: err.toString() }); }
});

app.get('/api/chats/:chatId/messages', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'Aguardando WhatsApp...' });
    try {
        const chat = await client.getChatById(req.params.chatId);
        const msgs = await chat.fetchMessages({ limit: 30 });
        res.json(msgs.map(m => ({ id: m.id._serialized, body: m.body, fromMe: m.fromMe, timestamp: m.timestamp })));
    } catch (err) { res.status(500).json({ error: err.toString() }); }
});

client.on('message_create', (msg) => {
    io.emit('whatsapp_message', {
        id: msg.id._serialized,
        chatId: msg.id.remote,
        body: msg.body,
        fromMe: msg.fromMe,
        timestamp: msg.timestamp
    });
});

io.on('connection', (socket) => {
    socket.emit('whatsapp_status', { ready: isReady, qr: qrCodeData });
    socket.on('send_message', async (data) => {
        if (!isReady) return;
        try {
            await client.sendMessage(data.chatId, `*${data.loginName}:* ${data.text}`);
        } catch (err) { console.error(err); }
    });
});

client.initialize();
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => console.log(`ZapTor na porta ${PORT}`));
