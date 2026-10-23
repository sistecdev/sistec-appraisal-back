require('dotenv').config({ quiet: true });
const { connectDB } = require('./config/db');
const app = require('./app');

const required = ['MONGO_URI', 'JWT_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing settings: ${missing.join(', ')} — see .env.example`);
  process.exit(1);
}

const PORT = Number(process.env.PORT || 5100);

connectDB()
  .then(async () => {
    const { migrate } = require('./services/migrate');
    const moved = await migrate();
    Object.entries(moved).filter(([, v]) => v).forEach(([k, v]) => console.log(`Brought up to date — ${k}: ${v}`));
    app.listen(PORT, () => console.log(`Appraisal API on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  });
