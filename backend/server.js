require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDb } = require('./db'); // Import the init function

const app = express();

// --- FIX 1: Trust Proxy for Rate Limiter ---
app.set('trust proxy', 1); 

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
    max: 100
    });
    app.use('/api', limiter);

    // --- ROUTES ---
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/wallet', require('./routes/wallet'));
    app.use('/api/admin', require('./routes/admin'));

    // --- START SERVER ---
    const PORT = process.env.PORT || 10000;

    // --- FIX 2: Initialize DB before starting the server ---
    initDb().then(() => {
      app.listen(PORT, () => {
          console.log(`✅ ChainRecover backend is running on port ${PORT}`);
            });
            }).catch(err => {
              console.error("❌ Failed to initialize database:", err);
                process.exit(1); // Stop the server if DB fails
                });