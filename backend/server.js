require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDb } = require('./db');

const app = express();

// 1. Trust proxy for Render rate limiting
app.set('trust proxy', 1);

// 2. Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

// Serve static files (admin.html, wallet.html, index.html)
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
    max: 100
    });
    app.use('/api', limiter);

    // API Routes
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/wallet', require('./routes/wallet'));
    app.use('/api/admin', require('./routes/admin'));

    // Dedicated Admin Route (Fixed missing brackets)
    app.get('/admin', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'admin.html'));
      });

      // Health Check Route (Fixes the Render deployment timeout)
      app.get('/api/health', (req, res) => {
        res.status(200).json({ status: 'ok', message: 'Backend is healthy' });
        });

        // 3. Start Server ONLY after DB is ready
        const PORT = process.env.PORT || 10000;

        initDb().then(() => {
          app.listen(PORT, '0.0.0.0', () => {
              // Fixed missing backtick and parenthesis here
                  console.log(`✅ ChainRecover backend is running on port ${PORT}`);
                    });
                    }).catch(err => {
                      console.error("❌ Failed to initialize database:", err);
                        process.exit(1);
                        });