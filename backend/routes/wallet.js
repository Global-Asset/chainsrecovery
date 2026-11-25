const express = require('express');
const router = express.Router();
const { db } = require('../db'); 
const { requireAuth } = require('../middleware/auth'); 

router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;

        const userRes = await db.execute({ sql: 'SELECT wallet_address FROM users WHERE id = ?', args: [userId] });
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        const walletAddress = userRes.rows[0].wallet_address;

        const balancesRes = await db.execute({ sql: 'SELECT coin, amount FROM balances WHERE user_id = ?', args: [userId] });
        const balances = {};
        balancesRes.rows.forEach(row => { balances[row.coin] = row.amount; });

        res.json({ walletAddress, balances });
    } catch (err) {
        console.error("Wallet Route Error:", err);
        res.status(500).json({ error: 'Server error loading wallet data' });
    }
});

module.exports = router;
