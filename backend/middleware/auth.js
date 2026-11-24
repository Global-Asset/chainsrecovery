const jwt = require('jsonwebtoken');

// Make sure to add JWT_SECRET to your Render Environment Variables!
// Example value: my_super_secret_jwt_key_123
const SECRET = process.env.JWT_SECRET || 'fallback_secret_for_local_testing_only';

// Generate a new token
const signToken = (payload, expiresIn = '7d') => {
  return jwt.sign(payload, SECRET, { expiresIn });
};

// Helper function to extract the token from the Authorization header
function extract(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// Middleware to protect normal user routes
function requireUser(req, res, next) {
  const token = extract(req);
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const d = jwt.verify(token, SECRET);
    if (d.role !== 'user') return res.status(403).json({ error: 'User token required' });
    
    req.user = d; 
    next();
  } catch (err) { 
    return res.status(401).json({ error: 'Invalid or expired token' }); 
  }
}

// Middleware to protect admin routes
function requireAdmin(req, res, next) {
  const token = extract(req);
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const d = jwt.verify(token, SECRET);
    if (d.role !== 'admin') return res.status(403).json({ error: 'Admin token required' });
    
    req.admin = d; 
    next();
  } catch (err) { 
    return res.status(401).json({ error: 'Invalid or expired token' }); 
  }
}

module.exports = { signToken, requireUser, requireAdmin };
