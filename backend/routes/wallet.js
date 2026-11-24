const express = require('express');
const db = require('../db');
const { requireUser } = require('../middleware/auth');
const router = express.Router();

// GET WALLET DASHBOARD
router.get('/', requireUser, async (req, res) => {
  try {
    const userRes = await db.execute({ sql: 'SELECT wallet_address FROM users WHERE id=?', args: [req.user.uid] });
    const balsRes = await db.execute({ sql: 'SELECT coin, amount FROM balances WHERE user_id=?', args: [req.user.uid] });

    const balances = {};
    balsRes.rows.forEach(b => balances[b.coin] = b.amount);

    res.json({ ok: true, walletAddress: userRes.rows[0].wallet_address, balances });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load wallet' });
  }
});

// GET TRANSACTION HISTORY
router.get('/history', requireUser, async (req, res) => {
  try {
    const txRes = await db.execute({
      sql: 'SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC',
      args: [req.user.uid]
    });
    res.json({ ok: true, transactions: txRes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// INTERNAL SEND FUNDS
router.post('/send', requireUser, async (req, res) => {
  const { coin, amount, receiverAddress } = req.body;
  const senderId = req.user.uid;

  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  try {
    const receiverRes = await db.execute({ sql: 'SELECT id FROM users WHERE wallet_address=?', args: [receiverAddress] });
    if (receiverRes.rows.length === 0) return res.status(404).json({ error: 'Receiver wallet not found' });
    const receiverId = receiverRes.rows[0].id;

    if (senderId === receiverId) return res.status(400).json({ error: 'Cannot send to yourself' });

    const senderBalRes = await db.execute({ sql: 'SELECT amount FROM balances WHERE user_id=? AND coin=?', args: [senderId, coin] });
    const senderBal = senderBalRes.rows.length > 0 ? senderBalRes.rows[0].amount : 0;

    if (senderBal < amount) return res.status(400).json({ error: 'Insufficient balance' });

    await db.batch([
      { sql: 'UPDATE balances SET amount = amount - ? WHERE user_id=? AND coin=?', args: [amount, senderId, coin] },
      { sql: 'UPDATE balances SET amount = amount + ? WHERE user_id=? AND coin=?', args: [amount, receiverId, coin] },
      { sql: `INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)`, args: [senderId, coin, 'out', amount, `Sent to ${receiverAddress}`, Date.now()] },
      { sql: `INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)`, args: [receiverId, coin, 'in', amount, `Received from ${req.user.email}`, Date.now()] }
    ]);

    res.json({ ok: true, message: 'Funds sent successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Send failed' });
  }
});

// REQUEST WITHDRAWAL
router.post('/withdraw', requireUser, async (req, res) => {
  const { coin, amount, address } = req.body;
  const userId = req.user.uid;

  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  try {
    const balRes = await db.execute({ sql: 'SELECT amount FROM balances WHERE user_id=? AND coin=?', args: [userId, coin] });
    const bal = balRes.rows.length > 0 ? balRes.rows[0].amount : 0;

    if (bal < amount) return res.status(400).json({ error: 'Insufficient balance' });

    await db.batch([
      { sql: 'UPDATE balances SET amount = amount - ? WHERE user_id=? AND coin=?', args: [amount, userId, coin] },
      { sql: 'INSERT INTO withdrawals (user_id, coin, amount, address, status, created_at) VALUES (?,?,?,?,?,?)', args: [userId, coin, amount, address, 'Pending', Date.now()] },
      { sql: `INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)`, args: [userId, coin, 'out', amount, `Withdrawal Requested (Pending)`, Date.now()] }
    ]);

    res.json({ ok: true, message: 'Withdrawal request submitted' });
  } catch (err) {
    res.status(500).json({ error: 'Withdrawal failed' });
  }
});

module.exports = router;
