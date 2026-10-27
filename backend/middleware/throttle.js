const { getPool, initDb } = require('../db');

// DB-backed fixed-window limiter. Serverless instances do not share memory,
// so an in-process counter would be trivially bypassed by concurrency.
function limiter({ limit, windowMs, key }) {
  return async (req, res, next) => {
    try {
      await initDb();
      const id = key(req);
      if (!id) return next();
      const pool = getPool();

      if (Math.random() < 0.02) {
        pool.query(`DELETE FROM auth_attempts WHERE window_start < NOW() - INTERVAL '1 day'`).catch(() => {});
      }

      const row = (
        await pool.query(
          `INSERT INTO auth_attempts (key, count, window_start) VALUES ($1, 1, NOW())
           ON CONFLICT (key) DO UPDATE SET
             count = CASE WHEN auth_attempts.window_start < NOW() - ($2::int * INTERVAL '1 millisecond')
                          THEN 1 ELSE auth_attempts.count + 1 END,
             window_start = CASE WHEN auth_attempts.window_start < NOW() - ($2::int * INTERVAL '1 millisecond')
                          THEN NOW() ELSE auth_attempts.window_start END
           RETURNING count, window_start`,
          [id, windowMs]
        )
      ).rows[0];

      if (Number(row.count) > limit) {
        const elapsed = Date.now() - new Date(row.window_start).getTime();
        res.set('Retry-After', String(Math.max(Math.ceil((windowMs - elapsed) / 1000), 1)));
        return res.status(429).json({ success: false, error: 'Too many attempts. Please try again later.' });
      }
      return next();
    } catch (e) {
      // Fail closed: if the shared limiter cannot be checked, do not allow
      // login or registration attempts to bypass the configured rate limit.
      console.error('[throttle] rate-limit storage unavailable:', e.message);
      return res.status(503).json({ success: false, error: 'Authentication is temporarily unavailable. Please try again shortly.' });
    }
  };
}

module.exports = limiter;