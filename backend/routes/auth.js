const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool, initDb } = require('../db');
const limiter = require('../middleware/throttle');
const r = express.Router();
function token(u) { return jwt.sign({ id: String(u.id), email: u.email }, process.env.JWT_SECRET, { expiresIn: '7d' }); }
const loginLimit = limiter({ limit: 10, windowMs: 15 * 60 * 1000, key: (req) => 'login:' + String((req.body && req.body.email) || '').toLowerCase().trim() });
const registerLimit = limiter({ limit: 20, windowMs: 60 * 60 * 1000, key: (req) => 'register:' + req.ip });
r.post('/register', registerLimit, async (req, res, next) => {
  try {
    await initDb(); const { name, email, phone, password } = req.body || {};
    if (!name || !email || !password || password.length < 6) return res.status(400).json({ success: false, error: 'Name, email and password (6+ characters) are required' });
    const client = await getPool().connect();
    try {
      await client.query('BEGIN'); const hash = await bcrypt.hash(password, 10);
      const { rows } = await client.query('INSERT INTO users(name,email,phone,password_hash) VALUES($1,$2,$3,$4) RETURNING id,name,email,phone', [String(name).trim().slice(0, 120), String(email).toLowerCase().trim(), phone || null, hash]);
      await client.query('INSERT INTO wallets(user_id,balance) VALUES($1,0)', [rows[0].id]); await client.query('COMMIT');
      return res.json({ success: true, user: rows[0], token: token(rows[0]) });
    } catch (e) { await client.query('ROLLBACK'); if (e.code === '23505') return res.status(409).json({ success: false, error: 'Email or phone already exists' }); throw e; }
    finally { client.release(); }
  } catch (e) { next(e); }
});
r.post('/login', loginLimit, async (req, res, next) => {
  try {
    await initDb(); const { rows } = await getPool().query('SELECT * FROM users WHERE email=$1', [String((req.body && req.body.email) || '').toLowerCase().trim()]);
    const u = rows[0]; const ok = u && (await bcrypt.compare(String((req.body && req.body.password) || ''), u.password_hash));
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid email or password' });
    return res.json({ success: true, user: { id: u.id, name: u.name, email: u.email, phone: u.phone }, token: token(u) });
  } catch (e) { next(e); }
});
module.exports = r;