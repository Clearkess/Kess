const app = require('./app');
const { initDb } = require('./db');
const port = process.env.PORT || 3000;
initDb().then(() => app.listen(port, () => console.log(`Simulator API listening on ${port}`))).catch(err => { console.error(err); process.exit(1); });