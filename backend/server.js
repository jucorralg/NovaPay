const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const sessions = {}; // Store sessions in memory (for dev)

function generateConfirmationCode() {
    return 'NP-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

// --- WebSocket Server ---
const wss = new WebSocket.Server({ port: 3001 });
const agentSockets = {}; // map agentId -> socket

wss.on('connection', (ws, req) => {
    ws.on('message', (msg) => {
        const data = JSON.parse(msg);
        if (data.agentId) {
            agentSockets[data.agentId] = ws; // register agent
        }
    });
});

// --- 1) Create payment session ---
app.post('/api/create-session', (req, res) => {
    const { amount, customerEmail, agentId } = req.body;
    if (!amount || !customerEmail || !agentId) {
        return res.status(400).json({ message: 'Missing fields' });
    }

    const sessionId = uuidv4();
    const paymentUrl = `http://localhost:3000/frontend/index.html?sessionId=${sessionId}`;

    sessions[sessionId] = {
        agentId,
        amount,
        customerEmail,
        status: 'pending',
    };

    res.json({ sessionId, paymentUrl });
});

// --- 2) Customer submits payment ---
app.post('/api/pay', (req, res) => {
    const { sessionId, cardNumber, cardName, expiry, cvv } = req.body;
    const session = sessions[sessionId];
    if (!session) return res.status(400).json({ message: 'Invalid session' });

    if (!cardNumber || !cardName || !expiry || !cvv) {
        return res.status(400).json({ message: 'Missing card info' });
    }

    const last4 = cardNumber.slice(-4);
    const confirmationCode = generateConfirmationCode();

    // Update session
    session.status = 'completed';
    session.last4 = last4;
    session.confirmationCode = confirmationCode;

    // Notify agent if WebSocket connected
    const ws = agentSockets[session.agentId];
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            sessionId,
            status: 'completed',
            amount: session.amount,
            last4,
            confirmationCode
        }));
    }

    res.json({
        status: 'success',
        amount: session.amount,
        last4,
        confirmationCode
    });
});

// --- 3) Optional polling endpoint ---
app.get('/api/session-status', (req, res) => {
    const { sessionId } = req.query;
    const session = sessions[sessionId];
    if (!session) return res.status(400).json({ message: 'Invalid session' });
    res.json(session);
});

//debug app
app.get('/', (req, res) => {
    res.send('Backend is running!');
});

app.listen(PORT, () => {
    console.log(`Mock Payment API running on port ${PORT}`);
    console.log('WebSocket server running on port 3001');
});


