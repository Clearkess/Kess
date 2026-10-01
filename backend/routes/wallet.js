const express = require('express');
const crypto = require('crypto');
const { getPool, initDb } = require('../db');
const auth = require('../middleware/auth');
const r = express.Router();
const MAX_SINGLE_FUNDING = Number(process.env.MAX_SINGLE_FUNDING || 10000000);
const DAILY_FUNDING_CAP = Number(process.env.SIM_DAILY_FUNDING_CAP || 1000000);
r.get('/', auth, async (req, res, next) => { try { await initDb(); const { rows } = await getPool().query('SELECT balance FROM wallets WHERE user_id=$1', [req.user.id]); return res.json({ success: true, wallet: rows[0] ? { balance: Number(rows[0].balance) / 100 } : null }); } catch (e) { next(e); } });
r.post('/fund-simulated', auth, async (req, res, next) => {
  try {
    await initDb(); const amount = Number(req.body && req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_SINGLE_FUNDING) return res.status(400).json({ success: false, error: `Funding amount must be between ₦1 and ₦${MAX_SINGLE_FUNDING.toLocaleString('en-NG')}` });
    const kobo = Math.round(amount * 100), client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const w = await client.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [req.user.id]);
      if (!w.rows[0]) { const e = new Error('Wallet not found'); e.status = 404; throw e; }
      const used = await client.query("SELECT COALESCE(SUM(amount), 0)::bigint AS total FROM transactions WHERE user_id = $1 AND type = 'simulated_funding' AND created_at > NOW() - INTERVAL '24 hours'", [req.user.id]);
      if (Number(used.rows[0].total) + kobo > DAILY_FUNDING_CAP * 100) { const e = new Error(`Daily simulated funding cap of ₦${DAILY_FUNDING_CAP.toLocaleString('en-NG')} reached`); e.status = 429; throw e; }
      const newBalance = Number(w.rows[0].balance) + kobo;
      await client.query('UPDATE wallets SET balance=$1 WHERE user_id=$2', [newBalance, req.user.id]);
      const reference = `SIM-FUND-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      await client.query("INSERT INTO transactions (user_id,type,amount,description,reference,status) VALUES ($1,'simulated_funding',$2,'Test funding',$3,'completed')", [req.user.id, kobo, reference]);
      await client.query('COMMIT');
      return res.json({ success: true, simulated: true, balance: newBalance / 100, reference, dailyCap: DAILY_FUNDING_CAP });
    } catch (e) { await client.query('ROLLBACK'); return res.status(e.status || 400).json({ success: false, error: e.message }); } finally { client.release(); }
  } catch (e) { next(e); }
});
module.exports = r;