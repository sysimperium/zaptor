const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { 
        origin: '*',
        methods: ['GET', 'POST']
    } 
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
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
    }
});

let qrCodeData = null;
let isReady = false;

client.on('qr', (qr) => {
    qrCodeData = qr;
    qrcode.generate(qr, { small: true });
    io.emit('whatsapp_qr', { qr });
});

client.on('ready', () => {
    isReady = true;
    qrCodeData = null;
    io.emit('whatsapp_status', { ready: true });
    console.log('ZapTor está online e pronto!');
});

// Endpoint para buscar a lista de conversas
app.get('/api/chats', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'WhatsApp não está pronto' });
    try {
        const chats = await client.getChats();
        const simplified = chats.slice(0, 20).map(chat => ({
            id: chat.id._serialized,
            name: chat.name,
            unreadCount: chat.unreadCount,
            timestamp: chat.timestamp
        }));
        res.json(simplified);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Endpoint para buscar mensagens de um chat específico
app.get('/api/chats/:chatId/messages', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'WhatsApp não está pronto' });
    try {
        const chat = await client.getChatById(req.params.chatId);
        const messages = await chat.fetchMessages({ limit: 30 });
        res.json(messages.map(msg => ({
            id: msg.id._serialized,
            body: msg.body,
            fromMe: msg.fromMe,
            timestamp: msg.timestamp
        })));
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

client.on('message_create', async (msg) => {
    io.emit('whatsapp_message', {
        id: msg.id._serialized,
        chatId: msg.id.remote,
        body: msg.body,
        fromMe: msg.fromMe,
        timestamp: msg.timestamp,
        author: msg.author || msg.from
    });
});

app.get('/health', (req, res) => res.send('ZapTor Vivo!'));

io.on('connection', (socket) => {
    console.log('Cliente conectado ao ZapTor');
    socket.emit('whatsapp_status', { ready: isReady, qr: qrCodeData });

    socket.on('send_message', async (data) => {
        if (!isReady) return;
        const { loginName, chatId, text } = data;
        const formattedText = `*${loginName}:* ${text}`;
        try {
            await client.sendMessage(chatId, formattedText);
            console.log(`Mensagem enviada por ${loginName}`);
        } catch (err) {
            console.error('Erro ao enviar mensagem:', err);
        }
    });
});

client.initialize();

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`ZapTor rodando na porta ${PORT}`);
});
