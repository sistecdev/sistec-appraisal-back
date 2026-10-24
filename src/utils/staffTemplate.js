// The appraisal forms for the Admin, Placement, Admission, Training and HR
// teams, as data — each field as it is on the printed form. The screen, the PDF and
// the Word file are all built from this.
//
// Who fills what:
//   basic details, function-specific assessment, self-rating, the three
//   questions                                         — the employee
//   appraiser's rating and comments, strengths, training, notes, the
//   personality matrix ("To be filled by HOD / Appraiser") — whoever gives
//                                                       the marks (flow.js)
//   comments                                          — the later steps
// The employee never sees what the reviewers write.

const STAFF_FORMS = ['admin_team', 'placement_team', 'admission_team', 'training_team', 'hr', 'hr_team'];
const isStaffForm = (formFor) => STAFF_FORMS.includes(formFor);

const BASIC_FIELDS = [
  { key: 'name', label: 'Name of Employee' },
  { key: 'designation', label: 'Designation' },
  { key: 'dateOfBirth', label: 'Date of Birth' },
  { key: 'dateOfJoining', label: 'Date of Joining' },
  { key: 'institute', label: 'Institute' },
  { key: 'hodName', label: 'Name of HOD' },
];

// Function-specific assessment. `pairs`: label/value boxes two to a row, as
// printed; `wide` boxes take the whole row. {fromLabel} / {fromDate} are the
// first day of the appraisal period ("1st July 2024" / "01.07.2024").
const FUNCTION = {
  admin_team: null,
  // No printed Training form was given: it uses the common team format
  // (basic details, competencies, the three questions) without a
  // function-specific block, like the Admin form.
  training_team: null,
  placement_team: {
    title: 'Function-Specific Assessment for Placement Cell',
    kind: 'pairs',
    fields: [
      { key: 'drives', label: 'No. of On-campus placement drives conducted by you' },
      { key: 'highestPackage', label: 'Highest package of the year' },
      { key: 'offerLetters', label: 'No. of Offer Letters generated' },
      { key: 'averagePackage', label: 'Average package of the year' },
      { key: 'selections', label: 'Total head count of selections' },
      { key: 'newBrands', label: 'New brands added by you this year' },
    ],
  },
  hr: {
    title: 'Function-Specific Assessment for HR Department ({fromLabel} onwards)',
    kind: 'pairs',
    fields: [
      { key: 'onboardedAdmin', label: 'No. of employees on boarded (Admin)' },
      { key: 'trainingPrograms', label: 'No. of training programs conducted (with details)' },
      { key: 'onboardedTeaching', label: 'No. of employees on boarded (Teaching/ Training)' },
      { key: 'employeesTrained', label: 'No. of employees trained' },
      { key: 'resignations', label: 'No. of resignations' },
      { key: 'retention', label: 'Retention Ratio (% Employees retained from Total no. of employees as on {fromDate})' },
      { key: 'costSaving', label: 'Cost Saving Initiatives via process of Salary Negotiation', wide: true },
    ],
  },
  admission_team: {
    title: 'Function-Specific Assessment for Admission Cell',
    kind: 'years',
    // Two years (the period's first and last), each "No." and "%".
    // `na` lists the boxes printed as "-- NA --".
    rows: [
      { key: 'target', label: 'Admission Target', na: ['y1Pct', 'y2Pct'] },
      { key: 'admitted', label: 'Admitted', na: [] },
      { key: 'above70', label: 'Students above 70% marks in XII', na: ['y1No', 'y1Pct'] },
      { key: 'hostel', label: 'Hostel admissions', na: [] },
      { key: 'secondYear', label: 'Reached 2nd year', na: ['y2No'] },
      { key: 'withBrokerage', label: 'With Brokerage', na: [] },
      { key: 'withoutBrokerage', label: 'Without  Brokerage', na: [] },
    ],
    cells: ['y1No', 'y1Pct', 'y2No', 'y2Pct'],
    after: { key: 'newArea', label: 'New area developed in the current year:' },
  },
};

const RATING_NOTE = {
  admin_team: 'Please enter your grade from 0 to 10 (NA – for Not Applicable)',
  placement_team: 'Please enter your grade from 0 to 10 (NA – for Not Applicable)',
  hr: 'Please enter your grade from 0 to 10 (NA – for Not Applicable)',
  admission_team: 'Please enter your rating from 0 to 10 (NA – for Not Applicable)',
  training_team: 'Please enter your grade from 0 to 10 (NA – for Not Applicable)',
};
// The HR Team fill the same form as HR.
FUNCTION.hr_team = FUNCTION.hr;
RATING_NOTE.hr_team = RATING_NOTE.hr;

const COMPETENCIES = [
  'Subject / Technical Knowledge', 'Quality of work and Consistency', 'Interpersonal Communication', 'Problem Solving Attitude',
  'Working in Group/ Team', 'Honesty & Integrity', 'Creativity/ Doing things differently', 'Commitment towards Goals',
  'Time Management', 'Appearance & Professional Conduct',
];

const QUESTIONS_NOTE = 'Please answer the following questions in details. (English/ Hindi)';
const QUESTIONS = [
  {
    key: 'achievements', kind: 'abc',
    label: 'What do you consider your most important three achievements of the past year?',
    hindi: 'अपनी पिछले वर्ष की कोई तीन महत्त्वपूर्ण उपलब्धियां साझा करें।',
  },
  {
    key: 'additionalRole', kind: 'abc',
    label: 'What kind of additional role/ responsibilities did you propose to handle in the previous year? Have you complied with the same?',
    hindi: 'अपने वर्त्तमान कार्यक्षेत्र के अतिरिक्त पिछले वर्ष में आपने किस क्षेत्र में कार्य करना प्रस्तावित किया था? क्या आपने उसे निष्पादित किया है?',
  },
  {
    key: 'trainedStaff', kind: 'trained',
    label: 'Give any three staff members name you have trained in last one year, also mention the skill imparted.',
    hindi: 'कोई तीन स्टाफ मेंबर्स का नाम बताएं जिन्हे पिछले वर्ष आपके द्वारा ट्रैनिंग दी गई एवं उस कौशल का उल्लेख करें I',
  },
];

const APPRAISER_TITLE = 'To be filled by HOD/ Appraiser';
const REVIEW_QUESTIONS = [
  { key: 'strengths', label: 'According to you, what are the key strengths of the employee and positive aspects about his/ her performance?' },
  { key: 'training', label: 'Please mention any specific training required for employee’s personal and professional development:' },
  { key: 'comments', label: 'Any specific note/ comments-' },
];

const QUADRANTS = ['Q1', 'Q2', 'Q3', 'Q4'];

/* ───────────────────────── blank forms ───────────────────────── */

const blankFunction = (formFor) => {
  const f = FUNCTION[formFor];
  if (!f) return {};
  if (f.kind === 'pairs') return Object.fromEntries(f.fields.map((x) => [x.key, '']));
  return {
    ...Object.fromEntries(f.rows.map((r) => [r.key, Object.fromEntries(f.cells.map((c) => [c, '']))])),
    [f.after.key]: '',
  };
};

const blankSelf = (formFor) => ({
  basic: Object.fromEntries(BASIC_FIELDS.map((f) => [f.key, ''])),
  function: blankFunction(formFor),
  selfRatings: COMPETENCIES.map(() => ''),
  achievements: ['', '', ''],
  additionalRole: ['', '', ''],
  trainedStaff: [0, 1, 2].map(() => ({ name: '', skill: '' })),
});

const blankReview = () => ({
  competencies: COMPETENCIES.map(() => ({ rating: '', comment: '' })),
  ...Object.fromEntries(REVIEW_QUESTIONS.map((q) => [q.key, ''])),
  quadrant: '',
});

/* ─────────────────────────── cleaning ─────────────────────────── */

const str = (v, max = 2000) => String(v ?? '').slice(0, max);
// A rating is 0–10 or "NA"; anything else is left blank.
const rating = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  if (String(v).trim().toUpperCase() === 'NA') return 'NA';
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n * 10) / 10)) : '';
};

const cleanSelf = (raw = {}, formFor) => {
  const out = blankSelf(formFor);
  BASIC_FIELDS.forEach((f) => { out.basic[f.key] = str(raw.basic?.[f.key], 300); });
  const f = FUNCTION[formFor];
  if (f?.kind === 'pairs') f.fields.forEach((x) => { out.function[x.key] = str(raw.function?.[x.key], 1000); });
  if (f?.kind === 'years') {
    f.rows.forEach((r) => f.cells.forEach((c) => { out.function[r.key][c] = r.na.includes(c) ? '' : str(raw.function?.[r.key]?.[c], 40); }));
    out.function[f.after.key] = str(raw.function?.[f.after.key], 2000);
  }
  out.selfRatings = COMPETENCIES.map((_, i) => rating(raw.selfRatings?.[i]));
  out.achievements = [0, 1, 2].map((i) => str(raw.achievements?.[i], 2000));
  out.additionalRole = [0, 1, 2].map((i) => str(raw.additionalRole?.[i], 2000));
  out.trainedStaff = [0, 1, 2].map((i) => ({ name: str(raw.trainedStaff?.[i]?.name, 200), skill: str(raw.trainedStaff?.[i]?.skill, 500) }));
  return out;
};

const cleanReview = (raw = {}, current = blankReview()) => {
  const out = { ...blankReview(), ...current };
  out.competencies = COMPETENCIES.map((_, i) => ({
    rating: rating(raw.competencies?.[i]?.rating ?? current.competencies?.[i]?.rating),
    comment: str(raw.competencies?.[i]?.comment ?? current.competencies?.[i]?.comment, 1000),
  }));
  REVIEW_QUESTIONS.forEach((q) => { out[q.key] = str(raw[q.key] ?? current[q.key], 5000); });
  const q = raw.quadrant ?? current.quadrant;
  out.quadrant = QUADRANTS.includes(q) ? q : '';
  return out;
};

// The appraiser's ratings, out of 10 for each one rated (NA leaves it out).
const totals = (review = blankReview()) => {
  const rated = (review.competencies || []).filter((c) => c.rating !== '' && c.rating !== 'NA');
  const total = Math.round(rated.reduce((n, c) => n + Number(c.rating || 0), 0) * 100) / 100;
  const totalMax = rated.length * 10 || COMPETENCIES.length * 10;
  return { total, totalMax, percent: Math.round((total / totalMax) * 10000) / 100 };
};

// "{fromLabel}" / "{fromDate}" → the period's first day.
const ORD = (d) => (d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fillPeriod = (text, cycle) => String(text || '')
  .replace('{fromLabel}', `1${ORD(1)} ${MONTHS[(cycle?.from?.month || 1) - 1]} ${cycle?.from?.year || ''}`)
  .replace('{fromDate}', `01.${String(cycle?.from?.month || 1).padStart(2, '0')}.${cycle?.from?.year || ''}`);

const template = () => ({
  STAFF_FORMS, BASIC_FIELDS, FUNCTION, RATING_NOTE, COMPETENCIES, QUESTIONS_NOTE, QUESTIONS, APPRAISER_TITLE, REVIEW_QUESTIONS, QUADRANTS,
});

module.exports = {
  STAFF_FORMS, isStaffForm, BASIC_FIELDS, FUNCTION, RATING_NOTE, COMPETENCIES, QUESTIONS_NOTE, QUESTIONS, APPRAISER_TITLE, REVIEW_QUESTIONS, QUADRANTS,
  blankSelf, blankReview, cleanSelf, cleanReview, totals, fillPeriod, template,
};
