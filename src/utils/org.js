// How SISTec is organised, for the appraisal.
//
// Two colleges (GN, RB — see colleges.js), each with the same two
// departments, and the same branches / units in them. Every college keeps
// its own people and data; its HR looks after only that college.
//
//   B.Tech + Management
//     CS, EC, CSIT, EX, EE, CE, ME, CYBER, AIDS, IOT, Basic Science, MBA,
//     HR Team, Lab Tech
//                          — each has its own HOD, in each college
//     Admin, Admission     — under the General Manager (one GM for both
//                            colleges); Admission also has a Team Lead in
//                            each college
//     Placement, Training  — one HOD each, common to both colleges
//   Pharmacy               — its own HOD in each college

const DEPARTMENTS = [
  { key: 'BTM', label: 'B.Tech + Management' },
  { key: 'PHARMACY', label: 'Pharmacy' },
];

// kind: 'branch'     — an academic branch: Faculty and an HOD
//       'admin'      — Admin team (GM)
//       'admission'  — Admission team (Team Lead, GM)
//       'placement'  — Placement team (Placement HOD, common)
//       'training'   — Training team (Training HOD, common)
// commonHead: its HOD is one person for both colleges.
// basicScience: its Faculty forms also go to the Vice Principal.
const UNITS = [
  { key: 'CS', label: 'CS', name: 'Computer Science & Engineering', dept: 'BTM', kind: 'branch' },
  { key: 'EC', label: 'EC', name: 'Electronics & Communication', dept: 'BTM', kind: 'branch' },
  { key: 'CSIT', label: 'CSIT', name: 'CS & Information Technology', dept: 'BTM', kind: 'branch' },
  { key: 'EX', label: 'EX', name: 'Electrical & Electronics', dept: 'BTM', kind: 'branch' },
  { key: 'EE', label: 'EE', name: 'Electrical Engineering', dept: 'BTM', kind: 'branch' },
  { key: 'CE', label: 'CE', name: 'Civil Engineering', dept: 'BTM', kind: 'branch' },
  { key: 'ME', label: 'ME', name: 'Mechanical Engineering', dept: 'BTM', kind: 'branch' },
  { key: 'CYBER', label: 'CYBER', name: 'Cyber Security', dept: 'BTM', kind: 'branch' },
  { key: 'AIDS', label: 'AIDS', name: 'AI & Data Science', dept: 'BTM', kind: 'branch' },
  { key: 'IOT', label: 'IOT', name: 'Internet of Things', dept: 'BTM', kind: 'branch' },
  { key: 'BASIC_SCIENCE', label: 'Basic Science', name: 'Basic Science', dept: 'BTM', kind: 'branch', basicScience: true },
  { key: 'MBA', label: 'MBA', name: 'Master of Business Administration', dept: 'BTM', kind: 'branch' },
  { key: 'HR_TEAM', label: 'HR Team', name: 'HR Team', dept: 'BTM', kind: 'branch' },
  { key: 'LAB_TECH', label: 'Lab Tech', name: 'Lab Technicians', dept: 'BTM', kind: 'branch' },
  { key: 'ADMIN', label: 'Admin', name: 'Administration', dept: 'BTM', kind: 'admin' },
  { key: 'ADMISSION', label: 'Admission', name: 'Admission (AdmissionAdmin)', dept: 'BTM', kind: 'admission' },
  { key: 'PLACEMENT', label: 'Placement', name: 'Training & Placement — Placement', dept: 'BTM', kind: 'placement', commonHead: true },
  { key: 'TRAINING', label: 'Training', name: 'Training & Placement — Training', dept: 'BTM', kind: 'training', commonHead: true },
  { key: 'PHARMACY', label: 'Pharmacy', name: 'Pharmacy', dept: 'PHARMACY', kind: 'branch' },
];
const UNIT = Object.fromEntries(UNITS.map((u) => [u.key, u]));
const unitOf = (key) => UNIT[key] || null;
const deptOfUnit = (key) => UNIT[key]?.dept || '';
const isBasicScience = (key) => !!UNIT[key]?.basicScience;
const BRANCHES = UNITS.filter((u) => u.kind === 'branch').map((u) => u.key);

// The unit a team role always belongs to.
const TEAM_UNIT = {
  admin_team: 'ADMIN', admission_team: 'ADMISSION', placement_team: 'PLACEMENT', training_team: 'TRAINING', team_lead: 'ADMISSION',
};

// Which units a role may be given.
const unitsForRole = (role) => {
  if (role === 'faculty') return BRANCHES;
  if (role === 'hod') return [...BRANCHES, 'PLACEMENT', 'TRAINING'];
  if (TEAM_UNIT[role]) return [TEAM_UNIT[role]];
  return [];
};

// "Computer Science", "cse", "Electronics & Comm" … → a unit key (for
// accounts made before units existed, and for Excel imports).
const guessUnit = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase().replace(/[^A-Z]/g, '');
  const exact = UNITS.find((u) => u.key.replace(/_/g, '') === upper || u.label.toUpperCase().replace(/[^A-Z]/g, '') === upper);
  if (exact) return exact.key;
  const s = raw.toLowerCase();
  if (/pharm/.test(s)) return 'PHARMACY';
  if (/lab\s*tech|laborator|\blab\b/.test(s)) return 'LAB_TECH';
  if (/\bhr\b|human resource/.test(s)) return 'HR_TEAM';
  if (/\bmba\b|business admin|management/.test(s)) return 'MBA';
  if (/cyber/.test(s)) return 'CYBER';
  if (/\biot\b|internet of things/.test(s)) return 'IOT';
  if (/\bai\b|aids|artificial|data science/.test(s)) return 'AIDS';
  if (/csit|information tech|\bit\b/.test(s)) return 'CSIT';
  if (/computer|\bcse?\b/.test(s)) return 'CS';
  if (/electronics\s*&?\s*(and\s*)?comm|\bec(e)?\b/.test(s)) return 'EC';
  if (/electrical\s*&?\s*(and\s*)?electronics|\bex\b/.test(s)) return 'EX';
  if (/electrical|\bee\b/.test(s)) return 'EE';
  if (/civil|\bce\b/.test(s)) return 'CE';
  if (/mechanical|\bme(ch)?\b/.test(s)) return 'ME';
  if (/basic|science|math|physics|chemistry|english|humanities/.test(s)) return 'BASIC_SCIENCE';
  if (/placement/.test(s)) return 'PLACEMENT';
  if (/training/.test(s)) return 'TRAINING';
  if (/admission/.test(s)) return 'ADMISSION';
  if (/admin/.test(s)) return 'ADMIN';
  return '';
};

const cleanDept = (v) => {
  const s = String(v || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  if (s.startsWith('PHARM')) return 'PHARMACY';
  if (['BTM', 'BTECH', 'BTECHMANAGEMENT', 'BTECHMGMT', 'ENGINEERING', 'MANAGEMENT'].includes(s) || s.startsWith('BTECH')) return 'BTM';
  return DEPARTMENTS.some((d) => d.key === s) ? s : '';
};

const unitLabel = (key) => UNIT[key]?.label || '';
const deptLabel = (key) => DEPARTMENTS.find((d) => d.key === key)?.label || '';

module.exports = {
  DEPARTMENTS, UNITS, UNIT, BRANCHES, TEAM_UNIT, unitOf, deptOfUnit, isBasicScience, unitsForRole, guessUnit, cleanDept, unitLabel, deptLabel,
};
