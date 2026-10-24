// The SISTec Faculty and HOD Appraisal format, as data: every section, table,
// question and score of the printed form, in its order. The form on screen,
// the marks and the downloaded Word file are all built from this one
// description, so they cannot drift apart.
//
// Who fills what:
//   Section A (self appraisal)              — the faculty member / HOD being appraised
//   Supporting details for Section B         — the appraisee (the rows HOD marks against)
//   Section B points (HOD Feedback a–j included), its questions, Section C
//                                            — the HOD (the Principal, for an HOD's own form)
//   Comments                                 — the Principal, Director … (utils/flow.js)
// The appraisee never sees anything the reviewers write.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const BASIC_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'qualification', label: 'Qualification' },
  { key: 'designation', label: 'Designation' },
  { key: 'department', label: 'Department' },
  { key: 'institute', label: 'Institute' },
  { key: 'dateOfJoining', label: 'Date of joining SGI' },
  { key: 'expIndustrial', label: 'Professional Experience — Industrial' },
  { key: 'expTeaching', label: 'Professional Experience — Teaching' },
  { key: 'expResearch', label: 'Professional Experience — Research' },
];

// PART-2: Academic activities — tables of rows.
const SECTION_A_TABLES = [
  {
    key: 'qualificationUpgrade', title: 'Qualification up-gradation', dated: true,
    columns: [
      { key: 'college', label: 'College / University' },
      { key: 'degree', label: 'Name of Degree (FT/PT)' },
      { key: 'dateOfJoining', label: 'Date of Joining' },
      { key: 'awardDate', label: 'Actual / Expected Date of Award' },
    ],
  },
  {
    key: 'certifications', title: 'Skill Based Certifications', dated: true,
    columns: [
      { key: 'agency', label: 'Certifying Agency' },
      { key: 'title', label: 'Title' },
      { key: 'duration', label: 'Duration' },
      { key: 'level', label: 'Level, if any' },
    ],
  },
  {
    key: 'participation', title: 'Participation in STTP, workshop, seminar, symposium, conference, training etc', dated: true,
    hodTitle: 'Participation in STTP, Industrial Visit, Workshop, Seminar, Symposium, Conference, Training etc',
    columns: [
      { key: 'nature', label: 'Nature of activity' },
      { key: 'organizedBy', label: 'Organized by' },
      { key: 'duration', label: 'Duration' },
    ],
  },
  {
    key: 'supervision', title: 'Academic supervisory work (UG/PG/PhD project guidance)',
    columns: [
      { key: 'degree', label: 'Degree' },
      { key: 'students', label: 'Name(s) of student(s)' },
      { key: 'title', label: 'Title of the project' },
      { key: 'status', label: 'Current status' },
      { key: 'publication', label: 'Any Publication Relevant to the work' },
    ],
  },
  {
    key: 'lectures', title: 'Special lectures delivered (STTP, workshop, seminars, conferences etc)', dated: true,
    columns: [
      { key: 'dates', label: 'Date(s)' },
      { key: 'hours', label: 'No. of hours' },
      { key: 'organization', label: 'Organization / institution' },
      { key: 'programme', label: 'Type of programme' },
    ],
  },
  {
    // On the HOD form only, inside PART-2.
    key: 'newLabs', title: 'Development of New Department Laboratory / Centre / Experimental setup etc', only: ['hod'],
    columns: [
      { key: 'activity', label: 'Details of activity' },
      { key: 'nature', label: 'Nature of work' },
      { key: 'status', label: 'Current status' },
    ],
  },
  {
    key: 'memberships', title: 'Details of ACTIVE Professional Memberships',
    columns: [
      { key: 'society', label: 'Name of Society' },
      { key: 'type', label: 'Type of Membership' },
      { key: 'number', label: 'Membership No.' },
    ],
  },
  {
    key: 'achievements', title: 'Details of special achievements & awards', dated: true,
    columns: [
      { key: 'title', label: 'Title of Achievement / Award' },
      { key: 'awardedBy', label: 'Awarded By (Organization)' },
      { key: 'date', label: 'Date of Award' },
    ],
  },
];

// The PART-2 tables of one form, with that form's titles.
const sectionATablesFor = (formFor) => SECTION_A_TABLES
  .filter((t) => !t.only || t.only.includes(formFor))
  .map((t) => ({ ...t, title: (formFor === 'hod' && t.hodTitle) || t.title }));

// HOD form only, after PART-1 — filled in by the HOD.
const HOD_FUNCTION = {
  title: 'Function-specific Assessment: Head of the Department',
  rows: [
    { label: 'Average % Attendance', fields: [{ key: 'attendanceOdd', label: 'Odd Sem' }, { key: 'attendanceEven', label: 'Even Sem' }] },
    { label: 'RGPV Result', fields: [{ key: 'rgpvOdd', label: 'Odd Sem' }, { key: 'rgpvEven', label: 'Even Sem' }] },
    { label: '% Placement of your department', fields: [{ key: 'placement', label: '' }] },
  ],
};
const HOD_FUNCTION_KEYS = HOD_FUNCTION.rows.flatMap((r) => r.fields.map((f) => f.key));

const SECTION_A_TEXTS = [
  { key: 'otherInfo', title: 'Any other relevant information (regarding service to college, academic work, professional development & service to community)' },
  { key: 'administrative', part: 'PART-3: ADMINISTRATIVE ACTIVITIES', title: 'Please give details of administrative responsibilities taken up by you' },
];

// PART-4: three answers each.
const QUESTIONS = [
  { key: 'achievementsTop', label: '1. What do you consider your most important three achievements of the past year?' },
  { key: 'aims', label: '2. What do you consider your most important three aims and tasks in the next year?' },
  { key: 'roles', label: '3. What kind of additional role / responsibilities you would be interested to handle in future?' },
];

// Teaching effectiveness: the faculty writes a supporting statement for
// each; whoever gives the marks scores them (HOD Feedback, 100 max — the
// Principal Feedback on an HOD's own form).
const TEACHING_ITEMS = [
  { key: 'a', label: 'Effective class room management' },
  { key: 'b', label: 'Course material, teaching aids for class handling, Assessment plan' },
  { key: 'c', label: 'Extent of syllabus coverage (based on class notes of students)' },
  { key: 'd', label: 'Assignments / tutorials / seminar' },
  { key: 'e', label: 'Course plan, model question paper, evaluation pattern etc' },
  { key: 'f', label: 'Test question papers quality' },
  { key: 'g', label: 'No. of hours handled / guest lecture' },
  { key: 'h', label: 'Guiding student projects' },
  { key: 'i', label: 'Mentoring to students (such as helping students to present papers / participate in competitions outside the college)' },
  { key: 'j', label: 'Indirect feedback from students through PT meeting and class committee meeting' },
].map((t) => ({ ...t, max: 10 }));

// Rows the appraisee lists so the reviewer can mark against them.
const DETAIL_TABLES = {
  labDevelopment: {
    title: 'Development of New Department Laboratory / Centre / Experimental setup etc',
    columns: [{ key: 'activity', label: 'Details of Activity' }, { key: 'nature', label: 'Nature of work' }, { key: 'status', label: 'Current Status' }],
  },
  studentActivities: {
    title: 'Mentored and accompanied students for activities outside the college (Workshop / symposium / seminar / Competitions)',
    columns: [
      { key: 'activity', label: 'Activity' }, { key: 'title', label: 'Title of activity' }, { key: 'duration', label: 'Duration' },
      { key: 'level', label: 'Local / national' }, { key: 'participants', label: 'No. of participants' }, { key: 'sponsors', label: 'Sponsors, if any' },
    ],
  },
  advisorActivities: {
    title: 'Association as Faculty advisor / Professional body activity',
    columns: [{ key: 'nature', label: 'Nature of activity' }, { key: 'organizedBy', label: 'Organized by' }, { key: 'duration', label: 'Duration' }],
  },
  adminWork: {
    title: 'Administrative work assigned by Principal / Management',
    columns: [{ key: 'work', label: 'Administrative Work Assigned' }, { key: 'details', label: 'Details of Work' }, { key: 'outcome', label: 'Outcome' }],
  },
  coordinatorRoles: {
    title: 'Advisor / Coordinator roles (NSS / NCC / NPTEL / IIC / UBA / MSME etc.)',
    columns: [{ key: 'role', label: 'Role / body' }, { key: 'details', label: 'Details of work' }, { key: 'duration', label: 'Duration' }],
  },
  placementSupport: {
    title: 'Placement / competitive exam preparation support',
    columns: [{ key: 'activity', label: 'Activity' }, { key: 'details', label: 'Details' }, { key: 'duration', label: 'Duration' }],
  },
  admissions: {
    title: 'Contribution in Admissions',
    columns: [{ key: 'details', label: 'Details of contribution' }, { key: 'outcome', label: 'Outcome (e.g. admissions brought)' }],
  },
  placements: {
    title: 'Contribution in Placements',
    columns: [{ key: 'details', label: 'Details of contribution' }, { key: 'outcome', label: 'Outcome (e.g. students placed)' }],
  },
  funds: {
    title: 'Fund generation',
    columns: [
      { key: 'nature', label: 'Nature of activity' }, { key: 'agency', label: 'Concerned agency' },
      { key: 'fund', label: 'Fund generated / applied / sanctioned' }, { key: 'status', label: 'Current status of activity' },
    ],
  },
  industrialTraining: {
    title: 'Industrial Training Imparted',
    columns: [{ key: 'company', label: 'Nature of Company' }, { key: 'work', label: 'Work details' }, { key: 'duration', label: 'Duration' }],
  },
  consultancy: {
    title: 'Consultancy work',
    columns: [{ key: 'company', label: 'Nature of Company' }, { key: 'work', label: 'Work details' }, { key: 'duration', label: 'Duration' }],
  },
  papers: {
    title: 'Paper Publications',
    columns: [
      { key: 'title', label: 'Title of the paper' }, { key: 'coauthors', label: 'Co-author(s) if any' },
      { key: 'journal', label: 'Name of the Journal / conference & Publisher' }, { key: 'volNo', label: 'Vol & No' },
      { key: 'monthYear', label: 'Month & Year' }, { key: 'level', label: 'National / International' },
    ],
  },
};

// SECTION-B: the reviewer's points. RGPV result and student feedback are
// four subject rows each — the faculty writes the subject and the %, the
// reviewer gives the points; everything else is one score per item.
const RESULT_ROWS = ['a) Odd Sem', 'b) Odd Sem', 'c) Even Sem', 'd) Even Sem'];
const RESULT_KEYS = ['rgpv', 'feedback'];

const SECTION_B = [
  {
    key: 'academic', title: 'I. Academic activities', max: 900,
    parts: [
      { key: 'rgpv', title: 'RGPV Result', max: 400, rows: true, valueLabel: '% Result' },
      { key: 'feedback', title: 'Student Feedback', max: 400, rows: true, valueLabel: '% Feedback' },
      { key: 'principalFeedback', title: 'HOD Feedback', max: 100, principal: true },
    ],
  },
  {
    key: 'service', title: '2. Service to College', max: 250,
    parts: [
      {
        // As printed: 80 max, though its five items are 20 each.
        key: 'curricular', title: 'I. Curricular & Co-curricular', max: 80,
        items: [
          { key: 'studentMentoring', label: 'a) Student mentoring', max: 20 },
          { key: 'labInCharge', label: 'b) Lab / Centre In charge', max: 20, details: 'labDevelopment' },
          { key: 'studentActivities', label: 'c) Mentored and Accompanied students for activities outside the college', max: 20, details: 'studentActivities' },
          { key: 'facultyAdvisor', label: 'd) Association as Faculty advisor / Professional body activity', max: 20, details: 'advisorActivities' },
          { key: 'adminWork', label: 'e) Administrative work assigned by Principal / Management', max: 20, details: 'adminWork' },
        ],
      },
      {
        key: 'extra', title: 'II. Extra-curricular', max: 50,
        items: [
          { key: 'advisorCoordinator', label: 'a) Advisor / Coordinator (like NSS / NCC / NPTEL / IIC / UBA / MSME)', max: 25, details: 'coordinatorRoles' },
          { key: 'placementSupport', label: 'b) Placement / competitive exam preparation support', max: 25, details: 'placementSupport' },
        ],
      },
      {
        key: 'contribution', title: 'III. Contribution', max: 100,
        items: [
          { key: 'admissions', label: 'Contribution in Admissions', max: 50, details: 'admissions' },
          { key: 'placements', label: 'Contribution in Placements', max: 50, details: 'placements' },
        ],
      },
    ],
  },
  {
    key: 'research', title: 'III. Research activities', max: 100,
    parts: [
      { key: 'fund', title: 'I. Fund generation', max: 30, items: [{ key: 'funds', label: 'Fund generation', max: 30, details: 'funds' }] },
      {
        key: 'outreach', title: 'II. Outreach Activities', max: 40,
        items: [
          { key: 'industrialTraining', label: 'a) Industrial Training Imparted', max: 20, details: 'industrialTraining' },
          { key: 'consultancy', label: 'b) Consultancy work', max: 20, details: 'consultancy' },
        ],
      },
      {
        key: 'publications', title: 'III. Paper Publications', max: 30, details: 'papers',
        items: [
          { key: 'papersNational', label: 'a) Papers — National Conference / Journal', max: 10 },
          { key: 'papersInternational', label: 'b) Papers — International Conference / Journal', max: 20 },
        ],
      },
    ],
  },
];

const REVIEW_QUESTIONS = [
  { key: 'strengths', label: 'According to you, what are the key strengths of the employee and positive aspects about his / her performance?' },
  { key: 'training', label: 'Please mention any specific training required for employee\'s personal and professional development' },
  { key: 'comments', label: 'Any specific note / comments' },
];

// SECTION-C
const COMPETENCIES = [
  'Subject / Technical Knowledge', 'Quality of work and Consistency', 'Interpersonal Communication', 'Problem Solving Attitude',
  'Working in Group / Team', 'Honesty & Integrity', 'Creativity & Innovation', 'Commitment towards Goals',
  'Time Management', 'Appearance & Professional Conduct',
];

const QUADRANTS = [
  { key: 'Q1', label: 'Q-1: Low capability, low willingness' },
  { key: 'Q2', label: 'Q-2: High capability, low willingness' },
  { key: 'Q3', label: 'Q-3: Low capability, high willingness' },
  { key: 'Q4', label: 'Q-4: High capability, high willingness' },
];

const SECTION_B_MAX = SECTION_B.reduce((n, g) => n + g.max, 0); // 1250
const SECTION_C_MAX = COMPETENCIES.length * 10; // 100

/* ───────────────────────── blank forms ───────────────────────── */

const blankRow = (columns) => Object.fromEntries(columns.map((c) => [c.key, '']));

const blankSelf = () => ({
  basic: Object.fromEntries(BASIC_FIELDS.map((f) => [f.key, ''])),
  hodFunction: Object.fromEntries(HOD_FUNCTION_KEYS.map((k) => [k, ''])),
  ...Object.fromEntries(SECTION_A_TABLES.map((t) => [t.key, []])),
  ...Object.fromEntries(SECTION_A_TEXTS.map((t) => [t.key, ''])),
  ...Object.fromEntries(QUESTIONS.map((q) => [q.key, ['', '', '']])),
  note: '',
  teaching: Object.fromEntries(TEACHING_ITEMS.map((t) => [t.key, ''])),
  details: Object.fromEntries(Object.keys(DETAIL_TABLES).map((k) => [k, []])),
  // Section B's RGPV result / student feedback rows: subject and %.
  results: Object.fromEntries(RESULT_KEYS.map((k) => [k, RESULT_ROWS.map(() => ({ subject: '', percent: '' }))])),
});

const allItems = () => SECTION_B.flatMap((g) => g.parts.flatMap((p) => p.items || []));

const blankReview = () => ({
  rgpv: RESULT_ROWS.map((label) => ({ label, subject: '', percent: '', points: '' })),
  feedback: RESULT_ROWS.map((label) => ({ label, subject: '', percent: '', points: '' })),
  points: Object.fromEntries(allItems().map((i) => [i.key, ''])),
  principalFeedback: Object.fromEntries(TEACHING_ITEMS.map((t) => [t.key, ''])),
  ...Object.fromEntries(REVIEW_QUESTIONS.map((q) => [q.key, ''])),
  competencies: COMPETENCIES.map(() => ({ rating: '', comment: '' })),
  quadrant: '',
});

/* ─────────────────────────── cleaning ─────────────────────────── */

const str = (v, max = 2000) => String(v ?? '').slice(0, max);
const cleanRows = (rows, columns, limit = 40) => (Array.isArray(rows) ? rows : [])
  .slice(0, limit)
  .map((r) => Object.fromEntries(columns.map((c) => [c.key, str(r?.[c.key], 500)])))
  .filter((r) => Object.values(r).some((v) => v.trim()));

// What the appraisee may save — nothing outside their own part.
const cleanSelf = (raw = {}) => {
  const out = blankSelf();
  BASIC_FIELDS.forEach((f) => { out.basic[f.key] = str(raw.basic?.[f.key], 300); });
  HOD_FUNCTION_KEYS.forEach((k) => { out.hodFunction[k] = str(raw.hodFunction?.[k], 200); });
  SECTION_A_TABLES.forEach((t) => { out[t.key] = cleanRows(raw[t.key], t.columns); });
  SECTION_A_TEXTS.forEach((t) => { out[t.key] = str(raw[t.key], 5000); });
  QUESTIONS.forEach((q) => { out[q.key] = [0, 1, 2].map((i) => str(raw[q.key]?.[i], 1000)); });
  out.note = str(raw.note, 3000);
  TEACHING_ITEMS.forEach((t) => { out.teaching[t.key] = str(raw.teaching?.[t.key], 3000); });
  Object.entries(DETAIL_TABLES).forEach(([k, t]) => { out.details[k] = cleanRows(raw.details?.[k], t.columns); });
  RESULT_KEYS.forEach((k) => {
    out.results[k] = RESULT_ROWS.map((_, i) => ({ subject: str(raw.results?.[k]?.[i]?.subject, 200), percent: score(raw.results?.[k]?.[i]?.percent, 100) }));
  });
  return out;
};

// One RGPV result / student feedback row as filled: the faculty's subject
// and % (older forms had the reviewer write them) with the reviewer's points.
const resultRow = (self, review, key, i) => {
  const mine = self?.results?.[key]?.[i] || {};
  const old = review?.[key]?.[i] || {};
  const has = (v) => v !== '' && v !== null && v !== undefined;
  return {
    label: RESULT_ROWS[i],
    subject: has(mine.subject) ? mine.subject : old.subject ?? '',
    percent: has(mine.percent) ? mine.percent : old.percent ?? '',
    points: old.points ?? '',
  };
};

const score = (v, max) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return Math.max(0, Math.min(max, Math.round(n * 100) / 100));
};

// What a reviewer may save. The subject and % of the result / feedback rows
// are the faculty's (kept as they were on older forms); the reviewer gives
// their points.
const cleanReview = (raw = {}, current = blankReview(), { principal = false } = {}) => {
  const out = { ...blankReview(), ...current };
  RESULT_KEYS.forEach((k) => {
    out[k] = RESULT_ROWS.map((label, i) => ({
      label,
      subject: str(current[k]?.[i]?.subject, 200),
      percent: score(current[k]?.[i]?.percent, 100),
      points: score(raw[k]?.[i]?.points ?? current[k]?.[i]?.points, 100),
    }));
  });
  out.points = Object.fromEntries(allItems().map((i) => [i.key, score(raw.points?.[i.key] ?? current.points?.[i.key], i.max)]));
  if (principal) {
    out.principalFeedback = Object.fromEntries(TEACHING_ITEMS.map((t) => [t.key, score(raw.principalFeedback?.[t.key] ?? current.principalFeedback?.[t.key], t.max)]));
  }
  REVIEW_QUESTIONS.forEach((q) => { out[q.key] = str(raw[q.key] ?? current[q.key], 5000); });
  out.competencies = COMPETENCIES.map((_, i) => ({
    rating: score(raw.competencies?.[i]?.rating ?? current.competencies?.[i]?.rating, 10),
    comment: str(raw.competencies?.[i]?.comment ?? current.competencies?.[i]?.comment, 1000),
  }));
  const q = raw.quadrant ?? current.quadrant;
  out.quadrant = QUADRANTS.some((x) => x.key === q) ? q : '';
  return out;
};

/* ──────────────────────────── marks ──────────────────────────── */

const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v) || 0);
const r2 = (n) => Math.round(n * 100) / 100;

const totals = (review = blankReview()) => {
  const groups = {};
  for (const g of SECTION_B) {
    let groupSum = 0;
    for (const p of g.parts) {
      let partSum;
      if (p.rows) partSum = (review[p.key] || []).reduce((n, r) => n + num(r.points), 0);
      else if (p.principal) partSum = TEACHING_ITEMS.reduce((n, t) => n + num(review.principalFeedback?.[t.key]), 0);
      else partSum = p.items.reduce((n, i) => n + Math.min(i.max, num(review.points?.[i.key])), 0);
      groupSum += Math.min(p.max, partSum);
    }
    groups[g.key] = r2(Math.min(g.max, groupSum));
  }
  const sectionB = r2(Object.values(groups).reduce((n, v) => n + v, 0));
  const sectionC = r2((review.competencies || []).reduce((n, c) => n + Math.min(10, num(c.rating)), 0));
  const total = r2(sectionB + sectionC);
  return {
    ...groups,
    sectionB, sectionBMax: SECTION_B_MAX, sectionBPercent: r2((sectionB / SECTION_B_MAX) * 100),
    sectionC, sectionCMax: SECTION_C_MAX, sectionCPercent: r2((sectionC / SECTION_C_MAX) * 100),
    total, totalMax: SECTION_B_MAX + SECTION_C_MAX, percent: r2((total / (SECTION_B_MAX + SECTION_C_MAX)) * 100),
  };
};

const periodLabel = (from, to) => `${MONTHS[(from?.month || 1) - 1]} ${from?.year} to ${MONTHS[(to?.month || 1) - 1]} ${to?.year}`;

const template = () => ({
  MONTHS, BASIC_FIELDS, SECTION_A_TABLES, SECTION_A_TEXTS, HOD_FUNCTION, QUESTIONS, TEACHING_ITEMS, DETAIL_TABLES,
  RESULT_ROWS, SECTION_B, REVIEW_QUESTIONS, COMPETENCIES, QUADRANTS, SECTION_B_MAX, SECTION_C_MAX,
});

module.exports = {
  MONTHS, BASIC_FIELDS, SECTION_A_TABLES, SECTION_A_TEXTS, HOD_FUNCTION, sectionATablesFor, QUESTIONS, TEACHING_ITEMS, DETAIL_TABLES,
  RESULT_ROWS, SECTION_B, REVIEW_QUESTIONS, COMPETENCIES, QUADRANTS, SECTION_B_MAX, SECTION_C_MAX,
  blankSelf, blankReview, blankRow, cleanSelf, cleanReview, resultRow, totals, periodLabel, template,
};
