# Deploying to Vercel

Architecture: frontend/ is served statically, and every /api/* request is routed to a single Express app exported from api/index.js as a Vercel Node function. State lives in PostgreSQL — Vercel's filesystem is ephemeral, so local SQLite is not usable.

## Environment variables
Set DATABASE_URL, JWT_SECRET, PAYSTACK_SECRET_KEY, FRONTEND_URL, and NODE_ENV in Vercel Production and Preview. Optionally set SIM_DAILY_FUNDING_CAP.

## Deploy
`npx vercel@latest --prod`

Tables are created automatically on the first request (initDb is idempotent).

## Verify
`curl -s https://<your-deployment>/api/health | jq`

This is a simulator. Balances are internal integers in kobo; no Paystack transfer endpoint is ever called. fund-simulated is a test helper, not a deposit method.