const express = require('express');
const db = require('../db');
const { signToken, requireAdmin } = require('../middleware/auth');
const { COINS } = require('../utils');
const router = express.Router();

router.post('/login', (req, res) => {
  if (req.body.password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid password' });
    res.json({ ok: true, token: signToken({ role: 'admin' }, '12h') });
    });

    router.get('/users', requireAdmin, (req, res) => {
      const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
        const allBalances = db.prepare('SELECT user_id, coin, amount FROM balances').all();

            res.json({ ok: true, users: users.map(u => {
                const bals = {};
                    allBalances.filter(b => b.user_id === u.id).forEach(b => bals[b.coin] = b.amount);
                        return { ...u, balances: bals };
                          })});
                          });

                          router.get('/cases', requireAdmin, (req, res) => {
                            const cases = db.prepare(`
                              SELECT id, name, email, service, message, status, created_at
                              FROM cases
                              ORDER BY created_at DESC
                              LIMIT 50
                            `).all();
                            res.json({ ok: true, cases });
                          });

                          router.patch('/users/:id/lock', requireAdmin, (req, res) => {
                            db.prepare('UPDATE users SET locked=?, lock_reason=? WHERE id=?').run(req.body.locked ? 1 : 0, req.body.reason || '', req.params.id);
                              res.json({ ok: true });
                              });

                              router.patch('/users/:id/balances', requireAdmin, (req, res) => {
                                const { balances, note } = req.body;
                                  db.transaction(() => {
                                      for (const [coin, newAmount] of Object.entries(balances)) {
                                            if (!COINS.includes(coin)) continue;
                                                  const current = db.prepare('SELECT amount FROM balances WHERE user_id=? AND coin=?').get(req.params.id, coin);
                                                        const oldAmount = current ? current.amount : 0;
                                                              if (Number(newAmount) !== oldAmount) {
                                                                      db.prepare('INSERT OR REPLACE INTO balances (user_id, coin, amount) VALUES (?,?,?)').run(req.params.id, coin, Number(newAmount));
                                                                              db.prepare(`INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)`).run(
                                                                                        req.params.id, coin, Number(newAmount) > oldAmount ? 'in' : 'out', Math.abs(Number(newAmount) - oldAmount), note || 'Admin Adjustment', Date.now()
                                                                                                );
                                                                                                      }
                                                                                                          }
                                                                                                            })();
                                                                                                              res.json({ ok: true });
                                                                                                              });

                                                                                                              router.get('/withdrawals', requireAdmin, (req, res) => {
                                                                                                                const rows = db.prepare("SELECT * FROM withdrawals ORDER BY id DESC LIMIT 20").all();
                                                                                                                  res.json({ ok: true, withdrawals: rows });
                                                                                                                  });

                                                                                                                  router.patch('/withdrawals/:id', requireAdmin, (req, res) => {
                                                                                                                    const { action } = req.body;
                                                                                                                      const w = db.prepare("SELECT * FROM withdrawals WHERE id=? AND status='Pending'").get(req.params.id);

                                                                                                                          if (!w) return res.status(404).json({ error: 'Withdrawal not found or already processed' });

                                                                                                                            if (action === 'approve') {
                                                                                                                                db.prepare("UPDATE withdrawals SET status='Approved' WHERE id=?").run(w.id);
                                                                                                                                    db.prepare(`INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)`).run(w.user_id, w.coin, 'out', w.amount, 'Withdrawal Approved by Admin', Date.now());
                                                                                                                                      } else if (action === 'decline') {
                                                                                                                                          db.prepare("UPDATE withdrawals SET status='Declined' WHERE id=?").run(w.id);
                                                                                                                                              db.prepare('UPDATE balances SET amount = amount + ? WHERE user_id=? AND coin=?').run(w.amount, w.user_id, w.coin);
                                                                                                                                                  db.prepare(`INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?,?,?,?,?,?)`).run(w.user_id, w.coin, 'in', w.amount, 'Withdrawal Declined - Refunded', Date.now());
                                                                                                                                                    }
                                                                                                                                                      res.json({ ok: true });
                                                                                                                                                      });

                                                                                                                                                      module.exports = router;