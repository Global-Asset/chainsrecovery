const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireUser } = require('../middleware/auth');
const { genOtp, genWalletAddress, isValidEmail, isStrongPassword, sendOtpEmail, COINS } = require('../utils');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { name, country, phone, address, email, password, photo } = req.body || {};
    if (!name || !country || !phone || !address || !email || !password) return res.status(400).json({ error: 'All fields required' });
      if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email' });
        if (!isStrongPassword(password)) return res.status(400).json({ error: 'Password must be 8+ chars' });

          const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
            if (existing) return res.status(409).json({ error: 'Email already registered' });

              const hash = await bcrypt.hash(password, 10);
                const walletAddress = genWalletAddress();
                  const now = Date.now();

                    try {
                        db.transaction(() => {
                              const info = db.prepare(`INSERT INTO users (name,country,phone,address,email,photo,password_hash,wallet_address,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(name.trim(), country, phone, address, email.toLowerCase(), photo || null, hash, walletAddress, now, now);
                                    const userId = info.lastInsertRowid;
                                          const insertBal = db.prepare('INSERT INTO balances (user_id, coin, amount) VALUES (?, ?, 0)');
                                                for (const coin of COINS) insertBal.run(userId, coin);
                                                    })();
                                                      } catch (e) { return res.status(500).json({ error: 'Failed to create account' }); }

                                                        const code = genOtp();
                                                          db.prepare('INSERT INTO otps (email,code,purpose,expires_at,created_at) VALUES (?,?,?,?,?)').run(email.toLowerCase(), code, 'verify', Date.now() + 10 * 60 * 1000, Date.now());
                                                            await sendOtpEmail(email, code, 'verify');

                                                                // SENDING OTP TO SCREEN FOR TESTING
                                                                  res.json({ ok: true, devOtp: code });
                                                                  });

                                                                  router.post('/verify-otp', (req, res) => {
                                                                    const { email, code } = req.body || {};
                                                                      const otp = db.prepare(`SELECT * FROM otps WHERE email=? AND code=? AND purpose='verify' AND used=0 AND expires_at>? ORDER BY id DESC LIMIT 1`).get(email.toLowerCase(), code, Date.now());
                                                                        if (!otp) return res.status(400).json({ error: 'Invalid code' });

                                                                          db.transaction(() => {
                                                                              db.prepare('UPDATE otps SET used=1 WHERE id=?').run(otp.id);
                                                                                  db.prepare('UPDATE users SET verified=1, updated_at=? WHERE email=?').run(Date.now(), email.toLowerCase());
                                                                                    })();
                                                                                      res.json({ ok: true });
                                                                                      });

                                                                                      router.post('/login', async (req, res) => {
                                                                                        const { email, password } = req.body || {};
                                                                                          const user = db.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase());
                                                                                            if (!user || !await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
                                                                                              if (!user.verified) return res.status(403).json({ error: 'Email not verified' });
                                                                                                if (user.locked) return res.status(403).json({ error: 'Account locked' });

                                                                                                  const token = signToken({ uid: user.id, email: user.email, role: 'user' }, '7d');
                                                                                                    res.json({ ok: true, token });
                                                                                                    });

                                                                                                    module.exports = router;