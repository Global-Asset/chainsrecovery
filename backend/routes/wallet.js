const express = require('express');
const db = require('../db');
const { requireUser } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireUser, (req, res) => {
  const balances = db.prepare('SELECT coin, amount FROM balances WHERE user_id=?').all(req.user.uid);
  const map = {};
  balances.forEach(b => map[b.coin] = b.amount);
  res.json({ ok: true, balances: map });
});

router.get('/history', requireUser, (req, res) => {
  const txs = db.prepare('SELECT coin, type, amount, note, created_at FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 50').all(req.user.uid);
  res.json({ ok: true, transactions: txs });
});

router.post('/withdraw', requireUser, (req, res) => {
  const { coin, amount, address } = req.body;
  // Check if user has enough balance
  const bal = db.prepare('SELECT amount FROM balances WHERE user_id=? AND coin=?').get(req.user.uid, coin);
  if (!bal || bal.amount < amount) return res.status(400).json({ error: 'Insufficient balance' });

  // Deduct balance immediately so they can't spend it twice
  db.prepare('UPDATE balances SET amount = amount - ? WHERE user_id=? AND coin=?').run(amount, req.user.uid, coin);
  
  // Create pending withdrawal
  db.prepare('INSERT INTO withdrawals (user_id, coin, amount, address, created_at) VALUES (?,?,?,?,?)').run(req.user.uid, coin, amount, address, Date.now());
  db.prepare('INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)').run(req.user.uid, coin, 'out', amount, 'Withdrawal pending admin approval', Date.now());

  res.json({ ok: true });
});

module.exports = router;
