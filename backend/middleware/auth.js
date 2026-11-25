const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'User token required' }); 
    }
    const token = authHeader.split(' ')[1];
    try {
        const secret = process.env.JWT_SECRET || 'fallback_secret_change_me';
        const decoded = jwt.verify(token, secret);
        req.user = decoded; 
        next(); 
    } catch (err) {
        res.status(401).json({ error: 'Token is invalid or expired' });
    }
}

function requireAdmin(req, res, next) {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Admin token required' }); 
    }
    const token = authHeader.split(' ')[1];
    try {
        const secret = process.env.JWT_SECRET || 'fallback_secret_change_me';
        const decoded = jwt.verify(token, secret);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }
        req.admin = decoded; 
        next(); 
    } catch (err) {
        res.status(401).json({ error: 'Admin token is invalid or expired' });
    }
}

function signToken(payload, expiresIn = '7d') {
    const secret = process.env.JWT_SECRET || 'fallback_secret_change_me';
    return jwt.sign(payload, secret, { expiresIn });
}

module.exports = { requireAuth, requireAdmin, signToken };
