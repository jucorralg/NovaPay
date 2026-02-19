// =====================================
// MockPayment Server with Redis polling
// =====================================

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const path = require('path');
const { createClient } = require('redis');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/*
  🔥 IMPORTANT:
  In Render, set this environment variable:

  FRONTEND_URL = https://jucorral.github.io/MockPayment
*/
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ============================
// Redis Client
// ============================
const redisClient = createClient({
  url: process.env.REDIS_URL // e.g. redis://red-d6bcjbggjchc73ahno00:6379
});

redisClient.connect()
  .then(() => console.log("Redis connected"))
  .catch(console.error);

// ============================
// Serve frontend (for local testing)
// ============================
app.use(express.static(path.join(__dirname, 'frontend')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
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

  // Save session in Redis
  await redisClient.set(sessionId, JSON.stringify({
    agentId,
    amount,
    customerEmail,
    status: 'pending'
  }));

  // Build frontend URL with sessionId and prepopulated amount
  const paymentUrl = `${FRONTEND_URL}/index.html?sessionId=${sessionId}&amount=${amount}`;

  res.json({ sessionId, paymentUrl });
});

// ============================
// Process payment
// ============================
app.post('/api/pay', async (req, res) => {
  const { sessionId, cardNumber, cardName, expiry, cvv } = req.body;

  let sessionStr = await redisClient.get(sessionId);
  if (!sessionStr) return res.status(400).json({ message: 'Invalid session' });

  const session = JSON.parse(sessionStr);

  if (!cardNumber || !cardName || !expiry || !cvv) {
    return res.status(400).json({ message: 'Missing card info' });
  }

  const last4 = cardNumber.slice(-4);
  const confirmationCode = generateConfirmationCode();

  session.status = 'completed';
  session.last4 = last4;
  session.confirmationCode = confirmationCode;

  await redisClient.set(sessionId, JSON.stringify(session));

  // Respond with confirmation
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

  const sessionStr = await redisClient.get(sessionId);
  if (!sessionStr) return res.status(400).json({ message: 'Invalid session' });

  const session = JSON.parse(sessionStr);
  res.json(session);
});

// ============================
// Health check
// ============================
app.get('/health', (req, res) => {
  res.send('Backend is running');
});

// ============================
// Start HTTP server
// ============================
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`NovaPay backend running on port ${PORT}`);
});
