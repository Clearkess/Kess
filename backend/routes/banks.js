const express = require('express');
const auth = require('../middleware/auth');
const { listNigeriaBanks, resolveAccount } = require('../services/paystack');
const r = express.Router();
r.get('/', auth, async (_req, res) => {
  try { const x = await listNigeriaBanks(); return res.json({ success: true, banks: (x.data || []).map((b) => ({ id: b.id, name: b.name, code: b.code, active: b.active })) }); }
  catch (e) { console.error('[banks]', e.message); return res.status(502).json({ success: false, error: 'Unable to retrieve bank list' }); }
});
r.get('/resolve', auth, async (req, res) => {
  const { accountNumber, bankCode } = req.query;
  if (!bankCode || !/^[0-9]{10}$/.test(accountNumber || '')) return res.status(400).json({ success: false, verified: false, error: 'Bank and a 10-digit account number are required' });
  try {
    const x = await resolveAccount(accountNumber, bankCode);
    return res.json({ success: true, verified: true, account: { accountNumber: x.data.account_number, accountName: x.data.account_name, bankId: x.data.bank_id, bankCode } });
  } catch (e) {
    if (/not configured/i.test(e.message)) return res.status(503).json({ success: false, verified: false, error: 'Verification provider is not configured' });
    if (/abort|fetch failed|network|ENOTFOUND|ETIMEDOUT/i.test(e.message)) return res.status(502).json({ success: false, verified: false, error: 'Verification provider is unreachable' });
    return res.status(400).json({ success: false, verified: false, error: 'Account could not be verified' });
  }
});
module.exports = r;