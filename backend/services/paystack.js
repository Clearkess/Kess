const BASE = 'https://api.paystack.co';
const BANK_TTL_MS = 5 * 60 * 1000;
let bankCache = { at: 0, data: null };
async function request(path) {
  if (!process.env.PAYSTACK_SECRET_KEY) throw new Error('PAYSTACK_SECRET_KEY is not configured');
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 10000);
  try { const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' }, signal: ctrl.signal }); const d = await r.json().catch(() => ({})); if (!r.ok || !d.status) throw new Error(d.message || `Paystack request failed (HTTP ${r.status})`); return d; } finally { clearTimeout(timer); }
}
async function listNigeriaBanks(force) { if (!force && bankCache.data && Date.now() - bankCache.at < BANK_TTL_MS) return bankCache.data; const d = await request('/bank?country=nigeria&perPage=100'); bankCache = { at: Date.now(), data: d }; return d; }
async function findBank(code) { const d = await listNigeriaBanks(); const list = (d.data || []).filter((b) => b.active !== false); return list.find((b) => String(b.code) === String(code)) || null; }
const resolveAccount = (accountNumber, bankCode) => request('/bank/resolve?account_number=' + encodeURIComponent(accountNumber) + '&bank_code=' + encodeURIComponent(bankCode));
module.exports = { request, listNigeriaBanks, findBank, resolveAccount, BASE };