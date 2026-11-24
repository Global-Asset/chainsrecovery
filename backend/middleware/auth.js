const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET;

const signToken = (payload, expiresIn = '7d') => jwt.sign(payload, SECRET, { expiresIn });

function extract(req) {
  const h = req.headers.authorization || '';
    return h.startsWith('Bearer ') ? h.slice(7) : null;
    }

    function requireUser(req, res, next) {
      const token = extract(req);
        if (!token) return res.status(401).json({ error: 'Missing token' });
          try {
              const d = jwt.verify(token, SECRET);
                  if (d.role !== 'user') return res.status(403).json({ error: 'User token required' });
                      req.user = d; next();
                        } catch { return res.status(401).json({ error: 'Invalid token' }); }
                        }

                        function requireAdmin(req, res, next) {
                          const token = extract(req);
                            if (!token) return res.status(401).json({ error: 'Missing token' });
                              try {
                                  const d = jwt.verify(token, SECRET);
                                      if (d.role !== 'admin') return res.status(403).json({ error: 'Admin token required' });
                                          req.admin = d; next();
                                            } catch { return res.status(401).json({ error: 'Invalid token' }); }
                                            }

                                            module.exports = { signToken, requireUser, requireAdmin };