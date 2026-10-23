const archiver = require('archiver');
const User = require('../models/User');
const { AppraisalCycle, Appraisal } = require('../models/Appraisal');
const T = require('../utils/appraisalTemplate');
const S = require('../utils/staffTemplate');
const { appraisalDocxBuffer } = require('../utils/appraisalDocx');
const { appraisalPdfBuffer } = require('../utils/appraisalPdf');
const { notify } = require('../services/mailer');
const { FORM_ROLES, ROLE_LABEL, isHR, isSuperAdmin, isReviewer, sameId } = require('../utils/roles');
const { COLLEGES, CODES, ALL, collegeLabel, cleanCollege } = require('../utils/colleges');
const { DEPARTMENTS, UNITS, UNIT, unitLabel } = require('../utils/org');
const { flowFor, isPersonal, routeLabel } = require('../utils/flow');

// The appraisal, start to end.
//
//   HR releases a round for one form (Faculty, HOD, Admin Team …), the period
//   it covers and the dates it is open to fill
//     → each person fills their part
//     → it goes along its path (utils/flow.js): at each step one person
//       either gives the marks or only adds a comment
//     → after the last step it is back with HR, who downloads it (PDF or Word).
//
// Faculty and HOD forms share one format (utils/appraisalTemplate.js); the
// Admin, Placement, Admission, Training and HR team forms share another
// (utils/staffTemplate.js). The appraisee never sees what reviewers write.
//
// Two colleges, GN and RB, each with its own people, HR and data: a round is
// for one college and its forms stay there. The Super Admin, the common HR,
// the GM, the Director and the Placement / Training HODs serve both.

const bad = (res, message, code = 400) => res.status(code).json({ success: false, message });
const instituteOf = (college) => COLLEGES[college]?.name || process.env.INSTITUTE_SHORT || 'SISTec';

/* ─────────────────────────────── who may act ─────────────────────────────── */

// Someone of both colleges sees both; a form common to both colleges is
// open to anyone holding the role.
const collegeMatch = (u, a) => u?.college === ALL || a?.college === ALL || u?.college === a?.college;
// A Principal / Vice Principal of one department only sees that department.
const deptMatch = (u, a) => !u?.deptKey || !a?.deptKey || u.deptKey === a.deptKey;
// HR: their own college's forms; the common HR and the Super Admin, all.
const hrSees = (u, college) => isHR(u) && (u.college === ALL || u.college === college);
const asHR = (u, a) => hrSees(u, a.college);

// May this person act at step i of this form?
const canActAt = (u, a, i) => {
  const s = a.steps?.[i];
  if (!s || sameId(a.appraisee, u)) return false;
  if (isPersonal(s)) return sameId(s.assignee, u);
  return u.role === s.role && collegeMatch(u, a) && deptMatch(u, a);
};
const atStep = (a) => a.stepIndex >= 0 && a.stepIndex < (a.steps || []).length;
const canActNow = (u, a) => atStep(a) && canActAt(u, a, a.stepIndex);
// Somewhere on this form's path (before, at or after the current step).
const onPath = (u, a) => (a.steps || []).some((_, i) => canActAt(u, a, i));

const stageLabel = (a) => {
  if (a.status === 'faculty') return 'With the appraisee';
  if (a.status === 'completed') return 'Completed — with HR';
  const s = a.steps?.[a.stepIndex];
  return s ? `With the ${s.label}` : a.status;
};

/* ─────────────────────────────── the open dates ─────────────────────────────── */

// 'YYYY-MM-DD' → that day's start in India.
const istDay = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '').slice(0, 10));
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+05:30`) : null;
};
const dayText = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '');
const windowOf = (cycle = {}, now = Date.now()) => {
  const opens = cycle.opensOn ? new Date(cycle.opensOn).getTime() : null;
  // The closing day is included, to its last minute.
  const closes = cycle.closesOn ? new Date(cycle.closesOn).getTime() + 24 * 3600 * 1000 - 1 : null;
  if (opens && now < opens) return { open: false, state: 'not-yet', note: `This form opens on ${dayText(cycle.opensOn)}` };
  if (closes && now > closes) return { open: false, state: 'closed', note: `The last date to submit was ${dayText(cycle.closesOn)} — please contact HR` };
  return { open: true, state: 'open', note: cycle.closesOn ? `Open till ${dayText(cycle.closesOn)}` : '' };
};
// A form sent back after the last date can still be corrected and sent again.
const mayFill = (a, cycle) => a.status === 'faculty' && (windowOf(cycle).open || !!a.submittedAt);

/* ─────────────────────────────── the two formats ─────────────────────────────── */

const family = (formFor) => (S.isStaffForm(formFor) ? 'staff' : 'academic');
const F = {
  academic: {
    blankSelf: () => T.blankSelf(),
    blankReview: () => T.blankReview(),
    cleanSelf: (raw) => T.cleanSelf(raw),
    // Whoever gives the marks gives all of them, the Principal-feedback
    // points included.
    cleanReview: (raw, cur) => T.cleanReview(raw, cur, { principal: true }),
    totals: (review) => T.totals(review),
    totalMax: T.SECTION_B_MAX + T.SECTION_C_MAX,
  },
  staff: {
    blankSelf: (formFor) => S.blankSelf(formFor),
    blankReview: () => S.blankReview(),
    cleanSelf: (raw, formFor) => S.cleanSelf(raw, formFor),
    cleanReview: (raw, cur) => S.cleanReview(raw, cur),
    totals: (review) => S.totals(review),
    totalMax: S.COMPETENCIES.length * 10,
  },
};
const fam = (a) => F[family(a.formFor)];
const blankSelfFor = (formFor) => F[family(formFor)].blankSelf(formFor);

// Basic details filled in from the account when a form is released.
const basicDetails = (p = {}, formFor) => (family(formFor) === 'staff'
  ? {
    name: p.name || '', designation: p.designation || '', dateOfBirth: p.dateOfBirth || '',
    dateOfJoining: p.basic?.dateOfJoining || '', institute: instituteOf(p.college), hodName: p.hodName || '',
  }
  : {
    name: p.name || '', qualification: p.basic?.qualification || '', designation: p.designation || '',
    department: p.department || unitLabel(p.unit) || '',
    institute: instituteOf(p.college), dateOfJoining: p.basic?.dateOfJoining || '',
    expIndustrial: p.basic?.expIndustrial || '', expTeaching: p.basic?.expTeaching || '', expResearch: p.basic?.expResearch || '',
  });
const prefillSelf = (person, formFor) => {
  const self = blankSelfFor(formFor);
  self.basic = { ...self.basic, ...basicDetails(person, formFor) };
  return self;
};

const logStep = (appraisal, user, action, note = '') => {
  appraisal.history.push({ action, by: user._id, byName: user.name, note, at: new Date() });
};

/* ─────────────────────────────── who gets told ─────────────────────────────── */

// Everyone who may act at step i of a form.
const actorsOf = async (a, i) => {
  const s = a.steps?.[i];
  if (!s) return [];
  if (isPersonal(s)) return s.assignee ? User.find({ _id: s.assignee, isActive: true }).select('name email').lean() : [];
  const list = await User.find({ role: s.role, isActive: true }).select('name email college deptKey role').lean();
  return list.filter((u) => !sameId(u, a.appraisee) && collegeMatch(u, a) && deptMatch(u, a));
};
const tellStep = async (a, i, title, message) => {
  (await actorsOf(a, i)).forEach((p) => notify(p, title, message, '/appraisal/review'));
};
const tellHR = async (a, title, message, path) => {
  const list = await User.find({ role: { $in: ['hr', 'super_admin'] }, isActive: true, college: { $in: [a.college, ALL] } }).select('name email').lean();
  list.filter((p) => !sameId(p, a.appraisee)).forEach((p) => notify(p, title, message, path));
};

// The one person for a step held by a named person, when the form is released.
const assigneeFor = async (s, person) => {
  if (s.role === 'hod') {
    const unit = s.unit || person.unit;
    if (!unit) return null;
    const common = !!UNIT[unit]?.commonHead;
    const q = { role: 'hod', isActive: true, unit, _id: { $ne: person._id } };
    if (!common) q.college = person.college;
    const list = await User.find(q).select('_id name college').lean();
    return (common && list.find((h) => h.college === ALL)) || list[0] || null;
  }
  if (s.role === 'team_lead') {
    const q = { role: 'team_lead', isActive: true, _id: { $ne: person._id } };
    if (person.college !== ALL) q.college = person.college;
    return User.findOne(q).select('_id name').lean();
  }
  return null;
};

/* ─────────────────────────────── shaping ─────────────────────────────── */

const cycleShape = (cycle = {}) => ({
  _id: cycle._id, title: cycle.title, formFor: cycle.formFor, formLabel: ROLE_LABEL[cycle.formFor], from: cycle.from, to: cycle.to,
  college: cycle.college, collegeLabel: collegeLabel(cycle.college),
  period: cycle.from ? T.periodLabel(cycle.from, cycle.to) : '',
  opensOn: cycle.opensOn || null, closesOn: cycle.closesOn || null, window: windowOf(cycle),
});

const personShape = (p) => (p ? {
  _id: p._id, name: p.name, department: p.department || unitLabel(p.unit), designation: p.designation, unit: p.unit || '', unitLabel: unitLabel(p.unit),
} : null);

// What each person may see of an appraisal.
const shapeFor = (a, user) => {
  const f = fam(a);
  const mine = sameId(a.appraisee, user);
  const seesReview = !mine && (asHR(user, a) || onPath(user, a));
  // The appraisee sees where their form is and why it came back — nothing
  // the reviewers wrote about them.
  const history = (a.history || []).map((h) => ({ action: h.action, byName: h.byName, at: h.at, note: mine && h.action !== 'sent back' ? '' : h.note }));
  const steps = (a.steps || []).map((s, i) => ({
    role: s.role, mode: s.mode, label: s.label,
    assignee: s.assignee ? { _id: s.assignee._id || s.assignee, name: s.assignee.name || '' } : null,
    done: !!s.doneAt, doneAt: s.doneAt, doneByName: s.doneByName || '',
    current: i === a.stepIndex,
    ...(seesReview ? { comment: s.comment || '' } : {}),
  }));
  const now = canActNow(user, a) ? a.steps[a.stepIndex] : null;
  const out = {
    _id: a._id,
    status: a.status,
    statusLabel: stageLabel(a),
    formFor: a.formFor,
    formLabel: ROLE_LABEL[a.formFor],
    college: a.college,
    collegeLabel: collegeLabel(a.college),
    family: family(a.formFor),
    cycle: cycleShape(a.cycle || {}),
    appraisee: personShape(a.appraisee),
    reviewer: a.reviewer ? { _id: a.reviewer._id, name: a.reviewer.name } : null,
    self: { ...f.blankSelf(a.formFor), ...(a.self || {}) },
    submittedAt: a.submittedAt,
    updatedAt: a.updatedAt,
    history,
    steps,
    stepIndex: a.stepIndex,
    marksBy: (a.steps || []).find((s) => s.mode === 'marks')?.label || '',
    firstStep: a.steps?.[0]?.label || '',
    nextStep: now ? a.steps[a.stepIndex + 1]?.label || 'HR' : '',
    prevStep: now ? (a.stepIndex > 0 ? a.steps[a.stepIndex - 1].label : 'the appraisee') : '',
    can: {
      editSelf: mine && mayFill(a, a.cycle || {}),
      marks: !!now && now.mode === 'marks',
      comment: !!now && now.mode === 'comment',
      act: !!now,
      download: mayDownloadOne(user, a),
    },
  };
  if (seesReview) {
    out.review = { ...f.blankReview(), ...(a.review || {}) };
    out.totals = f.totals(out.review);
    out.reviewedAt = a.reviewedAt;
    out.completedAt = a.completedAt;
  }
  return out;
};

const loadOne = (id) => Appraisal.findById(id)
  .populate('cycle')
  .populate('appraisee', 'name department designation email unit')
  .populate('reviewer', 'name')
  .populate('steps.assignee', 'name');

const listRow = (a) => ({
  _id: a._id,
  status: a.status,
  statusLabel: stageLabel(a),
  stepLabel: a.steps?.[a.stepIndex]?.label || '',
  formFor: a.formFor,
  formLabel: ROLE_LABEL[a.formFor],
  college: a.college,
  collegeLabel: collegeLabel(a.college),
  appraisee: personShape(a.appraisee),
  reviewer: a.reviewer ? { _id: a.reviewer._id, name: a.reviewer.name } : null,
  // The named people on the path (HOD, Team Lead), for HR to see and change.
  personalSteps: (a.steps || []).map((s, i) => ({ s, i })).filter(({ s }) => isPersonal(s)).map(({ s, i }) => ({
    index: i, label: s.label, role: s.role, unit: s.unit || a.unit || '', done: !!s.doneAt,
    assignee: s.assignee ? { _id: s.assignee._id || s.assignee, name: s.assignee.name || '' } : null,
  })),
  cycle: a.cycle?.title ? { _id: a.cycle._id, title: a.cycle.title, period: T.periodLabel(a.cycle.from, a.cycle.to), window: windowOf(a.cycle) } : undefined,
  total: a.totals?.total ?? null,
  totalMax: a.totals?.totalMax ?? F[family(a.formFor)].totalMax,
  submittedAt: a.submittedAt,
  completedAt: a.completedAt,
  updatedAt: a.updatedAt,
});

/* ─────────────────────────────── HR ─────────────────────────────── */

const formList = () => FORM_ROLES.map((k) => ({
  key: k, label: ROLE_LABEL[k], family: family(k), route: routeLabel(k, {}),
  ...(k === 'faculty' ? { routeBasicScience: routeLabel(k, { unit: 'BASIC_SCIENCE' }) } : {}),
}));

// @route GET /api/appraisal/template
const getTemplate = (req, res) => res.json({
  success: true,
  data: { ...T.template(), staff: S.template(), FORMS: formList(), ORG: { DEPARTMENTS, UNITS } },
});

// The colleges this HR may release for: their own; both (and the people
// common to both) for the common HR and the Super Admin.
const releaseColleges = (u) => (u.college === ALL
  ? [...CODES.map((c) => ({ key: c, label: collegeLabel(c) })), { key: ALL, label: 'Common to both colleges' }]
  : CODES.includes(u.college) ? [{ key: u.college, label: collegeLabel(u.college) }] : []);

// @route GET /api/appraisal/me
const getMyRoles = (req, res) => res.json({
  success: true,
  data: {
    hr: isHR(req.user), superAdmin: isSuperAdmin(req.user), reviewer: isReviewer(req.user), role: req.user.role,
    college: req.user.college, colleges: releaseColleges(req.user),
    // The HR form goes only from the common HR or the Super Admin.
    forms: formList().filter((f) => f.key !== 'hr' || req.user.college === ALL),
  },
});

// @route GET /api/appraisal/people?college=GN|RB|ALL — everyone who can be
// given a form, in a college this HR looks after.
const listPeople = async (req, res) => {
  if (!isHR(req.user)) return bad(res, 'Only HR can release appraisals', 403);
  const asked = cleanCollege(req.query.college);
  const allowed = releaseColleges(req.user).map((c) => c.key);
  const college = allowed.includes(asked) ? asked : null;
  const filter = { role: { $in: FORM_ROLES }, isActive: true, ...(college ? { college } : { college: { $in: allowed } }) };
  const people = await User.find(filter).select('name email department designation role college unit').sort('name').lean();
  res.json({
    success: true,
    data: people.map((p) => ({
      _id: p._id, name: p.name, email: p.email, department: p.department || unitLabel(p.unit), designation: p.designation || '',
      role: p.role, roleLabel: ROLE_LABEL[p.role], college: p.college, unit: p.unit || '', unitLabel: unitLabel(p.unit),
    })),
  });
};

const validMonth = (v) => v && Number.isInteger(Number(v.year)) && Number(v.year) >= 2000 && Number(v.year) <= 2100
  && Number.isInteger(Number(v.month)) && Number(v.month) >= 1 && Number(v.month) <= 12;

// Creates the form for each person (basic details filled in, its path with
// the named people on it) and tells them. Only people of the round's college
// whose role matches its form are added.
const addPeople = async (cycle, ids, by) => {
  const people = await User.find({ _id: { $in: ids }, role: cycle.formFor, college: cycle.college, isActive: true })
    .select('name email department designation basic dateOfBirth hodName college unit deptKey').lean();
  const existing = new Set((await Appraisal.find({ cycle: cycle._id }).select('appraisee').lean()).map((a) => String(a.appraisee)));
  let added = 0;
  const missing = []; // "Name — no HOD"
  for (const person of people) {
    if (existing.has(String(person._id))) continue;
    const steps = [];
    for (const s of flowFor(cycle.formFor, person)) {
      // eslint-disable-next-line no-await-in-loop
      const who = isPersonal(s) ? await assigneeFor(s, person) : null;
      if (isPersonal(s) && !who) missing.push(`${person.name} — no ${s.label}`);
      steps.push({ ...s, unit: s.unit || '', assignee: who?._id || null });
    }
    const review = F[family(cycle.formFor)].blankReview();
    const marksStep = steps.find((s) => s.mode === 'marks');
    try {
      // eslint-disable-next-line no-await-in-loop
      await Appraisal.create({
        cycle: cycle._id, appraisee: person._id, formFor: cycle.formFor, college: cycle.college,
        unit: person.unit || '', deptKey: person.deptKey || '',
        status: 'faculty', stepIndex: -1, steps,
        reviewer: (marksStep && isPersonal(marksStep) && marksStep.assignee) || null,
        self: prefillSelf(person, cycle.formFor), review, totals: F[family(cycle.formFor)].totals(review),
        history: [{ action: 'released', by: by._id, byName: by.name, at: new Date() }],
      });
      added += 1;
      const w = windowOf(cycle);
      notify(person, 'Appraisal form to fill',
        `${cycle.title} (${T.periodLabel(cycle.from, cycle.to)}) — please fill in and submit your appraisal.${cycle.closesOn ? ` Last date: ${dayText(cycle.closesOn)}.` : ''}${w.state === 'not-yet' ? ` ${w.note}.` : ''}`,
        '/appraisal/my');
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  return { added, skipped: ids.length - people.length, missing };
};

const readDates = (body) => {
  const opensOn = istDay(body.opensOn);
  const closesOn = istDay(body.closesOn);
  if (!opensOn || !closesOn) return { error: 'Choose the dates the form is open — From date and To date' };
  if (closesOn < opensOn) return { error: 'The To date is before the From date' };
  return { opensOn, closesOn };
};

// @desc  Release an appraisal round
// @route POST /api/appraisal/cycles
//        { title, formFor, college, from:{year,month}, to:{year,month}, opensOn, closesOn, people:[ids] }
const releaseCycle = async (req, res) => {
  if (!isHR(req.user)) return bad(res, 'Only HR can release appraisals', 403);
  const title = String(req.body.title || '').trim();
  const formFor = FORM_ROLES.includes(req.body.formFor) ? req.body.formFor : null;
  const { from, to } = req.body;
  if (!title) return bad(res, 'Give the appraisal a title');
  if (!formFor) return bad(res, 'Choose which form to release');
  if (formFor === 'hr' && req.user.college !== ALL) return bad(res, 'The HR form is released by the common HR or the Super Admin', 403);
  // A college's HR releases for their own college; the common HR picks one
  // (or the people common to both).
  const allowed = releaseColleges(req.user).map((c) => c.key);
  const college = req.user.college === ALL ? cleanCollege(req.body.college) : req.user.college;
  if (!allowed.includes(college)) return bad(res, 'Choose the college (GN or RB)');
  if (!validMonth(from) || !validMonth(to)) return bad(res, 'Choose the From and To month and year of the period');
  if (Number(to.year) * 12 + Number(to.month) < Number(from.year) * 12 + Number(from.month)) return bad(res, 'The period ends before it starts');
  const dates = readDates(req.body);
  if (dates.error) return bad(res, dates.error);
  const ids = Array.isArray(req.body.people) ? req.body.people.filter((x) => /^[a-f0-9]{24}$/i.test(String(x))) : [];
  if (!ids.length) return bad(res, 'Select at least one person');

  const cycle = await AppraisalCycle.create({
    title, formFor, college,
    from: { year: Number(from.year), month: Number(from.month) },
    to: { year: Number(to.year), month: Number(to.month) },
    opensOn: dates.opensOn, closesOn: dates.closesOn,
    releasedBy: req.user._id,
  });
  const { added, skipped, missing } = await addPeople(cycle, ids, req.user);
  if (!added) {
    await cycle.deleteOne();
    return bad(res, `None of the selected people is a ${ROLE_LABEL[formFor]} of ${collegeLabel(college)}`);
  }
  res.status(201).json({
    success: true, data: cycle, added, missing,
    message: `${ROLE_LABEL[formFor]} form released to ${added} ${added === 1 ? 'person' : 'people'} at ${collegeLabel(college)}`
      + ` — open ${dayText(dates.opensOn)} to ${dayText(dates.closesOn)}`
      + `${skipped ? ` — ${skipped} skipped (a different role or college)` : ''}`
      + `${missing.length ? ` — ${missing.length} without a reviewer; set them on the round's page` : ''}`,
  });
};

// @route GET /api/appraisal/cycles
const listCycles = async (req, res) => {
  if (!isHR(req.user) && !isReviewer(req.user)) return bad(res, 'Not allowed', 403);
  const filter = req.user.college === ALL ? {} : { college: req.user.college };
  const cycles = await AppraisalCycle.find(filter).sort('-createdAt').populate('releasedBy', 'name').lean();
  const forms = await Appraisal.find({ cycle: { $in: cycles.map((c) => c._id) } }).select('cycle status stepIndex steps.label').lean();
  const by = {};
  forms.forEach((a) => {
    const k = String(a.cycle);
    by[k] = by[k] || { total: 0, stages: {} };
    by[k].total += 1;
    const label = a.status === 'faculty' ? 'With appraisee' : a.status === 'completed' ? 'Completed' : `With ${a.steps?.[a.stepIndex]?.label || a.status}`;
    by[k].stages[label] = (by[k].stages[label] || 0) + 1;
  });
  res.json({
    success: true,
    data: cycles.map((c) => {
      const s = by[String(c._id)] || { total: 0, stages: {} };
      return {
        ...c, formLabel: ROLE_LABEL[c.formFor], collegeLabel: collegeLabel(c.college), period: T.periodLabel(c.from, c.to),
        window: windowOf(c), route: routeLabel(c.formFor, {}),
        counts: { total: s.total, completed: s.stages.Completed || 0, stages: s.stages },
      };
    }),
  });
};

// @route GET /api/appraisal/cycles/:id
const getCycle = async (req, res) => {
  if (!isHR(req.user) && !isReviewer(req.user)) return bad(res, 'Not allowed', 403);
  const cycle = await AppraisalCycle.findById(req.params.id).lean();
  if (!cycle || !(req.user.college === ALL || req.user.college === cycle.college)) return bad(res, 'Appraisal round not found', 404);
  const list = await Appraisal.find({ cycle: cycle._id })
    .populate('appraisee', 'name department designation unit').populate('reviewer', 'name').populate('steps.assignee', 'name').lean();
  // The HODs and Team Leads HR may put on a form of this round.
  const assignable = isHR(req.user)
    ? (await User.find({ role: { $in: ['hod', 'team_lead'] }, isActive: true, college: cycle.college === ALL ? { $in: [...CODES, ALL] } : { $in: [cycle.college, ALL] } })
      .select('name role unit college').sort('name').lean())
      .map((u) => ({ _id: u._id, name: u.name, role: u.role, unit: u.unit || '', unitLabel: unitLabel(u.unit), college: u.college }))
    : [];
  res.json({
    success: true,
    data: { ...cycleShape(cycle), route: routeLabel(cycle.formFor, {}) },
    appraisals: list.map(listRow).sort((a, b) => (a.appraisee?.name || '').localeCompare(b.appraisee?.name || '')),
    assignable,
  });
};

// @desc  Change the title or the open dates of a round.
// @route PATCH /api/appraisal/cycles/:id   { title?, opensOn?, closesOn? }
const updateCycle = async (req, res) => {
  if (!isHR(req.user)) return bad(res, 'Only HR can do this', 403);
  const cycle = await AppraisalCycle.findById(req.params.id);
  if (!cycle || !hrSees(req.user, cycle.college)) return bad(res, 'Appraisal round not found', 404);
  if (req.body.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) return bad(res, 'Give the appraisal a title');
    cycle.title = title;
  }
  if (req.body.opensOn !== undefined || req.body.closesOn !== undefined) {
    const dates = readDates({ opensOn: req.body.opensOn ?? cycle.opensOn?.toISOString(), closesOn: req.body.closesOn ?? cycle.closesOn?.toISOString() });
    if (dates.error) return bad(res, dates.error);
    cycle.opensOn = dates.opensOn;
    cycle.closesOn = dates.closesOn;
  }
  await cycle.save();
  res.json({ success: true, data: cycleShape(cycle.toObject()), message: `Saved — open ${dayText(cycle.opensOn)} to ${dayText(cycle.closesOn)}` });
};

// @route POST /api/appraisal/cycles/:id/people   { people:[ids] }
const addToCycle = async (req, res) => {
  if (!isHR(req.user)) return bad(res, 'Only HR can do this', 403);
  const cycle = await AppraisalCycle.findById(req.params.id);
  if (!cycle || !hrSees(req.user, cycle.college)) return bad(res, 'Appraisal round not found', 404);
  const ids = Array.isArray(req.body.people) ? req.body.people.filter((x) => /^[a-f0-9]{24}$/i.test(String(x))) : [];
  if (!ids.length) return bad(res, 'Select at least one person');
  const { added, missing } = await addPeople(cycle, ids, req.user);
  res.json({ success: true, added, missing, message: `${added} added${missing.length ? ` — ${missing.length} without a reviewer` : ''}` });
};

// @route DELETE /api/appraisal/cycles/:id
const deleteCycle = async (req, res) => {
  if (!isHR(req.user)) return bad(res, 'Only HR can do this', 403);
  const cycle = await AppraisalCycle.findById(req.params.id);
  if (!cycle || !hrSees(req.user, cycle.college)) return bad(res, 'Appraisal round not found', 404);
  const { deletedCount } = await Appraisal.deleteMany({ cycle: cycle._id });
  await cycle.deleteOne();
  res.json({ success: true, message: `Round deleted with its ${deletedCount} form(s)` });
};

// @desc  HR sets (or changes) the HOD / Team Lead at a step of a form.
// @route PATCH /api/appraisal/appraisals/:id/assignee   { stepIndex, userId }
const setAssignee = async (req, res) => {
  if (!isHR(req.user)) return bad(res, 'Only HR can do this', 403);
  const a = await Appraisal.findById(req.params.id);
  if (!a || !asHR(req.user, a)) return bad(res, 'Appraisal not found', 404);
  const i = Number(req.body.stepIndex);
  const s = a.steps?.[i];
  if (!s || !isPersonal(s)) return bad(res, 'That step is not held by one named person');
  if (s.doneAt && i < a.stepIndex) return bad(res, `The ${s.label} has already done this step`);
  const who = await User.findOne({ _id: req.body.userId, isActive: true, role: s.role }).select('name email college unit');
  if (!who) return bad(res, `Choose an active ${ROLE_LABEL[s.role]}`, 404);
  if (sameId(who, a.appraisee)) return bad(res, 'Nobody reviews their own appraisal');
  if (!collegeMatch(who, a)) return bad(res, 'Choose someone from the same college');
  a.steps[i].assignee = who._id;
  if (s.mode === 'marks') a.reviewer = who._id;
  logStep(a, req.user, `${s.label} set`, who.name);
  await a.save();
  if (i === a.stepIndex) notify(who, 'Appraisal to review', 'An appraisal is waiting for you.', '/appraisal/review');
  res.json({ success: true, message: `${who.name} is the ${s.label} for this form` });
};

/* ─────────────────────────────── lists ─────────────────────────────── */

const listWith = (filter) => Appraisal.find(filter)
  .populate('cycle').populate('appraisee', 'name department designation unit').populate('reviewer', 'name').populate('steps.assignee', 'name')
  .sort('-updatedAt').lean();

// @route GET /api/appraisal/mine
const listMine = async (req, res) => {
  const list = await listWith({ appraisee: req.user._id });
  // Only where the form is, never the marks.
  res.json({ success: true, data: list.map((a) => ({ ...listRow(a), total: undefined, totalMax: undefined, personalSteps: undefined })) });
};

// @desc  The forms on this person's path: the ones waiting for them now,
//        and the ones before or after their step.
// @route GET /api/appraisal/review
const listForReview = async (req, res) => {
  if (!isReviewer(req.user)) return bad(res, 'Nothing to review for your role', 403);
  const list = await listWith({
    status: { $ne: 'faculty' },
    $or: [{ 'steps.assignee': req.user._id }, { 'steps.role': req.user.role }],
  });
  const mine = list.filter((a) => onPath(req.user, a));
  res.json({ success: true, data: mine.map((a) => ({ ...listRow(a), waiting: canActNow(req.user, a) })) });
};

/* ───────────────────────────── one form ───────────────────────────── */

const canSee = (a, user) => sameId(a.appraisee, user) || onPath(user, a) || asHR(user, a);

// @route GET /api/appraisal/appraisals/:id
const getAppraisal = async (req, res) => {
  const a = await loadOne(req.params.id);
  if (!a) return bad(res, 'Appraisal not found', 404);
  if (!canSee(a, req.user)) return bad(res, 'You cannot open this appraisal', 403);
  res.json({ success: true, data: shapeFor(a.toObject(), req.user) });
};

// @route PUT /api/appraisal/appraisals/:id/self
const saveSelf = async (req, res) => {
  const a = await Appraisal.findById(req.params.id).populate('cycle');
  if (!a) return bad(res, 'Appraisal not found', 404);
  if (!sameId(a.appraisee, req.user)) return bad(res, 'Only the person being appraised fills this part', 403);
  if (a.status !== 'faculty') return bad(res, 'This form has been submitted and can no longer be changed');
  if (!mayFill(a, a.cycle)) return bad(res, windowOf(a.cycle).note);
  a.self = fam(a).cleanSelf(req.body.self, a.formFor);
  a.markModified('self');
  await a.save();
  res.json({ success: true, message: 'Saved' });
};

// @desc  Fill the basic details again from the account. Nothing else changes.
// @route POST /api/appraisal/appraisals/:id/refill
const refillSelf = async (req, res) => {
  const a = await Appraisal.findById(req.params.id).populate('cycle');
  if (!a) return bad(res, 'Appraisal not found', 404);
  if (!sameId(a.appraisee, req.user)) return bad(res, 'Not your appraisal', 403);
  if (a.status !== 'faculty') return bad(res, 'This form has been submitted');
  if (!mayFill(a, a.cycle)) return bad(res, windowOf(a.cycle).note);
  const fresh = basicDetails(await User.findById(a.appraisee).lean(), a.formFor);
  const keep = { ...blankSelfFor(a.formFor), ...(a.self || {}) };
  keep.basic = { ...keep.basic, ...Object.fromEntries(Object.entries(fresh).filter(([, v]) => v)) };
  a.self = keep;
  a.markModified('self');
  await a.save();
  res.json({ success: true, message: 'Basic details filled again' });
};

// Moves the form to step i (or to HR when there are no more) and tells them.
const moveTo = async (a, i, user, action, note = '') => {
  a.stepIndex = i;
  a.status = i < 0 ? 'faculty' : i >= a.steps.length ? 'completed' : a.steps[i].role;
  logStep(a, user, action, note);
  await a.save();
};

// @route POST /api/appraisal/appraisals/:id/submit
const submitSelf = async (req, res) => {
  const a = await Appraisal.findById(req.params.id).populate('cycle');
  if (!a) return bad(res, 'Appraisal not found', 404);
  if (!sameId(a.appraisee, req.user)) return bad(res, 'Only the person being appraised submits this', 403);
  if (a.status !== 'faculty') return bad(res, 'Already submitted');
  if (!mayFill(a, a.cycle)) return bad(res, windowOf(a.cycle).note);
  if (req.body.self) { a.self = fam(a).cleanSelf(req.body.self, a.formFor); a.markModified('self'); }
  if (!String(a.self?.basic?.name || '').trim()) return bad(res, 'Fill in your basic details before submitting');
  const first = a.steps[0];
  if (!first) return bad(res, 'This form has no review path — please contact HR');
  if (isPersonal(first) && !first.assignee) return bad(res, `No ${first.label} is set for you yet — please contact HR`);
  a.submittedAt = new Date();
  await moveTo(a, 0, req.user, 'submitted');
  tellStep(a, 0, 'Appraisal to review', `${req.user.name} has submitted their appraisal (${a.cycle.title}).`);
  res.json({ success: true, message: `Submitted — sent to the ${first.label}` });
};

// The step this person is acting on now, or the reason they cannot.
const currentStepFor = (a, user) => {
  if (!atStep(a)) return { error: 'This form is not with a reviewer now' };
  if (!canActNow(user, a)) return { error: `This form is with the ${a.steps[a.stepIndex].label} now`, code: 403 };
  return { s: a.steps[a.stepIndex] };
};

// @desc  Save the marks (marks step only).
// @route PUT /api/appraisal/appraisals/:id/review   { review }
const saveReview = async (req, res) => {
  const a = await Appraisal.findById(req.params.id);
  if (!a) return bad(res, 'Appraisal not found', 404);
  const { s, error, code } = currentStepFor(a, req.user);
  if (error) return bad(res, error, code);
  if (s.mode !== 'marks') return bad(res, `The ${s.label} adds a comment here, not marks`, 403);
  const f = fam(a);
  a.review = f.cleanReview(req.body.review || {}, { ...f.blankReview(), ...(a.review || {}) });
  a.totals = f.totals(a.review);
  a.markModified('review');
  a.markModified('totals');
  await a.save();
  res.json({ success: true, totals: a.totals, message: 'Saved' });
};

// @desc  Save a comment (comment step only).
// @route PUT /api/appraisal/appraisals/:id/comment   { comment }
const saveComment = async (req, res) => {
  const a = await Appraisal.findById(req.params.id);
  if (!a) return bad(res, 'Appraisal not found', 404);
  const { s, error, code } = currentStepFor(a, req.user);
  if (error) return bad(res, error, code);
  if (s.mode !== 'comment') return bad(res, `The ${s.label} gives the marks here`, 403);
  a.steps[a.stepIndex].comment = String(req.body.comment || '').slice(0, 5000);
  a.markModified('steps');
  await a.save();
  res.json({ success: true, message: 'Saved' });
};

// @desc  Finish this step and send the form on (or back to HR after the last).
// @route POST /api/appraisal/appraisals/:id/forward   { review?, comment? }
const forward = async (req, res) => {
  const a = await Appraisal.findById(req.params.id).populate('cycle').populate('appraisee', 'name email');
  if (!a) return bad(res, 'Appraisal not found', 404);
  const { s, error, code } = currentStepFor(a, req.user);
  if (error) return bad(res, error, code);
  const f = fam(a);
  if (s.mode === 'marks') {
    if (req.body.review) {
      a.review = f.cleanReview(req.body.review, { ...f.blankReview(), ...(a.review || {}) });
      a.markModified('review');
    }
    a.totals = f.totals(a.review);
    a.markModified('totals');
    a.reviewedAt = new Date();
    a.reviewedBy = req.user._id;
  } else {
    const comment = String(req.body.comment ?? s.comment ?? '').trim();
    if (!comment) return bad(res, 'Add your comment first');
    a.steps[a.stepIndex].comment = comment.slice(0, 5000);
  }
  const i = a.stepIndex;
  a.steps[i].doneAt = new Date();
  a.steps[i].doneBy = req.user._id;
  a.steps[i].doneByName = req.user.name;
  a.markModified('steps');
  const next = i + 1;
  if (next >= a.steps.length) {
    a.completedAt = new Date();
    a.completedBy = req.user._id;
    await moveTo(a, next, req.user, `${s.mode === 'marks' ? 'marked' : 'commented'} by ${s.label} — completed`);
    tellHR(a, 'Appraisal received', `${a.appraisee.name}'s appraisal (${a.cycle.title}) is complete and back with HR.`, `/appraisal/hr/${a.cycle._id}`);
    notify(a.appraisee, 'Appraisal completed', `Your appraisal (${a.cycle.title}) has been completed.`, '/appraisal/my');
    return res.json({ success: true, message: 'Done — the appraisal is complete and back with HR' });
  }
  await moveTo(a, next, req.user, `${s.mode === 'marks' ? 'marked' : 'commented'} by ${s.label}`);
  tellStep(a, next, 'Appraisal to review', `${a.appraisee.name}'s appraisal (${a.cycle.title}) is waiting for you.`);
  return res.json({ success: true, message: `Sent to the ${a.steps[next].label}` });
};

// @desc  Send a form back one step, with the reason.
// @route POST /api/appraisal/appraisals/:id/send-back   { note }
const sendBack = async (req, res) => {
  const a = await Appraisal.findById(req.params.id).populate('appraisee', 'name email').populate('cycle');
  if (!a) return bad(res, 'Appraisal not found', 404);
  const note = String(req.body.note || '').trim();
  if (!note) return bad(res, 'Say why it is being sent back');
  const { s, error, code } = currentStepFor(a, req.user);
  if (error) return bad(res, error, code);
  const to = a.stepIndex - 1;
  // The earlier step is open again.
  if (to >= 0) {
    a.steps[to].doneAt = null;
    a.steps[to].doneBy = null;
    a.steps[to].doneByName = '';
    a.markModified('steps');
  }
  await moveTo(a, to, req.user, 'sent back', `${s.label}: ${note}`);
  const msg = `${a.cycle.title} was sent back: ${note}`;
  if (to < 0) notify(a.appraisee, 'Appraisal sent back', msg, '/appraisal/my');
  else tellStep(a, to, 'Appraisal sent back', msg);
  res.json({ success: true, message: `Sent back to ${to < 0 ? a.appraisee.name : `the ${a.steps[to].label}`}` });
};

/* ───────────────────────────── downloads ───────────────────────────── */

// PDF unless Word is asked for (?format=docx).
const FORMATS = {
  pdf: { ext: 'pdf', type: 'application/pdf', build: appraisalPdfBuffer },
  docx: { ext: 'docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', build: appraisalDocxBuffer },
};
const formatOf = (req) => FORMATS[req.query.format === 'docx' ? 'docx' : 'pdf'];
// One form: HR of its college, or anyone on its path once it has reached them.
function mayDownloadOne(u, a) {
  if (sameId(a.appraisee, u)) return false;
  if (asHR(u, a)) return true;
  return a.status !== 'faculty' && onPath(u, a);
}
// A whole round: HR, the Director, the GM, and that college's Principal.
const mayDownloadRound = (u, cycle) => hrSees(u, cycle.college)
  || ['director', 'gm'].includes(u.role)
  || (u.role === 'principal' && collegeMatch(u, cycle));

const fileName = (a, fmt) => `${String(a.appraisee?.name || 'Appraisal').replace(/[^A-Za-z0-9]+/g, '_')}_${a.status}.${fmt.ext}`;
const fileFor = (a, fmt) => fmt.build({ appraisal: a, cycle: a.cycle, institute: COLLEGES[a.college]?.full });

// @route GET /api/appraisal/appraisals/:id/download?format=pdf|docx
const downloadOne = async (req, res) => {
  const a = await loadOne(req.params.id).lean();
  if (!a) return bad(res, 'Appraisal not found', 404);
  if (!mayDownloadOne(req.user, a)) return bad(res, 'You cannot download this appraisal', 403);
  const fmt = formatOf(req);
  const buf = await fileFor(a, fmt);
  res.setHeader('Content-Type', fmt.type);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName(a, fmt)}"`);
  res.send(buf);
};

// @desc  Every form of a round, each as its own file, in one zip.
// @route GET /api/appraisal/cycles/:id/download?status=completed&format=pdf|docx
const downloadCycle = async (req, res) => {
  const cycle = await AppraisalCycle.findById(req.params.id).lean();
  if (!cycle) return bad(res, 'Appraisal round not found', 404);
  if (!mayDownloadRound(req.user, cycle)) return bad(res, 'Only HR, the Director, the GM or this college\'s Principal can download a whole round', 403);
  const filter = { cycle: cycle._id };
  if (req.query.status) filter.status = String(req.query.status);
  const list = await Appraisal.find(filter).populate('cycle').populate('appraisee', 'name department designation unit').lean();
  if (!list.length) return bad(res, 'No forms to download', 404);

  const zipName = `${cycle.title.replace(/[^A-Za-z0-9]+/g, '_')}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
  const archive = new archiver.ZipArchive({ zlib: { level: 6 } });
  archive.on('error', (err) => { console.error('appraisal zip failed:', err.message); res.end(); });
  archive.pipe(res);
  const fmt = formatOf(req);
  const used = new Set();
  for (const a of list) {
    let name = fileName(a, fmt);
    for (let i = 2; used.has(name); i += 1) name = fileName(a, fmt).replace(`.${fmt.ext}`, `_${i}.${fmt.ext}`);
    used.add(name);
    // eslint-disable-next-line no-await-in-loop
    archive.append(await fileFor(a, fmt), { name });
  }
  await archive.finalize();
  return undefined;
};

module.exports = {
  getTemplate, getMyRoles, listPeople, releaseCycle, listCycles, getCycle, updateCycle, addToCycle, deleteCycle, setAssignee,
  listMine, listForReview, getAppraisal, saveSelf, refillSelf, submitSelf,
  saveReview, saveComment, forward, sendBack, downloadOne, downloadCycle,
};
