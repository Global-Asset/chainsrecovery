const express = require('express');
const db = require('../db');
const { signToken, requireAdmin } = require('../middleware/auth');
const { COINS } = require('../utils');
const router = express.Router();

router.post('/login', (req, res) => {
  if (req.body.password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid password' });
  res.json({ ok: true, token: signToken({ role: 'admin' }, '12h') });
});

router.get('/users', requireAdmin, async (req, res) => {
  try {
    const usersRes = await db.execute('SELECT * FROM users ORDER BY created_at DESC');
    const balancesRes = await db.execute('SELECT user_id, coin, amount FROM balances');
    
    const users = usersRes.rows;
    const allBalances = balancesRes.rows;

    const formattedUsers = users.map(u => {
      const bals = {}; 
      allBalances.filter(b => b.user_id === u.id).forEach(b => bals[b.coin] = b.amount);
      return { ...u, balances: bals };
    });

    res.json({ ok: true, users: formattedUsers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load users' });
  }
});

router.patch('/users/:id/lock', requireAdmin, async (req, res) => {
  try {
    await db.execute({
      sql: 'UPDATE users SET locked=?, lock_reason=? WHERE id=?',
      args: [req.body.locked ? 1 : 0, req.body.reason || '', req.params.id]
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

router.patch('/users/:id/balances', requireAdmin, async (req, res) => {
  const { balances, note } = req.body;
  const userId = req.params.id;

  try {
    const userRes = await db.execute({ sql: 'SELECT id FROM users WHERE id=?', args: [userId] });
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const batchStmts = [];

    for (const [coin, newAmount] of Object.entries(balances)) {
      if (!COINS.includes(coin)) continue;
      
      const currentRes = await db.execute({
        sql: 'SELECT amount FROM balances WHERE user_id=? AND coin=?',
        args: [userId, coin]
      });
      const oldAmount = currentRes.rows.length > 0 ? currentRes.rows[0].amount : 0;
      
      if (Number(newAmount) !== oldAmount) {
        batchStmts.push({
          sql: 'INSERT OR REPLACE INTO balances (user_id, coin, amount) VALUES (?,?,?)',
          args: [userId, coin, Number(newAmount)]
        });
        
        const type = Number(newAmount) > oldAmount ? 'in' : 'out';
        const diff = Math.abs(Number(newAmount) - oldAmount);
        
        batchStmts.push({
          sql: `INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)`,
          args: [userId, coin, type, diff, note || 'Admin Adjustment', Date.now()]
        });
      }
    }

    if (batchStmts.length > 0) await db.batch(batchStmts);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update balances' });
  }
});

router.get('/withdrawals', requireAdmin, async (req, res) => {
  try {
    const rows = await db.execute("SELECT * FROM withdrawals ORDER BY id DESC LIMIT 50");
    res.json({ ok: true, withdrawals: rows.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load withdrawals' });
  }
});

router.patch('/withdrawals/:id', requireAdmin, async (req, res) => {
  const { action } = req.body;
  try {
    const wRes = await db.execute({
      sql: "SELECT * FROM withdrawals WHERE id=? AND status='Pending'",
      args: [req.params.id]
    });
    if (wRes.rows.length === 0) return res.status(404).json({ error: 'Withdrawal not found or processed' });
    
    const w = wRes.rows[0];

    if (action === 'approve') {
      await db.batch([
        { sql: "UPDATE withdrawals SET status='Approved' WHERE id=?", args: [w.id] },
        { sql: `INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)`, args: [w.user_id, w.coin, 'out', w.amount, 'Withdrawal Approved', Date.now()] }
      ]);
    } else if (action === 'decline') {
      await db.batch([
        { sql: "UPDATE withdrawals SET status='Declined' WHERE id=?", args: [w.id] },
        { sql: 'UPDATE balances SET amount = amount + ? WHERE user_id=? AND coin=?', args: [w.amount, w.user_id, w.coin] },
        { sql: `INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)`, args: [w.user_id, w.coin, 'in', w.amount, 'Withdrawal Declined - Refunded', Date.now()] }
      ]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  const userId = req.params.id;
  try {
    const userRes = await db.execute({ sql: 'SELECT email FROM users WHERE id = ?', args: [userId] });
    const email = userRes.rows.length > 0 ? userRes.rows[0].email : null;

    const batchStmts = [
      { sql: 'DELETE FROM balances WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM transactions WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM withdrawals WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM users WHERE id = ?', args: [userId] }
    ];
    if (email) batchStmts.push({ sql: 'DELETE FROM otps WHERE email = ?', args: [email] });

    await db.batch(batchStmts);
    res.json({ ok: true, message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
