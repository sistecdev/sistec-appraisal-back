const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const app = express();

// Render (and most hosts) sit behind one proxy; this gives the real client IP
// to the sign-in limiter.
app.set('trust proxy', 1);

const allowed = String(process.env.CLIENT_URL || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // Browsers on localhost during development; no Origin = not a browser.
    if (!origin || /^http:\/\/localhost:\d+$/.test(origin) || allowed.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  exposedHeaders: ['Content-Disposition'],
}));
app.use(helmet());
app.use(express.json({ limit: '2mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('tiny'));

// For Render's health check, and to wake the free instance.
app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/appraisal', require('./routes/appraisalRoutes'));

app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') return res.status(403).json({ success: false, message: err.message });
  if (err.name === 'CastError') return res.status(404).json({ success: false, message: 'Not found' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: 'The file is too big (2 MB at most)' });
  console.error(err);
  return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
});

module.exports = app;
