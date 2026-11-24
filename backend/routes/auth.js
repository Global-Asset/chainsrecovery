const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken } = require('../middleware/auth');
const { genOtp, genWalletAddress, isValidEmail, isStrongPassword, sendOtpEmail, COINS } = require('../utils');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { name, country, phone, address, email, password, photo } = req.body || {};
  if (!name || !country || !phone || !address || !email || !password) return res.status(400).json({ error: 'All fields required' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email' });
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'Password must be 8+ chars' });

  try {
    const existingRes = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email.toLowerCase()]
    });
    if (existingRes.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const walletAddress = genWalletAddress();
    const now = Date.now();

    // Insert User
    const insertRes = await db.execute({
      sql: `INSERT INTO users (name,country,phone,address,email,photo,password_hash,wallet_address,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: [name.trim(), country, phone, address, email.toLowerCase(), photo || null, hash, walletAddress, now, now]
    });
    
    // Get the new user's ID (Turso returns lastInsertRowid)
    const userId = Number(insertRes.lastInsertRowid);

    // Insert initial balances for all coins
    if (COINS.length > 0) {
      const balanceStmts = COINS.map(coin => ({
        sql: 'INSERT INTO balances (user_id, coin, amount) VALUES (?, ?, 0)',
        args: [userId, coin]
      }));
      await db.batch(balanceStmts);
    }

    // Generate and save OTP
    const code = genOtp();
    await db.execute({
      sql: 'INSERT INTO otps (email,code,purpose,expires_at,created_at) VALUES (?,?,?,?,?)',
      args: [email.toLowerCase(), code, 'verify', Date.now() + 10 * 60 * 1000, Date.now()]
    });

    // Try sending email (won't crash if it fails)
    try { await sendOtpEmail(email, code, 'verify'); } catch (e) { console.log("Email failed:", e.message); }
    
    res.json({ ok: true, devOtp: code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

router.post('/verify-otp', async (req, res) => {
  const { email, code } = req.body || {};
  try {
    const otpRes = await db.execute({
      sql: `SELECT * FROM otps WHERE email=? AND code=? AND purpose='verify' AND used=0 AND expires_at>? ORDER BY id DESC LIMIT 1`,
      args: [email.toLowerCase(), code, Date.now()]
    });
    
    if (otpRes.rows.length === 0) return res.status(400).json({ error: 'Invalid or expired code' });
    const otp = otpRes.rows[0];

    await db.batch([
      { sql: 'UPDATE otps SET used=1 WHERE id=?', args: [otp.id] },
      { sql: 'UPDATE users SET verified=1, updated_at=? WHERE email=?', args: [Date.now(), email.toLowerCase()] }
    ]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  try {
    const userRes = await db.execute({
      sql: 'SELECT * FROM users WHERE email=?',
      args: [email.toLowerCase()]
    });
    
    if (userRes.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = userRes.rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.verified) return res.status(403).json({ error: 'Email not verified' });
    if (user.locked) return res.status(403).json({ error: 'Account locked' });

    const token = signToken({ uid: user.id, email: user.email, role: 'user' }, '7d');
    res.json({ ok: true, token });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
