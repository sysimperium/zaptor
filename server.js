const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Configuração do Supabase
const supabaseUrl = 'https://vxthbpdqaumvdwfsgdqi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4dGhicGRxYXVtdmR3ZnNnZHFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTUzNzIsImV4cCI6MjA5NTI5MTM3Mn0.qQPdWS-pMPPdvtkfDwkW7lbbn8eYMfNqMFHvNwvsL-A';
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    if ('OPTIONS' === req.method) {
        return res.sendStatus(200);
    }
    next();
});

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { 
        origin: "*",
        methods: ["GET", "POST"]
    } 
});

const client = new Client({
    authStrategy: new LocalAuth(), // Futuramente implementaremos o RemoteAuth com Supabase Storage
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
        const simplified = chats.slice(0, 25).map(chat => ({
            id: chat.id._serialized,
            name: chat.name || chat.id.user,
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
        const messages = await chat.fetchMessages({ limit: 40 });
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

    // Auditoria opcional no Supabase (Exemplo)
    try {
        await supabase.from('logs_zaptor').insert([{
            chat_id: msg.id.remote,
            body: msg.body,
            from_me: msg.fromMe,
            timestamp: new Date().toISOString()
        }]);
    } catch (e) {
        // Silencioso se a tabela não existir ainda
    }
});

app.get('/health', (req, res) => res.send('ZapTor Vivo!'));

io.on('connection', (socket) => {
    socket.emit('whatsapp_status', { ready: isReady, qr: qrCodeData });

    socket.on('send_message', async (data) => {
        if (!isReady) return;
        const { loginName, chatId, text } = data;
        const formattedText = `*${loginName}:* ${text}`;
        try {
            await client.sendMessage(chatId, formattedText);
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
