const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/*
  🔥 IMPORTANTE:
  En Render debes configurar esta variable de entorno:

  FRONTEND_URL = https://jucorral.github.io/MockPayment
*/

const FRONTEND_URL =
  process.env.FRONTEND_URL || 'http://localhost:3000';

const sessions = {}; // In-memory session storage

// ============================
// Add REDIS
// ============================
const { createClient } = require('redis');

const redisClient = createClient({
  url: process.env.REDIS_URL
});

redisClient.connect()
  .then(() => console.log("Redis connected"))
  .catch(console.error);

// ============================
// Serve frontend (solo local)
// ============================
app.use(express.static(path.join(__dirname, 'frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ============================
// Create HTTP server
// ============================
const server = http.createServer(app);

// ============================
// WebSocket server (MISMO PUERTO)
// ============================
const wss = new WebSocket.Server({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

const agentSockets = {};

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.agentId) {
        agentSockets[data.agentId] = ws;
      }
    } catch (err) {
      console.log('Invalid WS message');
    }
  });
});

// ============================
// Helper
// ============================
function generateConfirmationCode() {
  return 'NP-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

// ============================
// Create payment session
// ============================
app.post('/api/create-session', async (req, res) => {
  const { amount, customerEmail, agentId } = req.body;

  if (!amount || !customerEmail || !agentId) {
    return res.status(400).json({ message: 'Missing fields' });
  }

  const sessionId = uuidv4();

  await redisClient.set(sessionId,JSON.stringify({
    agentId,
    amount,
    customerEmail,
    status: 'pending',
    })
  );

  // 🔥 Ahora usamos FRONTEND_URL (GitHub Pages en producción)
  const paymentUrl =
    `${FRONTEND_URL}/index.html?sessionId=${sessionId}&amount=${amount}`;

  res.json({ sessionId, paymentUrl });
});

// ============================
// Process payment
// ============================
app.post('/api/pay', async (req, res) => {
  const { sessionId, cardNumber, cardName, expiry, cvv } = req.body;

  let session = await redisClient.get(sessionId);
  if (!session) return res.status(400).json({ message: 'Invalid session' });

  session = JSON.parse(session);

  if (!session) return res.status(400).json({ message: 'Invalid session' });

  if (!cardNumber || !cardName || !expiry || !cvv) {
    return res.status(400).json({ message: 'Missing card info' });
  }

  const last4 = cardNumber.slice(-4);
  const confirmationCode = generateConfirmationCode();

  session.status = 'completed';
  session.last4 = last4;
  session.confirmationCode = confirmationCode;
  await redisClient.set(sessionId, JSON.stringify(session));

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

// ============================
// Session status (polling)
// ============================
app.get('/api/session-status', async (req, res) => {
  const { sessionId } = req.query;
  let session = await redisClient.get(sessionId);
  if (!session) return res.status(400).json({ message: 'Invalid session' });

  res.json(JSON.parse(session));

});

// ============================
// Health check
// ============================
app.get('/health', (req, res) => {
  res.send('Backend is running');
});

// ============================
// Start server (HTTP + WS)
// ============================
server.listen(PORT, () => {
  console.log(`Mock Payment API running on port ${PORT}`);
});
