const express = require('express');
const router = express.Router();
const { db } = require('../db'); 
const { requireAuth } = require('../middleware/auth'); 

// Get Wallet Dashboard Data
router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRes = await db.execute({ sql: 'SELECT wallet_address, locked, lock_reason FROM users WHERE id = ?', args: [userId] });
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        
        const user = userRes.rows[0];

        const balancesRes = await db.execute({ sql: 'SELECT coin, amount FROM balances WHERE user_id = ?', args: [userId] });
        const balances = {};
        balancesRes.rows.forEach(row => { balances[row.coin] = row.amount; });

        res.json({ 
            walletAddress: user.wallet_address, 
            balances,
            locked: user.locked === 1,
            lock_reason: user.lock_reason
        });
    } catch (err) {
        console.error("Wallet Route Error:", err);
        res.status(500).json({ error: 'Server error loading wallet data' });
    }
});

// Get Transaction History for a specific coin
router.get('/history/:coin', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const coin = req.params.coin;

        // Get regular transactions (sends, deposits)
        const txRes = await db.execute({
            sql: 'SELECT * FROM transactions WHERE user_id = ? AND coin = ? ORDER BY created_at DESC LIMIT 20',
            args: [userId, coin]
        });

        // Get withdrawals for this coin
        const wdRes = await db.execute({
            sql: 'SELECT * FROM withdrawals WHERE user_id = ? AND coin = ? ORDER BY created_at DESC LIMIT 20',
            args: [userId, coin]
        });

        res.json({ transactions: txRes.rows, withdrawals: wdRes.rows });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load history' });
    }
});

// Check if user is locked (Helper function)
async function checkLock(userId) {
    const res = await db.execute({ sql: 'SELECT locked, lock_reason FROM users WHERE id = ?', args: [userId] });
    return { isLocked: res.rows[0].locked === 1, reason: res.rows[0].lock_reason };
}

// Send Funds to another user
router.post('/send', requireAuth, async (req, res) => {
    const { coin, amount, receiverAddress } = req.body;
    const userId = req.user.id;

    try {
        const lockStatus = await checkLock(userId);
        if (lockStatus.isLocked) return res.status(403).json({ error: `Account Suspended: ${lockStatus.reason || 'Contact support'}` });

        const balRes = await db.execute({ sql: 'SELECT amount FROM balances WHERE user_id = ? AND coin = ?', args: [userId, coin] });
        const currentBal = balRes.rows.length > 0 ? balRes.rows[0].amount : 0;
        
        if (currentBal < amount) return res.status(400).json({ error: 'Insufficient balance' });

        // Deduct balance
        await db.execute({
            sql: 'UPDATE balances SET amount = amount - ? WHERE user_id = ? AND coin = ?',
            args: [amount, userId, coin]
        });

        // Add transaction record
        await db.execute({
            sql: `INSERT INTO transactions (user_id, coin, type, amount, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
            args: [userId, coin, 'send', amount, `Sent to ${receiverAddress}`, Date.now()]
        });

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error processing send' });
    }
});

// Request Withdrawal
router.post('/withdraw', requireAuth, async (req, res) => {
    const { coin, amount, address } = req.body;
    const userId = req.user.id;

    try {
        const lockStatus = await checkLock(userId);
        if (lockStatus.isLocked) return res.status(403).json({ error: `Account Suspended: ${lockStatus.reason || 'Contact support'}` });

        const balRes = await db.execute({ sql: 'SELECT amount FROM balances WHERE user_id = ? AND coin = ?', args: [userId, coin] });
        const currentBal = balRes.rows.length > 0 ? balRes.rows[0].amount : 0;
        
        if (currentBal < amount) return res.status(400).json({ error: 'Insufficient balance' });

        // Deduct balance temporarily while pending
        await db.execute({
            sql: 'UPDATE balances SET amount = amount - ? WHERE user_id = ? AND coin = ?',
            args: [amount, userId, coin]
        });

        // Create Pending Withdrawal
        await db.execute({
            sql: `INSERT INTO withdrawals (user_id, coin, amount, address, status, created_at) VALUES (?, ?, ?, ?, 'Pending', ?)`,
            args: [userId, coin, amount, address, Date.now()]
        });

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error processing withdrawal' });
    }
});

module.exports = router;
