const express = require('express');
const db = require('../db');
const { signToken, requireAdmin } = require('../middleware/auth');
const { COINS } = require('../utils');
const router = express.Router();

// Admin Login
router.post('/login', (req, res) => {
  if (req.body.password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid password' });
  res.json({ ok: true, token: signToken({ role: 'admin' }, '12h') });
});

// Get All Users with Balances
router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  const allBalances = db.prepare('SELECT user_id, coin, amount FROM balances').all();
  
  res.json({ ok: true, users: users.map(u => {
    const bals = {}; 
    allBalances.filter(b => b.user_id === u.id).forEach(b => bals[b.coin] = b.amount);
    return { ...u, balances: bals };
  })});
});

// Suspend / Ban / Unban User
router.patch('/users/:id/lock', requireAdmin, (req, res) => {
  db.prepare('UPDATE users SET locked=?, lock_reason=? WHERE id=?').run(req.body.locked ? 1 : 0, req.body.reason || '', req.params.id);
  res.json({ ok: true });
});

// Edit User Wallet Balances (Write/Edit)
router.patch('/users/:id/balances', requireAdmin, (req, res) => {
  const { balances, note } = req.body;
  const userId = req.params.id;

  // Check if user exists
  const user = db.prepare('SELECT id FROM users WHERE id=?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.transaction(() => {
    for (const [coin, newAmount] of Object.entries(balances)) {
      if (!COINS.includes(coin)) continue;
      
      const current = db.prepare('SELECT amount FROM balances WHERE user_id=? AND coin=?').get(userId, coin);
      const oldAmount = current ? current.amount : 0;
      
      if (Number(newAmount) !== oldAmount) {
        // Update balance
        db.prepare('INSERT OR REPLACE INTO balances (user_id, coin, amount) VALUES (?,?,?)').run(userId, coin, Number(newAmount));
        
        // Log the transaction for the user to see
        const type = Number(newAmount) > oldAmount ? 'in' : 'out';
        const diff = Math.abs(Number(newAmount) - oldAmount);
        db.prepare(`INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)`).run(
          userId, coin, type, diff, note || 'Admin Adjustment', Date.now()
        );
      }
    }
  })();
  res.json({ ok: true });
});

// Get Withdrawals
router.get('/withdrawals', requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM withdrawals ORDER BY id DESC LIMIT 50").all();
  res.json({ ok: true, withdrawals: rows });
});

// Approve or Decline Withdrawal
router.patch('/withdrawals/:id', requireAdmin, (req, res) => {
  const { action } = req.body;
  const w = db.prepare("SELECT * FROM withdrawals WHERE id=? AND status='Pending'").get(req.params.id);
  
  if (!w) return res.status(404).json({ error: 'Withdrawal not found or already processed' });

  db.transaction(() => {
    if (action === 'approve') {
      db.prepare("UPDATE withdrawals SET status='Approved' WHERE id=?").run(w.id);
      db.prepare(`INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)`).run(w.user_id, w.coin, 'out', w.amount, 'Withdrawal Approved by Admin', Date.now());
    } else if (action === 'decline') {
      db.prepare("UPDATE withdrawals SET status='Declined' WHERE id=?").run(w.id);
      // Refund the balance
      db.prepare('UPDATE balances SET amount = amount + ? WHERE user_id=? AND coin=?').run(w.amount, w.user_id, w.coin);
      db.prepare(`INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)`).run(w.user_id, w.coin, 'in', w.amount, 'Withdrawal Declined - Refunded', Date.now());
    }
  })();
  
  res.json({ ok: true });
});

// Delete User Account entirely (NEW)
router.delete('/users/:id', requireAdmin, (req, res) => {
  const userId = req.params.id;
  
  try {
    db.transaction(() => {
      // Delete all associated data first to prevent foreign key errors
      db.prepare('DELETE FROM balances WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM transactions WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM withdrawals WHERE user_id = ?').run(userId);
      
      // Get user email to delete OTPs
      const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
      if (user) {
        db.prepare('DELETE FROM otps WHERE email = ?').run(user.email);
      }
      
      // Finally, delete the user
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    })();
    
    res.json({ ok: true, message: 'User account deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user. Database error.' });
  }
});

module.exports = router;
