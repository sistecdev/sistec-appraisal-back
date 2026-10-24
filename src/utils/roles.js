// Every account has one role. Seven of them get an appraisal form of their
// own (the role decides which form); the others only review. The path each
// form takes, and who gives marks or only comments, is in flow.js.
//
// Super Admin creates the HR accounts (each college's HR and the common
// HR). HR — of one college, or common to both — manages everyone else,
// releases the forms and receives them back.
// The HR Team are the HR department's staff: they fill the HR form (released
// by their college's HR) but have none of HR's powers. Lab Techs fill the
// Admin form, marked by the Lab Tech HOD.
const FORM_ROLES = ['faculty', 'hod', 'hr', 'hr_team', 'lab_tech', 'admin_team', 'admission_team', 'placement_team', 'training_team'];
const REVIEW_ROLES = ['team_lead', 'gm', 'vice_principal', 'principal', 'director'];
const ROLES = ['super_admin', ...FORM_ROLES, ...REVIEW_ROLES];

const ROLE_LABEL = {
  super_admin: 'Super Admin',
  faculty: 'Faculty',
  hod: 'HOD',
  hr: 'HR',
  hr_team: 'HR Team',
  lab_tech: 'Lab Tech',
  admin_team: 'Admin Team',
  admission_team: 'Admission Team',
  placement_team: 'Placement Team',
  training_team: 'Training Team',
  team_lead: 'Team Lead (Admission)',
  gm: 'General Manager (GM)',
  vice_principal: 'Vice Principal',
  principal: 'Principal',
  director: 'Director',
};

// Roles that belong to both colleges ("ALL"), and those that may. A
// Placement or Training Team member works at GN, at RB or for both.
const COMMON_TEAMS = ['placement_team', 'training_team'];
const ALWAYS_BOTH = ['super_admin', 'gm', 'director'];
const MAY_BE_BOTH = [...ALWAYS_BOTH, 'hr', ...COMMON_TEAMS];

const roleOf = (u) => u?.role || '';
const isSuperAdmin = (u) => roleOf(u) === 'super_admin';
// HR powers: an HR account, or the Super Admin (who can do everything HR can).
const isHR = (u) => ['hr', 'super_admin'].includes(roleOf(u));
const isPrincipal = (u) => roleOf(u) === 'principal';
const isDirector = (u) => roleOf(u) === 'director';
const isHod = (u) => roleOf(u) === 'hod';
const isReviewer = (u) => ['hod', ...REVIEW_ROLES].includes(roleOf(u));
// Who can be given an appraisal form.
const isAppraisable = (u) => FORM_ROLES.includes(roleOf(u));

const sameId = (a, b) => String(a?._id || a || '') === String(b?._id || b || '');
const dept = (d) => String(d || '').trim().toLowerCase();

// "Admin Team", "admin_team", "GM", "Vice Principal", "Placement" … → a role key.
const cleanRole = (value) => {
  const v = String(Array.isArray(value) ? value[0] : value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!v) return '';
  const found = ROLES.find((r) => r.replace(/_/g, '') === v || ROLE_LABEL[r].toLowerCase().replace(/[^a-z]/g, '') === v);
  if (found) return found;
  if (['gm', 'generalmanager'].includes(v)) return 'gm';
  if (['vp', 'viceprincipal'].includes(v)) return 'vice_principal';
  if (v.startsWith('superadmin')) return 'super_admin';
  if (v.startsWith('teamlead')) return 'team_lead';
  if (v.startsWith('admission')) return 'admission_team';
  if (v.startsWith('placement')) return 'placement_team';
  if (v.startsWith('training')) return 'training_team';
  if (v.startsWith('admin')) return 'admin_team';
  if (v.startsWith('head')) return 'hod';
  return '';
};

module.exports = {
  FORM_ROLES, REVIEW_ROLES, ROLES, ROLE_LABEL, ALWAYS_BOTH, MAY_BE_BOTH, COMMON_TEAMS,
  roleOf, isSuperAdmin, isHR, isPrincipal, isDirector, isHod, isReviewer, isAppraisable, sameId, dept, cleanRole,
};
