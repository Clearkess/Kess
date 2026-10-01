require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const allowlist = (process.env.FRONTEND_URL || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin(origin, cb) { if (!origin) return cb(null, true); if (!allowlist.length) return cb(null, false); return cb(null, allowlist.includes(origin)); }, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'] }));
app.use(express.json({ limit: '100kb' }));
app.get('/api/health', async (_req, res) => {
  const config = { database_url: Boolean(process.env.DATABASE_URL), jwt_secret: Boolean(process.env.JWT_SECRET), paystack_key: Boolean(process.env.PAYSTACK_SECRET_KEY) };
  try { await initDb(); return res.json({ success: true, simulated: true, database: 'connected', config }); }
  catch (e) { console.error('[health]', e.message); return res.status(503).json({ success: false, simulated: true, database: 'unavailable', config, error: 'Database unavailable' }); }
});
app.get('/api/version', (_req, res) => res.json({ success: true, name: 'opay-flash-simulator', version: '2.1.0', simulated: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/banks', require('./routes/banks'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/transfers', require('./routes/transfers'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api', (_req, res) => res.status(404).json({ success: false, error: 'Not found' }));
app.use((err, _req, res, _next) => { console.error('[error]', err); if (res.headersSent) return; res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Internal server error' }); });
module.exports = app;