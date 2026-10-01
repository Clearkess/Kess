const { Pool } = require('pg');

let pool = null;
let initialized = null;

function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000
  });
  pool.on('error', (err) => console.error('[pg] idle client error:', err.message));
  return pool;
}

function initDb() {
  if (initialized) return initialized;
  const sql = [
    "CREATE TABLE IF NOT EXISTS users (id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,phone TEXT UNIQUE,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    "CREATE TABLE IF NOT EXISTS wallets (id BIGSERIAL PRIMARY KEY,user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0))",
    "CREATE TABLE IF NOT EXISTS transactions (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,type TEXT NOT NULL,amount BIGINT NOT NULL,recipient_name TEXT,recipient_account TEXT,bank_code TEXT,description TEXT,reference TEXT UNIQUE NOT NULL,status TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    "CREATE TABLE IF NOT EXISTS notifications (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,body TEXT NOT NULL,read BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    "CREATE TABLE IF NOT EXISTS auth_attempts (key TEXT PRIMARY KEY,count INT NOT NULL DEFAULT 0,window_start TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS idempotency_key TEXT",
    "CREATE UNIQUE INDEX IF NOT EXISTS transactions_idem_uidx ON transactions (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS transactions_user_id_desc_idx ON transactions (user_id, id DESC)"
  ].join(';');
  initialized = getPool().query(sql).catch((err) => { initialized = null; throw err; });
  return initialized;
}

module.exports = { getPool, initDb };