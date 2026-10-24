const { isBasicScience } = require('./org');
const { LEAD_ROLES } = require('./roles');

// The path each appraisal form takes after HR releases it and the person
// fills it in. At each step one person either gives the marks or only adds
// a comment; after the last step the form is back with HR.
//
//   Faculty               → HOD (marks) → Principal (comment) → Director (comment)
//   Faculty, Basic Science→ HOD (marks) → Vice Principal (comment) → Principal (comment) → Director (comment)
//   HOD                   → Principal (marks) → Director (comment)
//   HR                    → GM (marks) → Principal (comment) → Director (comment)
//   HR Team               → HR Team Lead (marks) → Principal (comment) → Director (comment)
//   Admission Team        → Team Lead (marks) → GM (comment) → Director (comment)
//   Admin Team            → GM (marks) → Director (comment)
//   Admin Team, RB        → Admin HOD (marks) → GM (comment) → Principal (comment) → Director (comment)
//   Placement Team        → Placement Team Lead (marks) → Principal (comment) → Director (comment)
//   Training Team         → Training Team Lead (marks) → Principal (comment) → Director (comment)
//
// `role` is who acts; `unit` narrows an HOD step to that unit's HOD (the
// Placement / Training HOD, common to both colleges; the Admin HOD of a
// college). A step held by one
// named person (an HOD, a Team Lead) gets that person when the form is
// released; the others (Principal, Vice Principal, GM, Director) go to
// whoever holds the role for the form's college.

const step = (role, mode, label, extra = {}) => ({ role, mode, label, ...extra });

const FLOWS = {
  faculty: (p) => [
    step('hod', 'marks', 'HOD'),
    ...(isBasicScience(p?.unit) ? [step('vice_principal', 'comment', 'Vice Principal')] : []),
    step('principal', 'comment', 'Principal'),
    step('director', 'comment', 'Director'),
  ],
  hod: () => [step('principal', 'marks', 'Principal'), step('director', 'comment', 'Director')],
  hr: () => [step('gm', 'marks', 'GM'), step('principal', 'comment', 'Principal'), step('director', 'comment', 'Director')],
  hr_team: () => [step('hr_team_lead', 'marks', 'HR Team Lead'), step('principal', 'comment', 'Principal'), step('director', 'comment', 'Director')],
  admission_team: () => [step('team_lead', 'marks', 'Team Lead'), step('gm', 'comment', 'GM'), step('director', 'comment', 'Director')],
  // At RB the Admin team has an HOD of its own (an HOD of the Admin unit).
  admin_team: (p) => (p?.college === 'RB'
    ? [step('hod', 'marks', 'Admin HOD', { unit: 'ADMIN' }), step('gm', 'comment', 'GM'), step('principal', 'comment', 'Principal'), step('director', 'comment', 'Director')]
    : [step('gm', 'marks', 'GM'), step('director', 'comment', 'Director')]),
  placement_team: () => [step('placement_lead', 'marks', 'Placement Team Lead'), step('principal', 'comment', 'Principal'), step('director', 'comment', 'Director')],
  training_team: () => [step('training_lead', 'marks', 'Training Team Lead'), step('principal', 'comment', 'Principal'), step('director', 'comment', 'Director')],
};

const flowFor = (formFor, person) => (FLOWS[formFor] ? FLOWS[formFor](person) : []);

// Steps held by one named person, chosen when the form is released.
const PERSONAL = ['hod', ...LEAD_ROLES];
const isPersonal = (s) => PERSONAL.includes(s?.role);

// "HOD (marks) → Principal (comment) → Director (comment)" — for the release page.
const routeLabel = (formFor, person) => flowFor(formFor, person).map((s) => `${s.label} (${s.mode === 'marks' ? 'marks' : 'comment'})`).join(' → ');

module.exports = { FLOWS, flowFor, isPersonal, routeLabel };
