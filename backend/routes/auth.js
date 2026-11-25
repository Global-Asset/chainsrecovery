const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db'); // ✅ CRITICAL FIX: The curly braces
const { signToken } = require('../middleware/auth');
const { genOtp, genWalletAddress, isValidEmail, isStrongPassword, sendOtpEmail, COINS } = require('../utils');

const router = express.Router();

// REGISTER
router.post('/register', async (req, res) => {
  const { name, country, phone, address, email, password, photo } = req.body || {};
  if (!name || !country || !phone || !address || !email || !password) return res.status(400).json({ error: 'All fields required' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const existingRes = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email.toLowerCase()] });
    if (existingRes.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const walletAddress = genWalletAddress();
    const now = Date.now();

    const insertRes = await db.execute({
      sql: `INSERT INTO users (name, country, phone, address, email, photo, password_hash, wallet_address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [name.trim(), country, phone, address, email.toLowerCase(), photo || null, hash, walletAddress, now, now]
    });
        
    const userId = Number(insertRes.lastInsertRowid);
    if (COINS.length > 0) {
      const balanceStmts = COINS.map(coin => ({ sql: 'INSERT INTO balances (user_id, coin, amount) VALUES (?, ?, 0)', args: [userId, coin] }));
      await db.batch(balanceStmts);
    }

    const code = genOtp();
    await db.execute({
      sql: 'INSERT INTO otps (email, code, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [email.toLowerCase(), code, 'verify', Date.now() + 10 * 60 * 1000, Date.now()]
    });

    try { await sendOtpEmail(email, code, 'verify'); } catch (e) { console.log("Email error:", e.message); }
    res.json({ ok: true, devOtp: code });
  } catch (err) {
    console.error("Registration Error:", err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const userRes = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email.toLowerCase()] });
    if (userRes.rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });

    const user = userRes.rows[0];
    if (user.locked === 1) return res.status(403).json({ error: `Account locked: ${user.lock_reason}` });

    // 🚨 TEMPORARILY COMMENTED OUT SO YOU CAN LOG IN WITHOUT OTP
    // if (user.verified === 0) {
    //    return res.status(403).json({ error: 'Please verify your email first.' });
    // }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken({ id: user.id, email: user.email });
    console.log("🎉 Login successful for:", user.email);

    res.json({ ok: true, token, user: { id: user.id, name: user.name, email: user.email, wallet_address: user.wallet_address } });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: 'Login failed due to server error' });
  }
});

module.exports = router;
