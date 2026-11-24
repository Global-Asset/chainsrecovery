require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));

// Serve the frontend files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({ origin: true, credentials: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
    message: { error: 'Too many attempts. Try again later.' }
    });
    const casesLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: { error: 'Too many case inquiries. Please try again later.' }
    });
    app.use('/api/auth/login', limiter);
    app.use('/api/admin/login', limiter);

    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/wallet', require('./routes/wallet'));
    app.use('/api/cases', casesLimiter, require('./routes/cases'));
    app.use('/api/admin', require('./routes/admin'));

    app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

    app.get(/^(?!\/api).*/, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
      });

      const PORT = process.env.PORT || 4000;
      app.listen(PORT, () => {
        console.log('\n✅ ChainRecover running at http://localhost:' + PORT);
          console.log('⚠️  Look here for OTP codes (SMTP not configured)!\n');
          });