// The two colleges on this website. Everyone signs in at the same place;
// each account belongs to one college — or to both ("ALL"): the Super Admin,
// the common HR, the GM, the Director, and the Placement and Training HODs
// (see roles.js). Each college keeps its own people and data: its forms
// never reach the other college's HOD, Principal or HR.
const COLLEGES = {
  GN: { key: 'GN', label: 'Gandhinagar', name: 'SISTec Gandhinagar', full: 'Sagar Institute of Science & Technology (SISTec), Gandhinagar, Bhopal' },
  RB: { key: 'RB', label: 'Ratibad', name: 'SISTec Ratibad', full: 'Sagar Institute of Science & Technology (SISTec), Ratibad, Bhopal' },
};
const CODES = Object.keys(COLLEGES); // ['GN', 'RB']
const ALL = 'ALL';

const collegeLabel = (c) => (c === ALL ? 'Both colleges' : COLLEGES[c]?.name || '');

// "GN", "gandhinagar", "SISTec Ratibad", "both" … → 'GN' | 'RB' | 'ALL' | ''
const cleanCollege = (v) => {
  const s = String(v || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return '';
  if (['gn', 'gandhinagar', 'sistecgn', 'sistecgandhinagar'].includes(s) || s.endsWith('gandhinagar')) return 'GN';
  if (['rb', 'ratibad', 'sistecrb', 'sistecratibad'].includes(s) || s.endsWith('ratibad')) return 'RB';
  if (['all', 'both', 'bothcolleges'].includes(s)) return ALL;
  return '';
};

// Which colleges someone may act on: both, or their own.
const scopeOf = (user) => (user?.college === ALL ? CODES : CODES.includes(user?.college) ? [user.college] : []);
const inScope = (user, college) => scopeOf(user).includes(college);
// A Mongo filter on `college` for what this person may see.
const scopeFilter = (user) => (user?.college === ALL ? {} : { college: user?.college || '__none__' });

module.exports = { COLLEGES, CODES, ALL, collegeLabel, cleanCollege, scopeOf, inScope, scopeFilter };
