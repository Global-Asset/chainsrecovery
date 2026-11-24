const express = require('express');
const db = require('../db');
const { requireUser } = require('../middleware/auth');
const { sendTransactionEmail } = require('../utils');
const router = express.Router();

router.get('/', requireUser, (req, res) => {
  const user = db.prepare('SELECT wallet_address FROM users WHERE id=?').get(req.user.uid);
  const balances = db.prepare('SELECT coin, amount FROM balances WHERE user_id=?').all(req.user.uid);
  const map = {};
  balances.forEach(b => map[b.coin] = b.amount);
  res.json({ ok: true, walletAddress: user.wallet_address, balances: map });
});

router.get('/history', requireUser, (req, res) => {
  const txs = db.prepare('SELECT coin, type, amount, note, created_at FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 50').all(req.user.uid);
  res.json({ ok: true, transactions: txs });
});

router.post('/withdraw', requireUser, (req, res) => {
  const { coin, amount, address } = req.body;
  const bal = db.prepare('SELECT amount FROM balances WHERE user_id=? AND coin=?').get(req.user.uid, coin);
  if (!bal || bal.amount < amount) return res.status(400).json({ error: 'Insufficient balance' });

  db.prepare('UPDATE balances SET amount = amount - ? WHERE user_id=? AND coin=?').run(amount, req.user.uid, coin);
  db.prepare('INSERT INTO withdrawals (user_id, coin, amount, address, created_at) VALUES (?,?,?,?,?)').run(req.user.uid, coin, amount, address, Date.now());
  db.prepare('INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)').run(req.user.uid, coin, 'out', amount, 'Withdrawal pending admin approval', Date.now());

  res.json({ ok: true });
});

// NEW: Send to another user
router.post('/send', requireUser, async (req, res) => {
  const { coin, amount, receiverAddress } = req.body;
  const senderId = req.user.uid;

  if (!coin || !amount || !receiverAddress) return res.status(400).json({ error: 'Missing fields' });
  if (amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

  const sender = db.prepare('SELECT * FROM users WHERE id=?').get(senderId);
  const receiver = db.prepare('SELECT * FROM users WHERE wallet_address=?').get(receiverAddress);

  if (!receiver) return res.status(404).json({ error: 'Receiver address not found on ChainRecover' });
  if (sender.id === receiver.id) return res.status(400).json({ error: 'You cannot send to yourself' });

  const senderBal = db.prepare('SELECT amount FROM balances WHERE user_id=? AND coin=?').get(senderId, coin);
  if (!senderBal || senderBal.amount < amount) return res.status(400).json({ error: 'Insufficient balance' });

  const now = Date.now();

  db.transaction(() => {
    db.prepare('UPDATE balances SET amount = amount - ? WHERE user_id=? AND coin=?').run(amount, senderId, coin);
    db.prepare('INSERT INTO balances (user_id, coin, amount) VALUES (?, ?, ?) ON CONFLICT(user_id, coin) DO UPDATE SET amount = amount + ?').run(receiver.id, coin, amount, amount);
    
    // Sender History
    db.prepare('INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)').run(senderId, coin, 'out', amount, `Sent to ${receiver.name}`, now);
    // Receiver History
    db.prepare('INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)').run(receiver.id, coin, 'in', amount, `Received from ${sender.name}`, now);
  })();

  // Send emails
  await sendTransactionEmail(sender.email, 'Sent', amount, coin, receiver.wallet_address);
  await sendTransactionEmail(receiver.email, 'Received', amount, coin, sender.wallet_address);

  res.json({ ok: true, message: 'Transfer successful' });
});

module.exports = router;
