# Security Policy

This is a simulator. wallet balances are internal integer counts of kobo. No real money moves. The only live third-party calls are Paystack account-resolution and bank-list APIs; the transfer endpoint is never called.

## Handling secrets
- PAYSTACK_SECRET_KEY and JWT_SECRET are server-side only.
- Local secrets live in .env, which is gitignored.
- If a key is ever committed, rotate it immediately.
- Prefer a Paystack test key for deployed demos.

## Hardening
- Server-side account-name verification.
- Bank-code validation against the live bank list.
- Idempotency-Key support.
- DB-backed auth rate limiting.
- CORS allow-list.
- Parameterised SQL.
- Bounded, cursor-paginated history and notifications.

## Known limitations
JWTs last 7 days and are not revocable. fund-simulated is a test helper and must not be exposed as a real deposit flow.