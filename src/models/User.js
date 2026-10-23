const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../utils/roles');
const { CODES, ALL } = require('../utils/colleges');
const { UNITS, DEPARTMENTS, TEAM_UNIT, deptOfUnit, guessUnit } = require('../utils/org');

// An account on the appraisal website. HR creates and manages them; this
// database has nothing to do with MILE's.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 160 },
    password: { type: String, select: false, default: null },
    // One role per account — it decides the appraisal form and the access
    // (see utils/roles.js).
    role: { type: String, enum: ROLES, default: 'faculty' },
    // GN or RB — or ALL (both colleges): the Super Admin, the common HR, the
    // GM, the Director and the Placement / Training HODs.
    college: { type: String, enum: [...CODES, ALL], default: 'GN' },
    // The branch or unit (CS, EC, … Admin, Admission, Placement, Training,
    // Pharmacy — see utils/org.js). It decides who reviews the person's form.
    unit: { type: String, enum: ['', ...UNITS.map((u) => u.key)], default: '' },
    // B.Tech + Management or Pharmacy — follows the unit; set on its own for
    // a Principal / Vice Principal who looks after one department only.
    deptKey: { type: String, enum: ['', ...DEPARTMENTS.map((d) => d.key)], default: '' },
    // Before roles became one per account; read once by migrateRoles().
    roles: { type: [String], default: undefined, select: false },
    department: { type: String, trim: true, default: '', maxlength: 120 },
    designation: { type: String, trim: true, default: '', maxlength: 120 },
    employeeId: { type: String, trim: true, default: '', maxlength: 60 },
    dateOfBirth: { type: String, trim: true, default: '', maxlength: 40 },
    // "Name of HOD" on the staff forms; filled in by HR or the person.
    hodName: { type: String, trim: true, default: '', maxlength: 120 },
    mobile: { type: String, trim: true, default: '', maxlength: 30 },

    // PART-1 of the form is filled from here when a round is released.
    basic: {
      qualification: { type: String, trim: true, default: '', maxlength: 200 },
      dateOfJoining: { type: String, trim: true, default: '', maxlength: 40 },
      expIndustrial: { type: String, trim: true, default: '', maxlength: 60 },
      expTeaching: { type: String, trim: true, default: '', maxlength: 60 },
      expResearch: { type: String, trim: true, default: '', maxlength: 60 },
    },

    isActive: { type: Boolean, default: true },
    // Set when HR hands out a temporary password: the person must choose
    // their own at the next sign-in.
    mustChangePassword: { type: Boolean, default: false },
    // Part of every sign-in token. Raised when the password changes or the
    // account is switched off, so every older sign-in stops working at once.
    tokenVersion: { type: Number, default: 0 },

    // One-time link for an invite or a password reset (only the hash kept).
    linkTokenHash: { type: String, select: false, default: null },
    linkTokenExpires: { type: Date, select: false, default: null },
    linkPurpose: { type: String, enum: ['invite', 'reset', null], select: false, default: null },
    invitedAt: { type: Date, default: null },

    lastLoginAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ college: 1, role: 1 });
userSchema.index({ department: 1 });
userSchema.index({ college: 1, role: 1, unit: 1 });

// The department always follows the unit, when there is one.
userSchema.pre('save', function syncDept() {
  if (TEAM_UNIT[this.role] && this.unit !== TEAM_UNIT[this.role]) this.unit = TEAM_UNIT[this.role];
  if (this.unit) this.deptKey = deptOfUnit(this.unit);
});

userSchema.methods.setPassword = async function setPassword(plain, { temporary = false } = {}) {
  this.password = await bcrypt.hash(String(plain), 10);
  this.mustChangePassword = temporary;
  this.tokenVersion = (this.tokenVersion || 0) + 1; // older sign-ins stop working
  this.linkTokenHash = null;
  this.linkTokenExpires = null;
  this.linkPurpose = null;
};

userSchema.methods.checkPassword = function checkPassword(plain) {
  if (!this.password) return false;
  return bcrypt.compare(String(plain || ''), this.password);
};

// A fresh one-time link token; returns the plain token for the email.
userSchema.methods.issueLinkToken = function issueLinkToken(purpose, hours) {
  const token = crypto.randomBytes(32).toString('hex');
  this.linkTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  this.linkTokenExpires = new Date(Date.now() + hours * 3600 * 1000);
  this.linkPurpose = purpose;
  return token;
};

// Accounts made when a person could hold several roles get the one that
// matters most. Runs at start-up; does nothing once every account has a role.
userSchema.statics.migrateRoles = async function migrateRoles() {
  const old = await this.find({ roles: { $exists: true, $ne: [] } }).select('+roles');
  const order = ['principal', 'director', 'hod', 'hr', 'admin_team', 'placement_team', 'admission_team', 'faculty'];
  for (const u of old) {
    const pick = order.find((r) => u.roles.includes(r)) || u.role || 'faculty';
    // eslint-disable-next-line no-await-in-loop
    await this.updateOne({ _id: u._id }, { $set: { role: pick }, $unset: { roles: 1 } });
  }
  return old.length;
};

// Accounts made before there were two colleges: the Director and HR see
// both, everyone else is put in GN (HR can move them).
userSchema.statics.migrateColleges = async function migrateColleges() {
  const both = await this.updateMany({ college: { $exists: false }, role: { $in: ['director', 'hr'] } }, { $set: { college: ALL } });
  const gn = await this.updateMany({ college: { $exists: false } }, { $set: { college: 'GN' } });
  return both.modifiedCount + gn.modifiedCount;
};

// Accounts made before branches/units existed: the unit is worked out from
// the department written on the account, or from a team role.
userSchema.statics.migrateUnits = async function migrateUnits() {
  const list = await this.find({ $or: [{ unit: { $exists: false } }, { unit: '' }] }).select('role department unit deptKey');
  let n = 0;
  for (const u of list) {
    const unit = TEAM_UNIT[u.role] || (['faculty', 'hod'].includes(u.role) ? guessUnit(u.department) : '');
    if (!unit) continue;
    // eslint-disable-next-line no-await-in-loop
    await this.updateOne({ _id: u._id }, { $set: { unit, deptKey: deptOfUnit(unit) } });
    n += 1;
  }
  return n;
};

userSchema.statics.hashLinkToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');

module.exports = mongoose.model('User', userSchema);
