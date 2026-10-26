const DB_URL = process.env.TEST_DATABASE_URL;
if (!DB_URL) {
  console.error('REFUSING TO RUN: set TEST_DATABASE_URL to a dedicated disposable PostgreSQL test database.');
  process.exit(3);
}
let dbName = '';
try { dbName = new URL(DB_URL).pathname.replace(/^\//, ''); } catch (_) {
  console.error('TEST_DATABASE_URL is not a valid URL.');
  process.exit(3);
}
if (!/test|ci/i.test(dbName)) {
  console.error('REFUSING TO RUN: database name must contain "test" or "ci".');
  process.exit(3);
}
if (process.env.ALLOW_DESTRUCTIVE_TEST !== '1') {
  console.error('REFUSING TO RUN: this test drops database tables. Set ALLOW_DESTRUCTIVE_TEST=1 only for a disposable test database.');
  process.exit(3);
}
process.env.DATABASE_URL = DB_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'verification_secret_key_only';
process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_test_stub';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.FRONTEND_URL = 'http://localhost:5500';
process.env.SIM_DAILY_FUNDING_CAP = '1000';
const realFetch = global.fetch;
const paystackCalls = [];
let resolveMode = 'ok';
global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('api.paystack.co')) {
    paystackCalls.push(u);
    if (u.includes('/bank/resolve')) {
      if (resolveMode === 'fail') return { ok: false, status: 422, json: async () => ({ status: false, message: 'Could not resolve account name' }) };
      return { ok: true, status: 200, json: async () => ({ status: true, data: { account_number: '0123456789', account_name: 'ADEBAYO O. TESTUSER', bank_id: 9 } }) };
    }
    return { ok: true, status: 200, json: async () => ({ status: true, data: [{ id: 9, name: 'GTBank', code: '058', active: true }, { id: 1, name: 'Access Bank', code: '044', active: true }, { id: 2, name: 'Retired Bank', code: '777', active: false }] }) };
  }
  return realFetch(url, opts);
};
const R = [];
const log = (name, ok, detail) => R.push(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
(async () => {
  const savedUrl = process.env.DATABASE_URL; delete process.env.DATABASE_URL;
  let importCrashed = null; try { require('./backend/db'); } catch (e) { importCrashed = e.message; }
  log('db.js imports WITHOUT DATABASE_URL', importCrashed === null, importCrashed || 'import ok');
  const { initDb, getPool } = require('./backend/db');
  try { await initDb(); log('initDb rejects when unconfigured', false, 'unexpected success'); } catch (e) { log('initDb rejects when unconfigured', /not configured/i.test(e.message), e.message); }
  process.env.DATABASE_URL = savedUrl;
  await getPool().query('DROP TABLE IF EXISTS auth_attempts, notifications, transactions, wallets, users CASCADE');
  await initDb();
  log('schema created from cold start', true, 'tables and indexes ready');
  const cols = await getPool().query("SELECT column_name FROM information_schema.columns WHERE table_name='transactions' AND column_name='idempotency_key'");
  log('idempotency_key column added', cols.rows.length === 1, 'schema check');
  const app = require('./backend/app');
  const server = app.listen(4501);
  await new Promise((r) => setTimeout(r, 400));
  const B = 'http://127.0.0.1:4501';
  const req = async (p, o = {}) => { const r = await realFetch(B + p, { ...o, headers: { 'Content-Type': 'application/json', ...(o.headers || {}) } }); let d = {}; try { d = await r.json(); } catch (_) {} return { s: r.status, d, h: r.headers }; };
  let x = await req('/api/health'); log('health', x.s === 200 && x.d.database === 'connected', JSON.stringify(x.d.config));
  x = await req('/api/version'); log('version endpoint', x.s === 200 && x.d.version === '2.1.0', x.d.version);
  x = await req('/api/nope'); log('unknown /api path -> JSON 404', x.s === 404 && x.d.error === 'Not found', `HTTP ${x.s}`);
  x = await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Ada Test', email: 'Ada@Example.com ', password: 'secret123' }) });
  const H = { Authorization: 'Bearer ' + x.d.token }; log('register', x.s === 200, x.d.user && x.d.user.email);
  x = await req('/api/banks', { headers: H }); log('bank list with auth', x.s === 200 && x.d.banks.length === 3, x.d.banks.map((b) => b.code).join(','));
  x = await req('/api/wallet/fund-simulated', { method: 'POST', headers: H, body: JSON.stringify({ amount: 800 }) }); log('fund simulated', x.s === 200 && x.d.balance === 800, `balance=${x.d.balance}`);
  const base = { bankCode: '058', accountNumber: '0123456789', amount: 100, accountName: 'ADEBAYO O. TESTUSER' };
  x = await req('/api/transfers/simulated', { method: 'POST', headers: H, body: JSON.stringify({ ...base, accountName: 'FRAUDSTER ENTERPRISES LTD' }) }); log('spoofed account name rejected', x.s === 409, `HTTP ${x.s}`);
  x = await req('/api/transfers/simulated', { method: 'POST', headers: H, body: JSON.stringify(base) }); log('simulated transfer succeeds', x.s === 200, `HTTP ${x.s}`);
  const bal = await req('/api/wallet', { headers: H }); log('balance debited', bal.d.wallet.balance === 700, `balance=${bal.d.wallet.balance}`);
  const key = 'idem-' + Date.now(); const body = JSON.stringify({ ...base, amount: 50 });
  const c1 = await req('/api/transfers/simulated', { method: 'POST', headers: { ...H, 'Idempotency-Key': key }, body });
  const c2 = await req('/api/transfers/simulated', { method: 'POST', headers: { ...H, 'Idempotency-Key': key }, body });
  log('idempotency replay', c1.d.transaction.reference === c2.d.transaction.reference && c2.d.replayed === true, 'same reference');
  x = await req('/api/notifications', { headers: H }); log('notifications', x.s === 200 && Array.isArray(x.d.notifications), `count=${x.d.notifications?.length}`);
  const entry = require('./api/index.js'); log('api/index.js exports Express app', typeof entry === 'function', typeof entry);
  console.log(R.join('\n')); const fails = R.filter((r) => r.startsWith('FAIL')); console.log(`PASS ${R.length - fails.length} FAIL ${fails.length}`); server.close(); await getPool().end(); process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });