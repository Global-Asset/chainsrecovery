require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));

// Serve the frontend files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({ origin: true, credentials: true }));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, status: 'Live' }));

// Fallback for frontend routing
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// RENDER REQUIRES process.env.PORT
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n✅ ChainRecover running on port ${PORT}`);
});
