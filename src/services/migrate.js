const User = require('../models/User');
const { AppraisalCycle, Appraisal } = require('../models/Appraisal');
const { flowFor, isPersonal } = require('../utils/flow');

// Brings data made by earlier versions in line. Runs at every start; each
// part does nothing once there is nothing left to move.
const migrate = async () => {
  const done = {};
  done.roles = await User.migrateRoles();
  done.colleges = await User.migrateColleges();
  done.units = await User.migrateUnits();
  await AppraisalCycle.updateMany({ college: { $exists: false } }, { $set: { college: 'GN' } });
  await Appraisal.updateMany({ college: { $exists: false } }, { $set: { college: 'GN' } });

  // Forms released before each form carried its own path: give them one,
  // keeping where they were and what the HOD / Principal / Director wrote.
  const old = await Appraisal.find({ $or: [{ steps: { $exists: false } }, { steps: { $size: 0 } }] })
    .populate('appraisee', 'unit deptKey college');
  for (const a of old) {
    const person = a.appraisee || {};
    const steps = flowFor(a.formFor, person).map((s) => ({ ...s, unit: s.unit || '', assignee: null, comment: '' }));
    steps.forEach((s) => {
      if (isPersonal(s) && s.role === 'hod') s.assignee = a.reviewer || null;
      if (s.role === 'principal') s.comment = a.principalComment || '';
      if (s.role === 'director') s.comment = a.directorRemark || '';
    });
    let stepIndex = -1;
    if (a.status === 'completed') stepIndex = steps.length;
    else if (a.status !== 'faculty') {
      const at = steps.findIndex((s) => s.role === a.status);
      stepIndex = at >= 0 ? at : 0;
    }
    steps.forEach((s, i) => { if (i < stepIndex) s.doneAt = a.completedAt || a.updatedAt || new Date(); });
    const status = stepIndex < 0 ? 'faculty' : stepIndex >= steps.length ? 'completed' : steps[stepIndex].role;
    // eslint-disable-next-line no-await-in-loop
    await Appraisal.updateOne({ _id: a._id }, {
      $set: { steps, stepIndex, status, unit: person.unit || '', deptKey: person.deptKey || '' },
    });
  }
  done.forms = old.length;
  return done;
};

module.exports = { migrate };
