const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isHR } = require('../utils/roles');

const signToken = (user) => jwt.sign({ id: String(user._id), v: user.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// Signed in, active, and the sign-in is from the current password.
const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Please sign in' });
  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: 'Your sign-in has expired. Please sign in again.' });
  }
  const user = await User.findById(claims.id);
  if (!user || !user.isActive) return res.status(401).json({ success: false, message: 'This account is not active' });
  if ((claims.v || 0) !== (user.tokenVersion || 0)) {
    return res.status(401).json({ success: false, message: 'Your password was changed. Please sign in again.' });
  }
  req.user = user;
  return next();
};

// Until a temporary password is replaced, nothing else is allowed.
const passwordChosen = (req, res, next) => {
  if (req.user?.mustChangePassword) {
    return res.status(403).json({ success: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Choose your own password first' });
  }
  return next();
};

const hrOnly = (req, res, next) => (isHR(req.user) ? next() : res.status(403).json({ success: false, message: 'Only HR can do this' }));

module.exports = { signToken, protect, passwordChosen, hrOnly };
