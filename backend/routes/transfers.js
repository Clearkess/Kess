const express = require('express');
const crypto = require('crypto');
const { getPool, initDb } = require('../db');
const auth = require('../middleware/auth');
const { findBank, resolveAccount } = require('../services/paystack');
const r = express.Router();
const MAX_TRANSFER = Number(process.env.MAX_TRANSFER_AMOUNT || 10000000);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
const TX_COLUMNS = 'id, type, amount / 100.0 AS amount, recipient_name AS "accountName", recipient_account AS "accountNumber", bank_code AS "bankCode", description, reference, status, created_at AS "createdAt"';
r.post('/simulated', auth, async (req, res, next) => {
  try {
    await initDb(); const { bankCode, accountNumber, accountName, description } = req.body || {}; const amount = Number(req.body && req.body.amount);
    const idemKey = (req.get('Idempotency-Key') || '').trim().slice(0, 128) || null; const pool = getPool();
    if (!bankCode || !/^[0-9]{10}$/.test(accountNumber || '') || !accountName) return res.status(400).json({ success: false, error: 'Complete valid transfer details are required' });
    if (!Number.isFinite(amount) || amount < 1 || amount > MAX_TRANSFER) return res.status(400).json({ success: false, error: `Amount must be between ₦1 and ₦${MAX_TRANSFER.toLocaleString('en-NG')}` });
    if (idemKey) {
      const prior = await pool.query('SELECT ' + TX_COLUMNS + ' FROM transactions WHERE user_id=$1 AND idempotency_key=$2', [req.user.id, idemKey]);
      if (prior.rows[0]) {
        const previous = prior.rows[0];
        const sameRequest = Math.round(Number(previous.amount) * 100) === Math.round(amount * 100)
          && String(previous.accountNumber || '') === String(accountNumber)
          && String(previous.bankCode || '') === String(bankCode)
          && norm(previous.accountName) === norm(accountName);
        if (!sameRequest) return res.status(409).json({ success: false, error: 'Idempotency key was already used for a different transfer. Use a new key for a new transfer.' });
        return res.json({ success: true, simulated: true, replayed: true, transaction: previous });
      }
    }
    let bank; try { bank = await findBank(bankCode); } catch (e) { console.error('[transfers:banks]', e.message); return res.status(/not configured/i.test(e.message) ? 503 : 502).json({ success: false, error: 'Bank list unavailable, cannot validate bank code' }); }
    if (!bank) return res.status(400).json({ success: false, error: 'Unknown or inactive bank code' });
    let resolved; try { resolved = await resolveAccount(accountNumber, bankCode); } catch (e) { console.error('[transfers:resolve]', e.message); return res.status(502).json({ success: false, error: 'Account could not be verified with the bank' }); }
    const officialName = resolved.data.account_name;
    if (norm(officialName) !== norm(accountName)) return res.status(409).json({ success: false, error: 'Account name does not match the bank record', expected: officialName });
    const kobo = Math.round(amount * 100), reference = `SIM-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, client = await pool.connect();
    try {
      await client.query('BEGIN'); const w = await client.query('SELECT id, balance FROM wallets WHERE user_id=$1 FOR UPDATE', [req.user.id]);
      if (!w.rows[0]) { const e = new Error('Wallet not found'); e.status = 404; throw e; }
      if (Number(w.rows[0].balance) < kobo) { const e = new Error('Insufficient simulated balance'); e.status = 400; throw e; }
      await client.query('UPDATE wallets SET balance = balance - $1 WHERE id = $2', [kobo, w.rows[0].id]);
      const tx = await client.query("INSERT INTO transactions (user_id, type, amount, recipient_name, recipient_account, bank_code, description, reference, status, idempotency_key) VALUES ($1, 'simulated_bank_transfer', $2, $3, $4, $5, $6, $7, 'completed', $8) RETURNING id, reference, status", [req.user.id, kobo, officialName, accountNumber, bankCode, String(description || '').slice(0, 200), reference, idemKey]);
      await client.query('INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)', [req.user.id, 'Transfer successful', `Simulated transfer of ₦${amount.toLocaleString('en-NG')} to ${officialName}`]);
      await client.query('COMMIT');
      return res.json({ success: true, simulated: true, transaction: { id: tx.rows[0].id, reference, status: 'completed', amount, accountName: officialName, accountNumber, bankCode } });
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23505' && idemKey) { const prior = await pool.query('SELECT ' + TX_COLUMNS + ' FROM transactions WHERE user_id=$1 AND idempotency_key=$2', [req.user.id, idemKey]); if (prior.rows[0]) return res.json({ success: true, simulated: true, replayed: true, transaction: prior.rows[0] }); }
      return res.status(e.status || 400).json({ success: false, error: e.message });
    } finally { client.release(); }
  } catch (e) { next(e); }
});
r.get('/history', auth, async (req, res, next) => {
  try { await initDb(); const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200); const before = parseInt(req.query.before, 10) || null; const params = before ? [req.user.id, before, limit + 1] : [req.user.id, limit + 1]; const sql = before ? 'SELECT ' + TX_COLUMNS + ' FROM transactions WHERE user_id=$1 AND id<$2 ORDER BY id DESC LIMIT $3' : 'SELECT ' + TX_COLUMNS + ' FROM transactions WHERE user_id=$1 ORDER BY id DESC LIMIT $2'; const { rows } = await getPool().query(sql, params); const hasMore = rows.length > limit; return res.json({ success: true, transactions: rows.slice(0, limit), nextCursor: hasMore ? rows[limit - 1].id : null }); }
  catch (e) { next(e); }
});
module.exports = r;