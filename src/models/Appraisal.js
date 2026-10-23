const mongoose = require('mongoose');
const { FORM_ROLES } = require('../utils/roles');
const { CODES, ALL } = require('../utils/colleges');

// One appraisal round released by HR: which form it is (the role it is for
// — Faculty, HOD, Admin Team …), the period it covers, its title, and the
// dates the form is open to fill. Each person in it gets an Appraisal.
const appraisalCycleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    formFor: { type: String, enum: FORM_ROLES, required: true },
    // The college the round is for; only that college's people get it.
    // ALL is a round for the people common to both colleges (the
    // Placement / Training HODs), released by the common HR.
    college: { type: String, enum: [...CODES, ALL], default: 'GN', index: true },
    from: {
      year: { type: Number, required: true },
      month: { type: Number, required: true, min: 1, max: 12 },
    },
    to: {
      year: { type: Number, required: true },
      month: { type: Number, required: true, min: 1, max: 12 },
    },
    // The form can be filled and submitted from this day to this day
    // (both included, Indian time). HR can move them.
    opensOn: { type: Date, default: null },
    closesOn: { type: Date, default: null },
    releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// One step of a form's path (utils/flow.js), copied onto the form when it is
// released so a later change of the rules does not move forms already out.
const stepSchema = new mongoose.Schema({
  role: { type: String, required: true },
  mode: { type: String, enum: ['marks', 'comment'], required: true },
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  // The one person who acts here (an HOD, a Team Lead). Empty for a role
  // anybody holding it may act on (Principal, Vice Principal, GM, Director).
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  comment: { type: String, default: '' },
  doneAt: { type: Date, default: null },
  doneBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  doneByName: { type: String, default: '' },
}, { _id: false });

// One person's appraisal in a round, as it moves along:
//   status 'faculty'   — with the appraisee (the name is kept from the first version)
//   status <role>      — at the step `stepIndex` (its role: hod, principal …)
//   status 'completed' — back with HR
const appraisalSchema = new mongoose.Schema(
  {
    cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'AppraisalCycle', required: true, index: true },
    appraisee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    formFor: { type: String, enum: FORM_ROLES, required: true },
    college: { type: String, enum: [...CODES, ALL], default: 'GN', index: true },
    // The appraisee's unit and department when it was released.
    unit: { type: String, default: '' },
    deptKey: { type: String, default: '' },
    status: { type: String, default: 'faculty', index: true },
    steps: { type: [stepSchema], default: [] },
    // -1 with the appraisee; steps.length once completed.
    stepIndex: { type: Number, default: -1 },
    // The person who gives the marks, when that is one named person (kept
    // for lists; the same as that step's assignee).
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    // Section A and the supporting details — the appraisee's part.
    self: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Section B points, its questions, Section C, the quadrant — given at the
    // marks step. Never sent to the appraisee.
    review: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Before steps carried their own comments; read by the migration only.
    principalComment: { type: String, default: '' },
    directorRemark: { type: String, default: '' },

    // Kept up to date on every save, for lists and the summary.
    totals: { type: mongoose.Schema.Types.Mixed, default: {} },

    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    completedAt: { type: Date, default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Every hand-over, including a form sent back with a reason.
    history: {
      type: [new mongoose.Schema({
        action: { type: String, required: true },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        byName: { type: String, default: '' },
        note: { type: String, default: '' },
        at: { type: Date, default: Date.now },
      }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true }
);

appraisalSchema.index({ cycle: 1, appraisee: 1 }, { unique: true });
appraisalSchema.index({ 'steps.assignee': 1 });

const AppraisalCycle = mongoose.model('AppraisalCycle', appraisalCycleSchema);
const Appraisal = mongoose.model('Appraisal', appraisalSchema);

module.exports = { AppraisalCycle, Appraisal };
