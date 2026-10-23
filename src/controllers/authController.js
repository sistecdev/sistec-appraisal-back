const crypto = require('crypto');
const User = require('../models/User');
const { signToken } = require('../middleware/auth');
const { mailEnabled, sendReset } = require('../services/mailer');
const { ROLE_LABEL, FORM_ROLES, isHR, isSuperAdmin, isReviewer } = require('../utils/roles');
const { collegeLabel } = require('../utils/colleges');
const { unitLabel, deptLabel } = require('../utils/org');

const bad = (res, message, code = 400) => res.status(code).json({ success: false, message });
const MIN_PASSWORD = 8;
const passwordProblem = (p) => {
  const s = String(p || '');
  if (s.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters`;
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'Use letters and at least one number';
  return null;
};

// What the website needs to know about the signed-in person.
const me = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  roleLabel: ROLE_LABEL[u.role],
  college: u.college,
  collegeLabel: collegeLabel(u.college),
  department: u.department,
  unit: u.unit || '',
  unitLabel: unitLabel(u.unit),
  deptLabel: deptLabel(u.deptKey),
  designation: u.designation,
  mustChangePassword: !!u.mustChangePassword,
  can: { hr: isHR(u), superAdmin: isSuperAdmin(u), review: isReviewer(u), form: FORM_ROLES.includes(u.role) },
});

// @route POST /api/auth/login   { email, password }
const login = async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = email ? await User.findOne({ email }).select('+password') : null;
  if (!user || !(await user.checkPassword(req.body?.password))) return bad(res, 'Wrong email or password', 401);
  if (!user.isActive) return bad(res, 'This account has been switched off. Please contact HR.', 401);
  user.lastLoginAt = new Date();
  await user.save();
  res.json({ success: true, token: signToken(user), user: me(user) });
};

// @route GET /api/auth/me
const getMe = (req, res) => res.json({ success: true, user: me(req.user) });

// @route POST /api/auth/change-password   { currentPassword, newPassword }
const changePassword = async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.checkPassword(req.body?.currentPassword))) return bad(res, 'Your current password is not right');
  const problem = passwordProblem(req.body?.newPassword);
  if (problem) return bad(res, problem);
  if (req.body.newPassword === req.body.currentPassword) return bad(res, 'Choose a password different from the current one');
  await user.setPassword(req.body.newPassword);
  await user.save();
  res.json({ success: true, message: 'Password changed', token: signToken(user), user: me(user) });
};

// @route POST /api/auth/forgot-password   { email }
// Always the same answer, so nobody can find out which emails have accounts.
const forgotPassword = async (req, res) => {
  const answer = { success: true, emailOn: mailEnabled(), message: mailEnabled()
    ? 'If that email has an account, a reset link is on its way.'
    : 'Email is not set up here. Please ask HR to reset your password.' };
  if (!mailEnabled()) return res.json(answer);
  const user = await User.findOne({ email: String(req.body?.email || '').trim().toLowerCase(), isActive: true });
  if (user) {
    const token = user.issueLinkToken('reset', 1);
    await user.save();
    try { await sendReset(user, token); } catch (err) { console.error('reset email failed:', err.message); }
  }
  return res.json(answer);
};

// @route POST /api/auth/set-password   { token, password }
// For both an invite and a password reset.
const setPasswordWithLink = async (req, res) => {
  const hash = User.hashLinkToken(req.body?.token);
  const user = await User.findOne({ linkTokenHash: hash, linkTokenExpires: { $gt: new Date() } }).select('+linkTokenHash +linkTokenExpires +linkPurpose');
  if (!user) return bad(res, 'This link has expired or was already used. Ask HR for a new one.');
  if (!user.isActive) return bad(res, 'This account has been switched off. Please contact HR.');
  const problem = passwordProblem(req.body?.password);
  if (problem) return bad(res, problem);
  await user.setPassword(req.body.password);
  user.lastLoginAt = new Date();
  await user.save();
  res.json({ success: true, message: 'Password set', token: signToken(user), user: me(user) });
};

/* ── First run: create the Super Admin from the website ── */

// @route GET /api/auth/setup
const setupStatus = async (req, res) => res.json({ success: true, needed: (await User.estimatedDocumentCount()) === 0 });

// @route POST /api/auth/setup   { setupKey, name, email, password }
const setup = async (req, res) => {
  if ((await User.estimatedDocumentCount()) > 0) return bad(res, 'Setup is already done. Sign in instead.', 403);
  const key = String(process.env.SETUP_KEY || '');
  const given = String(req.body?.setupKey || '');
  if (!key || given.length !== key.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key))) {
    return bad(res, 'The setup key is not right', 403);
  }
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Give a name and a valid email');
  const problem = passwordProblem(req.body?.password);
  if (problem) return bad(res, problem);
  // The first account is the Super Admin: it serves both colleges and makes
  // the HR accounts (each college's HR and the common HR).
  const user = new User({ name, email, role: 'super_admin', college: 'ALL', lastLoginAt: new Date() });
  await user.setPassword(req.body.password);
  await user.save();
  res.status(201).json({ success: true, message: 'Super Admin account created', token: signToken(user), user: me(user) });
};

module.exports = { login, getMe, changePassword, forgotPassword, setPasswordWithLink, setupStatus, setup, me, passwordProblem };
