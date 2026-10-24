const T = require('./appraisalTemplate');
const S = require('./staffTemplate');
const { flowFor } = require('./flow');

// One filled appraisal as a list of plain blocks — titles, headings,
// paragraphs, tables — in the order of the printed format of its form. The
// Word file (appraisalDocx.js) and the PDF (appraisalPdf.js) both draw from
// this list, so the two always carry exactly the same content.
//
//   { t: 'title', text }             { t: 'heading', text }
//   { t: 'sub', text }               { t: 'para', text, bold, italics, center }
//   { t: 'table', headers, rows, shares }   (headers null = no header row)
//   { t: 'space' }

const FORM_TITLE = {
  faculty: 'Faculty Appraisal', hod: 'HOD Appraisal', admin_team: 'Admin Team Appraisal',
  placement_team: 'Placement Team Appraisal', admission_team: 'Admission Team Appraisal', training_team: 'Training Team Appraisal',
  hr: 'HR Appraisal',
};

// The form's steps (copied onto it when released; worked out for an older form).
const stepsOf = (appraisal) => (appraisal.steps?.length ? appraisal.steps : flowFor(appraisal.formFor, appraisal));
// Who gives the marks on this form: "HOD", "Principal", "GM" …
const marksByOf = (appraisal) => stepsOf(appraisal).find((x) => x.mode === 'marks')?.label || 'Appraiser';

const shown = (v) => (v === '' || v === null || v === undefined ? '' : String(v));
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—');

const builder = () => {
  const b = [];
  return {
    b,
    para: (text, opts = {}) => b.push({ t: 'para', text: shown(text), ...opts }),
    table: (headers, rows, shares) => b.push({ t: 'table', headers, rows: rows.map((r) => r.map(shown)), shares }),
  };
};

const matrix = ({ b, para, table }, review) => {
  b.push({ t: 'sub', text: 'Personality matrix of the Assesse (BEST-FIT quadrant)' });
  const mark = (q) => (review.quadrant === q ? `${q.replace('Q', 'Q-')}  [selected]` : q.replace('Q', 'Q-'));
  table(['', 'Capability: LOW', 'Capability: HIGH'], [
    ['Willingness: HIGH', mark('Q3'), mark('Q4')],
    ['Willingness: LOW', mark('Q1'), mark('Q2')],
  ], [3, 3, 3]);
  if (!review.quadrant) para('Not marked', { italics: true });
};

// The comments of each step and the sign-off at the end of every form.
const closing = ({ b, para, table }, appraisal) => {
  const steps = stepsOf(appraisal);
  steps.filter((x) => x.mode === 'comment').forEach((x) => {
    b.push({ t: 'sub', text: `${x.label}’s comment` });
    para(x.comment || '—');
  });
  b.push({ t: 'space' });
  const self = appraisal.self || {};
  const heads = ['Employee', ...steps.map((x) => x.label)];
  const cells = [
    `${self.basic?.name || ''}\nSubmitted: ${day(appraisal.submittedAt)}`,
    ...steps.map((x) => `${x.doneByName || ''}\n${x.mode === 'marks' ? 'Marked' : 'Commented'}: ${day(x.doneAt)}`),
  ];
  table(heads, [cells], heads.map(() => 1));
};

/* ─────────────────────── Faculty and HOD forms ─────────────────────── */

const academicBlocks = (ctx, appraisal, cycle) => {
  const { b, para, table } = ctx;
  const formFor = appraisal.formFor || cycle.formFor;
  const isHodForm = formFor === 'hod';
  const reviewerName = isHodForm ? 'PRINCIPAL' : 'CONCERNED HOD';
  const marksBy = marksByOf({ ...appraisal, formFor });
  const self = { ...T.blankSelf(), ...(appraisal.self || {}) };
  self.details = { ...T.blankSelf().details, ...(self.details || {}) };
  const review = { ...T.blankReview(), ...(appraisal.review || {}) };
  const tot = T.totals(review);

  b.push({ t: 'heading', text: 'SECTION-A: SELF APPRAISAL BY THE FACULTY' });
  b.push({ t: 'sub', text: 'PART-1: BASIC DETAILS' });
  table(['Particular', 'Details'], T.BASIC_FIELDS.map((f) => [f.label, self.basic?.[f.key]]), [3, 7]);

  if (isHodForm) {
    b.push({ t: 'sub', text: T.HOD_FUNCTION.title });
    table(['', 'Odd Sem', 'Even Sem'], T.HOD_FUNCTION.rows.map((r) => (r.fields.length === 2
      ? [r.label, self.hodFunction?.[r.fields[0].key], self.hodFunction?.[r.fields[1].key]]
      : [r.label, self.hodFunction?.[r.fields[0].key], ''])), [4, 3, 3]);
  }

  b.push({ t: 'sub', text: `PART-2: ACADEMIC ACTIVITIES (${T.periodLabel(cycle.from, cycle.to)})` });
  for (const t of T.sectionATablesFor(formFor)) {
    para(t.title, { bold: true });
    table(t.columns.map((c) => c.label), (self[t.key] || []).map((r) => t.columns.map((c) => r[c.key])), t.columns.map(() => 1));
  }
  for (const t of T.SECTION_A_TEXTS) {
    if (t.part) b.push({ t: 'sub', text: t.part });
    para(t.title, { bold: !t.part, italics: !!t.part });
    table(null, [[self[t.key]]], [1]);
  }

  b.push({ t: 'sub', text: 'PART-4: PLEASE RESPOND TO BELOW QUESTIONS IN BRIEF' });
  for (const q of T.QUESTIONS) {
    para(q.label, { bold: true });
    (self[q.key] || []).forEach((a, i) => para(`${'abc'[i]}) ${a || ''}`));
  }
  para('Any specific note / comments:', { bold: true });
  para(self.note);

  b.push({ t: 'heading', text: `SECTION-B: APPRAISAL RATING BY ${reviewerName}` });
  for (const g of T.SECTION_B) {
    b.push({ t: 'sub', text: `${g.title} (max. points ${g.max}) — earned ${tot[g.key]}` });
    for (const p of g.parts) {
      para(`${p.principal ? `${marksBy} Feedback` : p.title} (${p.max} max)`, { bold: true });
      if (p.rows) {
        table(['', 'Subject Title', p.valueLabel, 'Max. Score', 'Points earned'],
          T.RESULT_ROWS.map((_, i) => T.resultRow(self, review, p.key, i)).map((r) => [r.label, r.subject, r.percent, '100', r.points]), [2, 5, 2, 2, 2]);
      } else if (p.principal) {
        para('Note — faculty members elaborate each point with supporting statements.', { italics: true });
        table(['Parameter', 'Supporting statement (faculty)', 'Max. Score', 'Points earned'],
          T.TEACHING_ITEMS.map((t) => [`${t.key}) ${t.label}`, self.teaching?.[t.key], String(t.max), review.principalFeedback?.[t.key]]), [4, 5, 1, 1]);
      } else {
        table(['Item', 'Max. Score', 'Points earned'], p.items.map((i) => [i.label, String(i.max), review.points?.[i.key]]), [7, 2, 2]);
        for (const key of [...p.items.map((i) => i.details), p.details].filter(Boolean)) {
          const d = T.DETAIL_TABLES[key];
          para(d.title, { italics: true });
          table(d.columns.map((c) => c.label), (self.details?.[key] || []).map((r) => d.columns.map((c) => r[c.key])), d.columns.map(() => 1));
        }
      }
    }
  }
  b.push({ t: 'sub', text: 'III. Please answer the following questions regarding employee performance' });
  for (const q of T.REVIEW_QUESTIONS) {
    para(q.label, { bold: true });
    para(review[q.key]);
  }

  b.push({ t: 'heading', text: 'SECTION-C: APPRAISAL WITH REPORTING AUTHORITY' });
  const who = `${marksBy}’s`;
  table(['', 'Key Skills/ Competencies for Assessment', `${who} / Rating (10)`, `${who} Comments (If any)`],
    T.COMPETENCIES.map((c, i) => [String(i + 1), c, review.competencies?.[i]?.rating, review.competencies?.[i]?.comment]), [1, 5, 2, 4]);

  b.push({ t: 'sub', text: 'Summary' });
  table(['S.No', 'Section', 'Max. Marks', 'Denominator', 'Marks earned', '% Marks'], [
    ['1.', 'Section-B', tot.sectionBMax, tot.sectionBMax, tot.sectionB, `${tot.sectionBPercent}%`],
    ['2.', 'Section-C', tot.sectionCMax, tot.sectionCMax, tot.sectionC, `${tot.sectionCPercent}%`],
    ['', 'Total', tot.totalMax, tot.totalMax, tot.total, `${tot.percent}%`],
  ], [1, 3, 2, 2, 2, 2]);
  para(`Total Point out of ${tot.totalMax}: ${tot.total}`, { bold: true });
  matrix(ctx, review);
  closing(ctx, { ...appraisal, formFor, self });
};

/* ─────────────── Admin / Placement / Admission / HR team forms ─────────────── */

const staffBlocks = (ctx, appraisal, cycle) => {
  const { b, para, table } = ctx;
  const formFor = appraisal.formFor || cycle.formFor;
  const self = { ...S.blankSelf(formFor), ...(appraisal.self || {}) };
  const review = { ...S.blankReview(), ...(appraisal.review || {}) };

  const basic = S.BASIC_FIELDS;
  const rows = [];
  for (let i = 0; i < basic.length; i += 2) {
    rows.push([basic[i].label, self.basic?.[basic[i].key], basic[i + 1]?.label || '', basic[i + 1] ? self.basic?.[basic[i + 1].key] : '']);
  }
  table(null, rows, [3, 4, 3, 4]);

  const fn = S.FUNCTION[formFor];
  if (fn?.kind === 'pairs') {
    b.push({ t: 'sub', text: S.fillPeriod(fn.title, cycle) });
    const cells = [];
    const narrow = fn.fields.filter((x) => !x.wide);
    for (let i = 0; i < narrow.length; i += 2) {
      cells.push([S.fillPeriod(narrow[i].label, cycle), self.function?.[narrow[i].key], narrow[i + 1] ? S.fillPeriod(narrow[i + 1].label, cycle) : '', narrow[i + 1] ? self.function?.[narrow[i + 1].key] : '']);
    }
    fn.fields.filter((x) => x.wide).forEach((x) => cells.push([S.fillPeriod(x.label, cycle), self.function?.[x.key], '', '']));
    table(null, cells, [4, 3, 4, 3]);
  }
  if (fn?.kind === 'years') {
    b.push({ t: 'sub', text: fn.title });
    const y1 = cycle.from?.year; const y2 = cycle.to?.year;
    table(['', `${y1} No.`, `${y1} %`, `${y2} No.`, `${y2} %`], fn.rows.map((r) => [
      r.label, ...fn.cells.map((c) => (r.na.includes(c) ? '-- NA --' : self.function?.[r.key]?.[c])),
    ]), [4, 2, 2, 2, 2]);
    para(`${fn.after.label} ${shown(self.function?.[fn.after.key])}`, { bold: true });
  }

  para(S.RATING_NOTE[formFor], { bold: true });
  const by = marksByOf({ ...appraisal, formFor });
  table(['SN', 'Key Skills/ Competencies for Assessment', 'Self-Rating', `${by}’s / Rating`, `${by}’s Comments (If any)`],
    S.COMPETENCIES.map((c, i) => [String(i + 1), c, self.selfRatings?.[i], review.competencies?.[i]?.rating, review.competencies?.[i]?.comment]), [1, 5, 2, 2, 4]);

  para(S.QUESTIONS_NOTE, { bold: true });
  for (const q of S.QUESTIONS) {
    para(q.label, { bold: true });
    para(q.hindi, { italics: true });
    if (q.kind === 'abc') (self[q.key] || []).forEach((a, i) => para(`${'abc'[i]}) ${a || ''}`));
    else table(['Staff member', 'Skill imparted'], (self.trainedStaff || []).map((r) => [r.name, r.skill]), [1, 2]);
  }

  b.push({ t: 'heading', text: S.APPRAISER_TITLE });
  for (const q of S.REVIEW_QUESTIONS) {
    para(q.label, { bold: true });
    para(review[q.key]);
  }
  matrix(ctx, review);
  closing(ctx, { ...appraisal, formFor, self });
};

const buildBlocks = ({ appraisal, cycle, institute = process.env.INSTITUTE_NAME || 'Sagar Institute of Science & Technology (SISTec), Bhopal' }) => {
  const ctx = builder();
  const formFor = appraisal.formFor || cycle.formFor;
  ctx.b.push({ t: 'title', text: institute });
  ctx.b.push({ t: 'title', text: `${FORM_TITLE[formFor] || 'Appraisal'} — ${cycle.title}`, small: true });
  ctx.para(`Period: ${T.periodLabel(cycle.from, cycle.to)}`, { center: true, italics: true });
  if (S.isStaffForm(formFor)) staffBlocks(ctx, appraisal, cycle);
  else academicBlocks(ctx, appraisal, cycle);
  return { blocks: ctx.b, name: appraisal.self?.basic?.name || '', institute };
};

module.exports = { buildBlocks };
