const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getAddress, isAddress, verifyMessage } = require('ethers');
const db = require('../db');
const { signToken, requireUser } = require('../middleware/auth');
const { genOtp, isValidEmail, isStrongPassword, sendOtpEmail, COINS } = require('../utils');

const router = express.Router();

function recoverWalletAddress(message, signature) {
  try {
    return getAddress(verifyMessage(message, signature)).toLowerCase();
  } catch {
    return null;
  }
}

router.post('/wallet-challenge', (req, res) => {
  const { email, walletAddress } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(normalizedEmail) || typeof walletAddress !== 'string' || !isAddress(walletAddress)) {
    return res.status(400).json({ error: 'A valid email and Ethereum wallet address are required' });
  }

  const address = getAddress(walletAddress);
  const nonce = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const message = [
    'ChainRecover Client Portal',
    '',
    'Sign this message to link your Ethereum wallet to your client account.',
    `Email: ${normalizedEmail}`,
    `Wallet: ${address}`,
    'Network: Ethereum Mainnet (chain ID 1)',
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(now).toISOString()}`
  ].join('\n');

  db.prepare(`INSERT INTO wallet_challenges
    (nonce, email, wallet_address, message, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    nonce, normalizedEmail, address.toLowerCase(), message, now + 5 * 60 * 1000, now
  );

  res.json({ challengeId: nonce, message });
});

router.post('/register-wallet', async (req, res) => {
  const { name, country, phone, address, email, password, walletAddress, challengeId, signature } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const profileFields = [name, country, phone, address];
  if (profileFields.some(value => value !== undefined && typeof value !== 'string') ||
      typeof password !== 'string' || typeof challengeId !== 'string' || typeof signature !== 'string') {
    return res.status(400).json({ error: 'A valid wallet signature and password are required' });
  }
  if (!isValidEmail(normalizedEmail)) return res.status(400).json({ error: 'Invalid email' });
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'Password must be 8+ chars' });
  if (typeof walletAddress !== 'string' || !isAddress(walletAddress)) {
    return res.status(400).json({ error: 'Invalid Ethereum wallet address' });
  }

  const normalizedWallet = getAddress(walletAddress).toLowerCase();
  const now = Date.now();
  const challenge = db.prepare(`SELECT * FROM wallet_challenges
    WHERE nonce = ? AND email = ? AND wallet_address = ? AND used = 0 AND expires_at > ?`)
    .get(challengeId, normalizedEmail, normalizedWallet, now);
  if (!challenge) return res.status(400).json({ error: 'Wallet verification expired. Please connect and sign again.' });

  const signer = recoverWalletAddress(challenge.message, signature);
  if (!signer) return res.status(400).json({ error: 'Wallet signature could not be verified' });
  if (signer !== normalizedWallet) return res.status(400).json({ error: 'Signature does not match the connected wallet' });

  const hash = await bcrypt.hash(password, 10);
  const code = genOtp();
  try {
    db.transaction(() => {
      const consumed = db.prepare(`UPDATE wallet_challenges SET used = 1
        WHERE nonce = ? AND used = 0 AND expires_at > ?`).run(challengeId, Date.now());
      if (consumed.changes !== 1) throw new Error('Wallet verification expired');

      const existing = db.prepare('SELECT id FROM users WHERE email = ? OR wallet_address = ?')
        .get(normalizedEmail, normalizedWallet);
      if (existing) throw new Error('Email or wallet already registered');

      const info = db.prepare(`INSERT INTO users
        (name,country,phone,address,email,password_hash,wallet_address,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        (name || '').trim(), (country || '').trim(), (phone || '').trim(), (address || '').trim(), normalizedEmail,
        hash, normalizedWallet, now, now
      );
      const insertBal = db.prepare('INSERT INTO balances (user_id, coin, amount) VALUES (?, ?, 0)');
      for (const coin of COINS) insertBal.run(info.lastInsertRowid, coin);
      db.prepare(`INSERT INTO otps (email,code,purpose,expires_at,created_at)
        VALUES (?,?,?,?,?)`).run(normalizedEmail, code, 'verify', now + 10 * 60 * 1000, now);
    })();
  } catch (error) {
    if (error.message === 'Email or wallet already registered') {
      return res.status(409).json({ error: error.message });
    }
    if (error.message === 'Wallet verification expired') {
      return res.status(400).json({ error: 'Wallet verification expired. Please connect and sign again.' });
    }
    console.error('Wallet account registration failed:', error);
    return res.status(500).json({ error: 'Failed to create account' });
  }

  let delivered;
  try {
    delivered = await sendOtpEmail(normalizedEmail, code, 'verify');
  } catch (error) {
    db.transaction(() => {
      db.prepare('DELETE FROM users WHERE email = ? AND verified = 0').run(normalizedEmail);
      db.prepare("DELETE FROM otps WHERE email = ? AND purpose = 'verify' AND code = ?").run(normalizedEmail, code);
    })();
    console.error('Wallet account verification email failed:', error);
    return res.status(503).json({ error: 'Could not send a verification email. Please try again later.' });
  }
  res.json({
    ok: true,
    walletAddress: normalizedWallet,
    ...(delivered ? {} : { devOtp: code })
  });
});

router.post('/link-wallet', requireUser, (req, res) => {
  const { walletAddress, challengeId, signature } = req.body || {};
  if (typeof walletAddress !== 'string' || !isAddress(walletAddress) ||
      typeof challengeId !== 'string' || typeof signature !== 'string') {
    return res.status(400).json({ error: 'A wallet address, challenge, and signature are required' });
  }

  const normalizedEmail = String(req.user.email || '').trim().toLowerCase();
  const normalizedWallet = getAddress(walletAddress).toLowerCase();
  const now = Date.now();
  const challenge = db.prepare(`SELECT * FROM wallet_challenges
    WHERE nonce = ? AND email = ? AND wallet_address = ? AND used = 0 AND expires_at > ?`)
    .get(challengeId, normalizedEmail, normalizedWallet, now);
  if (!challenge) return res.status(400).json({ error: 'Wallet verification expired. Please connect and sign again.' });

  const signer = recoverWalletAddress(challenge.message, signature);
  if (!signer) return res.status(400).json({ error: 'Wallet signature could not be verified' });
  if (signer !== normalizedWallet) return res.status(400).json({ error: 'Signature does not match the connected wallet' });

  try {
    db.transaction(() => {
      const consumed = db.prepare(`UPDATE wallet_challenges SET used = 1
        WHERE nonce = ? AND used = 0 AND expires_at > ?`).run(challengeId, Date.now());
      if (consumed.changes !== 1) throw new Error('Wallet verification expired');

      const user = db.prepare('SELECT verified, locked FROM users WHERE id = ?').get(req.user.uid);
      if (!user || !user.verified || user.locked) throw new Error('Client account is not available');
      db.prepare('UPDATE users SET wallet_address = ?, updated_at = ? WHERE id = ?')
        .run(normalizedWallet, Date.now(), req.user.uid);
    })();
  } catch (error) {
    if (error.message === 'Wallet verification expired') {
      return res.status(400).json({ error: 'Wallet verification expired. Please connect and sign again.' });
    }
    if (error.message === 'Client account is not available') {
      return res.status(403).json({ error: error.message });
    }
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'This wallet is already linked to another account' });
    }
    console.error('Wallet account linking failed:', error);
    return res.status(500).json({ error: 'Failed to link wallet' });
  }

  res.json({ ok: true, walletAddress: normalizedWallet });
});

router.post('/register', (req, res) => {
  res.status(410).json({ error: 'Use the client portal to connect and verify your own wallet.' });
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