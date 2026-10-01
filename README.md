# Flash Transfer Simulator

A wallet application that moves **simulated money only**. Nigerian bank account-name verification uses Paystack's Resolve Account API, but this project never calls Paystack's transfer endpoint and never moves real funds.

wallets.balance is an internal integer count of kobo. Treat every balance as fake and non-redeemable.

## Quick start

npm install
cp .env.example .env
Fill in the values and run npm start.

## API

- GET /api/health
- GET /api/version
- POST /api/auth/register
- POST /api/auth/login
- GET /api/banks
- GET /api/banks/resolve
- GET /api/wallet
- POST /api/wallet/fund-simulated
- POST /api/transfers/simulated
- GET /api/transfers/history
- GET /api/notifications
- POST /api/notifications/:id/read

## Deployment

See DEPLOY.md for Vercel + managed Postgres. This is a simulator, not a licensed financial service.

## License

MIT — see LICENSE.