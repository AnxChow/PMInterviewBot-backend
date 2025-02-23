// middleware/auth.js
export function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return next();
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  