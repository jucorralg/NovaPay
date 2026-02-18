const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const sessions = {}; // In-memory session storage

// --- Serve frontend ---
app.use(express.static(path.join(__dirname, 'frontend')));

// Optional root redirect to index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// --- WebSocket server (optional) ---
const wss = new WebSocket.Server({ port: 3001 });
const agentSockets = {};

wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
        const data = JSON.parse(msg);
        if (data.agentId) {
            agentSockets[data.agentId] = ws;
        }
    });
});

// --- Helper ---
function generateConfirmationCode() {
    return 'NP-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

// --- Create payment session ---
app.post('/api/create-session', (req, res) => {
    const { amount, customerEmail, agentId } = req.body;
    if (!amount || !customerEmail || !agentId) {
        return res.status(400).json({ message: 'Missing fields' });
    }

    const sessionId = uuidv4();
    const paymentUrl = `http://localhost:3000/index.html?sessionId=${sessionId}&amount=${amount}`;

    sessions[sessionId] = {
        agentId,
        amount,
        customerEmail,
        status: 'pending',
    };

    res.json({ sessionId, paymentUrl });
});

// --- Process payment ---
app.post('/api/pay', (req, res) => {
    const { sessionId, cardNumber, cardName, expiry, cvv } = req.body;
    const session = sessions[sessionId];
    if (!session) return res.status(400).json({ message: 'Invalid session' });
    if (!cardNumber || !cardName || !expiry || !cvv) {
        return res.status(400).json({ message: 'Missing card info' });
    }

    const last4 = cardNumber.slice(-4);
    const confirmationCode = generateConfirmationCode();

    session.status = 'completed';
    session.last4 = last4;
    session.confirmationCode = confirmationCode;

    // Notify agent via WebSocket
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

// --- Session status (polling) ---
app.get('/api/session-status', (req, res) => {
    const { sessionId } = req.query;
    const session = sessions[sessionId];
    if (!session) return res.status(400).json({ message: 'Invalid session' });
    res.json(session);
});

// --- Debug ---
app.get('/health', (req, res) => res.send('Backend is running'));

app.listen(PORT, () => {
    console.log(`Mock Payment API running on port ${PORT}`);
    console.log('WebSocket server running on port 3001');
});

