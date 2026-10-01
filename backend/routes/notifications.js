const express = require('express');
const { getPool, initDb } = require('../db');
const auth = require('../middleware/auth');
const r = express.Router();
r.get('/', auth, async (req, res, next) => {
  try { await initDb(); const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200); const { rows } = await getPool().query('SELECT id, title, body, read, created_at AS "createdAt" FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2', [req.user.id, limit]); return res.json({ success: true, notifications: rows }); }
  catch (e) { next(e); }
});
r.post('/:id/read', auth, async (req, res, next) => {
  try { await initDb(); if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ success: false, error: 'Invalid notification id' }); await getPool().query('UPDATE notifications SET read=TRUE WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); return res.json({ success: true }); }
  catch (e) { next(e); }
});
module.exports = r;