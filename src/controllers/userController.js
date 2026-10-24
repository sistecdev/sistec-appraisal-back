const crypto = require('crypto');
const XLSX = require('xlsx');
const User = require('../models/User');
const {
  ROLES, FORM_ROLES, ROLE_LABEL, ALWAYS_BOTH, MAY_BE_BOTH, cleanRole, isSuperAdmin, sameId,
} = require('../utils/roles');
const { mailEnabled, sendInvite, sendCredentials } = require('../services/mailer');
const { CODES, ALL, collegeLabel, cleanCollege } = require('../utils/colleges');
const {
  DEPARTMENTS, UNITS, UNIT, TEAM_UNIT, unitsForRole, guessUnit, cleanDept, unitLabel, deptLabel, deptOfUnit,
} = require('../utils/org');

// Who manages the accounts:
//   Super Admin — everyone, and the only one who makes HR accounts (each
//                 college's HR and the common HR)
//   common HR   — everyone of both colleges except HR accounts
//   college HR  — the people of their own college only
// Each account has one role, a college (GN, RB, or both for the roles that
// serve both) and — for the roles it matters to — a branch / unit, which
// decides who reviews their form (utils/flow.js).

const bad = (res, message, code = 400) => res.status(code).json({ success: false, message });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BASIC = ['qualification', 'dateOfJoining', 'expIndustrial', 'expTeaching', 'expResearch'];
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

// Easy to read out or type: no 0/O, 1/l/I.
const tempPassword = () => {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set, n) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join('');
  return `${pick(letters, 4)}${pick(digits, 2)}${pick(letters, 3)}${pick(digits, 1)}`;
};

const row = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  roleLabel: ROLE_LABEL[u.role],
  college: u.college,
  collegeLabel: collegeLabel(u.college),
  unit: u.unit || '',
  unitLabel: unitLabel(u.unit),
  deptKey: u.deptKey || '',
  deptLabel: deptLabel(u.deptKey),
  department: u.department,
  designation: u.designation,
  employeeId: u.employeeId,
  mobile: u.mobile,
  dateOfBirth: u.dateOfBirth,
  hodName: u.hodName,
  basic: { ...Object.fromEntries(BASIC.map((k) => [k, ''])), ...(u.basic || {}) },
  isActive: u.isActive,
  mustChangePassword: u.mustChangePassword,
  hasPassword: !!u.password,
  invitedAt: u.invitedAt,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
});

// What this person may manage: everything (Super Admin), both colleges
// except HR accounts (common HR), or their own college (a college's HR).
const isCentral = (hr) => hr?.college === ALL;
const HR_ROLES = ['hr', 'super_admin'];
const manages = (hr, user) => {
  if (isSuperAdmin(hr)) return true;
  if (HR_ROLES.includes(user?.role) && !sameId(user, hr)) return false;
  return isCentral(hr) || (!!user?.college && user.college === hr?.college);
};
const collegeScope = (hr, asked) => (isCentral(hr) ? (CODES.includes(asked) || asked === ALL ? { college: asked } : {}) : { college: hr.college });

// A unit key, or one worked out from what was typed ("Computer Science").
const cleanUnit = (v) => (UNIT[String(v || '').trim().toUpperCase()] ? String(v).trim().toUpperCase() : guessUnit(v));
// Roles that serve both colleges, and the Placement / Training HODs.
const bothColleges = (role, unit) => ALWAYS_BOTH.includes(role) || (role === 'hod' && !!UNIT[unit]?.commonHead);

// The fields HR fills in, cleaned. A college's HR can only use their own.
const fieldsFrom = (b = {}, hr = null) => {
  const role = cleanRole(b.role ?? b.roles);
  // The branch: as chosen, or worked out from the department written
  // ("MBA", "Computer Science") when none was chosen — as in an Excel sheet.
  const unit = TEAM_UNIT[role] || (unitsForRole(role).length ? cleanUnit(b.unit) || guessUnit(b.department) : '');
  let college = hr && !isCentral(hr) ? hr.college : cleanCollege(b.college);
  if (bothColleges(role, unit) && (!hr || isCentral(hr))) college = ALL;
  return {
    name: str(b.name, 120),
    email: str(b.email, 160).toLowerCase(),
    role,
    college,
    unit,
    deptKey: unit ? deptOfUnit(unit) : (['principal', 'vice_principal'].includes(role) ? cleanDept(b.deptKey ?? b.departmentGroup) : ''),
    department: str(b.department, 120) || (unit ? UNIT[unit].name : ''),
  designation: str(b.designation, 120),
  employeeId: str(b.employeeId, 60),
  mobile: str(b.mobile, 30),
  dateOfBirth: str(b.dateOfBirth, 40),
  hodName: str(b.hodName, 120),
    basic: Object.fromEntries(BASIC.map((k) => [k, str(b.basic?.[k] ?? b[k], k === 'qualification' ? 200 : 60)])),
  };
};

const problemWith = (f, actor = null) => {
  if (!f.name) return 'Name is needed';
  if (!EMAIL.test(f.email)) return 'A valid email is needed';
  if (!f.role) return 'Choose a role';
  if (HR_ROLES.includes(f.role) && actor && !isSuperAdmin(actor)) return `Only the Super Admin creates ${ROLE_LABEL[f.role]} accounts`;
  if (unitsForRole(f.role).length && !unitsForRole(f.role).includes(f.unit)) {
    return `A ${ROLE_LABEL[f.role]} needs a branch / unit (${unitsForRole(f.role).map(unitLabel).join(', ')}) — it decides who reviews their form`;
  }
  if (bothColleges(f.role, f.unit) && f.college !== ALL) {
    return `${f.role === 'hod' ? `The ${unitLabel(f.unit)} HOD` : `The ${ROLE_LABEL[f.role]}`} serves both colleges — ask the common HR or the Super Admin to add them`;
  }
  if (!f.college) return 'Choose the college (GN or RB)';
  if (f.college === ALL && !MAY_BE_BOTH.includes(f.role) && !bothColleges(f.role, f.unit)) {
    return `A ${ROLE_LABEL[f.role]} belongs to one college — choose GN or RB`;
  }
  return null;
};

// How the person gets in: a temporary password shown to HR, or an emailed invite.
const giveAccess = async (user, how) => {
  if (how === 'invite') {
    const token = user.issueLinkToken('invite', 24 * 7);
    user.invitedAt = new Date();
    await user.save();
    const sent = await sendInvite(user, token);
    return sent.sent ? { invited: true } : { invited: false, reason: sent.reason };
  }
  const password = tempPassword();
  await user.setPassword(password, { temporary: true });
  await user.save();
  return { tempPassword: password };
};

// Never leave the site without an active Super Admin.
const lastHrProblem = async (user, nextRole, nextActive) => {
  if (user.role !== 'super_admin') return null;
  if (nextRole === 'super_admin' && nextActive) return null;
  const others = await User.countDocuments({ _id: { $ne: user._id }, role: 'super_admin', isActive: true });
  return others ? null : 'This is the only active Super Admin account — make someone else Super Admin first';
};

// The roles, the units and what each role needs — for the People page.
const roleMeta = () => ROLES.map((r) => ({
  key: r, label: ROLE_LABEL[r], hasForm: FORM_ROLES.includes(r),
  units: unitsForRole(r), both: ALWAYS_BOTH.includes(r) ? 'always' : MAY_BE_BOTH.includes(r) ? 'may' : 'no',
  hrOnly: HR_ROLES.includes(r),
}));

/* ───────────────────────────── list / one ───────────────────────────── */

// @route GET /api/users?q=&role=&department=&status=active|inactive&college=GN|RB|ALL
const list = async (req, res) => {
  const scope = collegeScope(req.user, req.query.college);
  const filter = { ...scope };
  if (ROLES.includes(req.query.role)) filter.role = req.query.role;
  if (req.query.department) filter.department = String(req.query.department);
  if (UNIT[req.query.unit]) filter.unit = req.query.unit;
  if (req.query.status === 'active') filter.isActive = true;
  if (req.query.status === 'inactive') filter.isActive = false;
  const q = str(req.query.q, 80);
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { employeeId: rx }, { department: rx }, { unit: rx }];
  }
  const users = await User.find(filter).select('+password').sort('name').lean();
  const departments = (await User.distinct('department', scope)).filter(Boolean).sort();
  const counts = Object.fromEntries((await User.aggregate([{ $match: { isActive: true, ...scope } }, { $group: { _id: '$role', n: { $sum: 1 } } }])).map((c) => [c._id, c.n]));
  res.json({
    success: true, data: users.map(row), departments, emailOn: mailEnabled(), counts,
    central: isCentral(req.user), superAdmin: isSuperAdmin(req.user), myCollege: req.user.college,
    colleges: CODES.map((c) => ({ key: c, label: collegeLabel(c) })),
    roles: roleMeta(),
    org: { DEPARTMENTS, UNITS },
  });
};

/* ───────────────────────────── create / edit ───────────────────────────── */

// @route POST /api/users   { ...fields, access: 'temp' | 'invite' }
const create = async (req, res) => {
  const f = fieldsFrom(req.body, req.user);
  const problem = problemWith(f, req.user);
  if (problem) return bad(res, problem);
  if (await User.exists({ email: f.email })) return bad(res, 'An account with this email already exists', 409);
  const how = req.body.access === 'invite' ? 'invite' : 'temp';
  if (how === 'invite' && !mailEnabled()) return bad(res, 'Email is not set up on this server — give a temporary password instead');
  const user = new User({ ...f, createdBy: req.user._id });
  const access = await giveAccess(user, how);
  res.status(201).json({ success: true, data: row(user), ...access, message: access.tempPassword ? 'Account created' : access.invited ? `Account created — invite sent to ${user.email}` : `Account created, but the invite could not be sent: ${access.reason}` });
};

// @route PUT /api/users/:id
const update = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || !manages(req.user, user)) return bad(res, 'Account not found', 404);
  const f = fieldsFrom({ ...row(user), ...req.body, basic: { ...(user.basic || {}), ...(req.body.basic || {}) } }, isSuperAdmin(req.user) || isCentral(req.user) ? null : req.user);
  // Your own role stays as it is unless you are the Super Admin.
  if (sameId(user, req.user) && !isSuperAdmin(req.user)) f.role = user.role;
  const problem = problemWith(f, sameId(user, req.user) ? null : req.user);
  if (problem) return bad(res, problem);
  if (f.email !== user.email && await User.exists({ email: f.email, _id: { $ne: user._id } })) return bad(res, 'Another account already uses this email', 409);
  const hrProblem = await lastHrProblem(user, f.role, user.isActive);
  if (hrProblem) return bad(res, hrProblem);
  Object.assign(user, f);
  await user.save();
  res.json({ success: true, data: row(user), message: 'Saved' });
};

// @route PATCH /api/users/:id/active   { active }
const setActive = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || !manages(req.user, user)) return bad(res, 'Account not found', 404);
  const active = !!req.body.active;
  if (!active && sameId(user, req.user)) return bad(res, 'You cannot switch off your own account');
  const hrProblem = await lastHrProblem(user, user.role, active);
  if (hrProblem) return bad(res, hrProblem);
  user.isActive = active;
  if (!active) user.tokenVersion = (user.tokenVersion || 0) + 1; // signs them out
  await user.save();
  res.json({ success: true, data: row(user), message: active ? 'Account switched on' : 'Account switched off — they are signed out' });
};

// A new temporary password, emailed with the User ID. The password changes
// only once the email has gone, so a failed email leaves the old one working.
const emailCredentials = async (user) => {
  const password = tempPassword();
  let sent;
  try { sent = await sendCredentials(user, password); } catch (err) { sent = { sent: false, reason: err.message }; }
  if (!sent.sent) return sent;
  await user.setPassword(password, { temporary: true });
  await user.save();
  return sent;
};

// @desc  Super Admin: email the User ID and a new temporary password to many
//        accounts at once (the ones listed on the People page). Super Admin
//        accounts and switched-off accounts are left out.
// @route POST /api/users/access/email   { ids: [..] }
const emailAllAccess = async (req, res) => {
  if (!isSuperAdmin(req.user)) return bad(res, 'Only the Super Admin can email sign-in details', 403);
  if (!mailEnabled()) return bad(res, 'Email is not set up on this server (SMTP in .env)');
  const ids = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : []).map(String).filter((x) => /^[a-f0-9]{24}$/i.test(x)))].slice(0, 2000);
  if (!ids.length) return bad(res, 'Nobody to send to');
  const users = await User.find({ _id: { $in: ids }, isActive: true, role: { $ne: 'super_admin' } });
  const failed = [];
  let sent = 0;
  // A few at a time, so the mail server is not flooded.
  for (let i = 0; i < users.length; i += 3) {
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(users.slice(i, i + 3).map(async (u) => ({ u, r: await emailCredentials(u) })));
    results.forEach(({ u, r }) => { if (r.sent) sent += 1; else failed.push({ name: u.name, email: u.email, reason: r.reason }); });
  }
  const skipped = ids.length - users.length;
  res.json({
    success: true, sent, failed, skipped,
    message: `Sign-in details emailed to ${sent} ${sent === 1 ? 'person' : 'people'}`
      + `${failed.length ? ` — ${failed.length} could not be sent (their password is unchanged)` : ''}`
      + `${skipped ? ` — ${skipped} skipped (switched off or Super Admin)` : ''}`,
  });
};

// @route POST /api/users/:id/access   { access: 'temp' | 'invite' | 'email' }
// A new temporary password, or a fresh invite / set-password email. 'email'
// (Super Admin only): a new temporary password, emailed with the User ID.
const resendAccess = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || !manages(req.user, user)) return bad(res, 'Account not found', 404);
  if (!user.isActive) return bad(res, 'Switch the account on first');
  if (req.body.access === 'email') {
    if (!isSuperAdmin(req.user)) return bad(res, 'Only the Super Admin can email sign-in details', 403);
    if (!mailEnabled()) return bad(res, 'Email is not set up on this server — give a temporary password instead');
    const sent = await emailCredentials(user);
    if (!sent.sent) return bad(res, `The email could not be sent (${sent.reason}) — their password is unchanged`, 502);
    return res.json({ success: true, message: `User ID and a new temporary password emailed to ${user.email}` });
  }
  const how = req.body.access === 'invite' ? 'invite' : 'temp';
  if (how === 'invite' && !mailEnabled()) return bad(res, 'Email is not set up on this server — give a temporary password instead');
  const access = await giveAccess(user, how);
  if (how === 'invite' && !access.invited) return bad(res, `The email could not be sent: ${access.reason}`, 502);
  res.json({ success: true, ...access, message: access.tempPassword ? 'New temporary password made' : `Email sent to ${user.email}` });
};

/* ───────────────────────────── Excel import ───────────────────────────── */

const COLUMNS = [
  ['Name', 'name'], ['Email', 'email'], ['Role', 'role'], ['College', 'college'], ['Branch / Unit', 'unit'], ['Department', 'department'], ['Designation', 'designation'],
  ['Employee ID', 'employeeId'], ['Mobile', 'mobile'], ['Date of Birth', 'dateOfBirth'], ['Name of HOD', 'hodName'],
  ['Highest Qualification', 'qualification'], ['Date of Joining', 'dateOfJoining'],
  ['Experience - Industrial', 'expIndustrial'], ['Experience - Teaching', 'expTeaching'], ['Experience - Research', 'expResearch'],
];
const keyFor = (header) => {
  const h = String(header || '').toLowerCase().replace(/[^a-z]/g, '');
  const found = COLUMNS.find(([label, key]) => label.toLowerCase().replace(/[^a-z]/g, '') === h || key.toLowerCase() === h);
  if (found) return found[1];
  if (/^(fullname|facultyname)$/.test(h)) return 'name';
  if (/^(emailid|mail)$/.test(h)) return 'email';
  if (/^(roles|category|formtype|form)$/.test(h)) return 'role';
  if (/^(dob|birthdate)$/.test(h)) return 'dateOfBirth';
  if (/^(hod|hodname)$/.test(h)) return 'hodName';
  if (/^(dept)$/.test(h)) return 'department';
  if (/^(branch|unit|branchunit)$/.test(h)) return 'unit';
  if (/^(campus|institute|collegecode)$/.test(h)) return 'college';
  if (/^(qualification)$/.test(h)) return 'qualification';
  if (/^(doj|joiningdate|dateofjoiningsoi)$/.test(h)) return 'dateOfJoining';
  return null;
};

// @route GET /api/users/import/template
const importTemplate = (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    COLUMNS.map(([label]) => label),
    ['Asha Verma', 'asha.verma@sistec.ac.in', 'Faculty', 'GN', 'CS', 'Computer Science', 'Assistant Professor', 'EMP101', '9800000000', '1990-04-12', '', 'M.Tech — CSE', '2019-07-01', '1 year', '6 years', ''],
    ['Rahul Jain', 'rahul.jain@sistec.ac.in', 'HOD', 'GN', 'CS', 'Computer Science', 'Professor & Head', 'EMP042', '', '', '', 'Ph.D. — CSE', '2010-08-01', '', '15 years', '5 years'],
    ['Neha Gupta', 'neha.gupta@sistec.ac.in', 'Faculty', 'RB', 'Basic Science', 'Mathematics', 'Assistant Professor', 'EMP150', '', '', '', 'M.Sc., Ph.D.', '2018-07-01', '', '7 years', ''],
    ['Karan Mehta', 'karan.mehta@sistec.ac.in', 'Faculty', 'GN', 'MBA', 'Management', 'Assistant Professor', 'EMP170', '', '', '', 'MBA, Ph.D.', '2017-07-01', '3 years', '8 years', ''],
    ['Meena Rao', 'meena.rao@sistec.ac.in', 'Admin Team', 'RB', 'Admin', 'Administration', 'Office Superintendent', 'EMP210', '', '1985-11-02', 'Mr. S. Kumar', '', '2015-03-01', '', '', ''],
    ['Ravi Patel', 'ravi.patel@sistec.ac.in', 'Placement Team', 'RB', 'Placement', 'Training & Placement', 'Placement Officer', 'EMP305', '', '1992-01-20', 'Dr. A. Shah', '', '2020-06-15', '', '', ''],
  ]);
  ws['!cols'] = COLUMNS.map(([label]) => ({ wch: Math.max(14, label.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Accounts');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="appraisal-accounts-template.xlsx"');
  res.send(buf);
};

// Reads the sheet and checks every row; nothing is saved.
const readRows = async (buffer, hr) => {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
  const existing = new Set((await User.find().select('email').lean()).map((u) => u.email));
  const seen = new Set();
  return raw.slice(0, 1000).map((r, i) => {
    const mapped = {};
    Object.entries(r).forEach(([h, v]) => { const k = keyFor(h); if (k) mapped[k] = v; });
    if (!mapped.role) mapped.role = 'faculty';
    const f = fieldsFrom(mapped, isCentral(hr) || isSuperAdmin(hr) ? null : hr);
    let error = problemWith(f, hr);
    if (!error && existing.has(f.email)) error = 'Already has an account';
    if (!error && seen.has(f.email)) error = 'Same email twice in the sheet';
    seen.add(f.email);
    return { line: i + 2, ...f, error };
  }).filter((r) => r.name || r.email);
};

// @route POST /api/users/import/preview   (multipart: file)
const importPreview = async (req, res) => {
  if (!req.file) return bad(res, 'Choose an Excel or CSV file');
  let rows;
  try { rows = await readRows(req.file.buffer, req.user); } catch { return bad(res, 'Could not read the file — use the template'); }
  if (!rows.length) return bad(res, 'No rows found in the file');
  res.json({ success: true, data: rows, ok: rows.filter((r) => !r.error).length, emailOn: mailEnabled() });
};

// @route POST /api/users/import   { rows: [...from preview], access: 'temp' | 'invite' }
const importCreate = async (req, res) => {
  const how = req.body.access === 'invite' ? 'invite' : 'temp';
  if (how === 'invite' && !mailEnabled()) return bad(res, 'Email is not set up on this server — use temporary passwords');
  const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 1000) : [];
  const results = [];
  for (const r of rows) {
    const f = fieldsFrom(r, isCentral(req.user) || isSuperAdmin(req.user) ? null : req.user);
    const problem = problemWith(f, req.user);
    // eslint-disable-next-line no-await-in-loop
    if (problem || await User.exists({ email: f.email })) {
      results.push({ name: f.name, email: f.email, error: problem || 'Already has an account' });
      continue;
    }
    const user = new User({ ...f, createdBy: req.user._id });
    // eslint-disable-next-line no-await-in-loop
    const access = await giveAccess(user, how);
    results.push({ name: user.name, email: user.email, role: ROLE_LABEL[user.role], college: user.college, unit: unitLabel(user.unit), department: user.department, ...access });
  }
  const created = results.filter((r) => !r.error).length;
  res.status(201).json({ success: true, data: results, created, message: `${created} account(s) created${created < results.length ? `, ${results.length - created} skipped` : ''}` });
};

module.exports = { list, create, update, setActive, resendAccess, emailAllAccess, importTemplate, importPreview, importCreate };
