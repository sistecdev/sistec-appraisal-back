// Create demo accounts for trying the appraisal out — one for each role and
// path that has none yet. An email that already exists is left as it is.
//   npm run create-demo [-- --password "Demo@1234"]
// Every new account gets the same password and can sign in straight away.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const User = require('../src/models/User');
const { UNIT } = require('../src/utils/org');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : '';
};

// name, email, role, college, unit, designation
const DEMO = [
  ['HR GN Demo', 'hr.gn.demo@demo.in', 'hr', 'GN', '', 'HR Executive'],
  ['GM Demo', 'gm.demo@demo.in', 'gm', 'ALL', '', 'General Manager'],
  ['Team Lead Demo', 'teamlead.demo@demo.in', 'team_lead', 'GN', '', 'Team Lead — Admission'],
  ['Vice Principal Demo', 'vp.demo@demo.in', 'vice_principal', 'GN', '', 'Vice Principal'],
  ['Training Team Demo', 'training.demo@demo.in', 'training_team', 'ALL', '', 'Training Executive'],
  ['Placement HOD Demo', 'hod.placement.demo@demo.in', 'hod', 'ALL', 'PLACEMENT', 'Head — Placement'],
  ['Training HOD Demo', 'hod.training.demo@demo.in', 'hod', 'ALL', 'TRAINING', 'Head — Training'],
  ['ME Faculty Demo', 'faculty.me.demo@demo.in', 'faculty', 'GN', 'ME', 'Assistant Professor'],
  ['ME HOD Demo', 'hod.me.demo@demo.in', 'hod', 'GN', 'ME', 'Professor & Head'],
  ['Basic Science Faculty Demo', 'faculty.bs.demo@demo.in', 'faculty', 'GN', 'BASIC_SCIENCE', 'Assistant Professor'],
  ['Basic Science HOD Demo', 'hod.bs.demo@demo.in', 'hod', 'GN', 'BASIC_SCIENCE', 'Professor & Head'],
  ['HR Team Member Demo', 'faculty.hrteam.demo@demo.in', 'hr_team', 'GN', '', 'HR Executive'],
  ['Lab Tech Demo', 'faculty.labtech.demo@demo.in', 'faculty', 'GN', 'LAB_TECH', 'Lab Technician'],
  ['Lab Tech HOD Demo', 'hod.labtech.demo@demo.in', 'hod', 'GN', 'LAB_TECH', 'Head — Labs'],
];

(async () => {
  const password = arg('password') || 'Demo@1234';
  if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
    console.log('The password needs at least 8 characters, with letters and a number.');
    process.exit(1);
  }
  await connectDB();
  for (const [name, email, role, college, unit, designation] of DEMO) {
    // eslint-disable-next-line no-await-in-loop
    if (await User.exists({ email })) { console.log(`exists   ${email}`); continue; }
    const user = new User({ name, email, role, college, unit, department: UNIT[unit]?.name || '', designation, isActive: true });
    // eslint-disable-next-line no-await-in-loop
    await user.setPassword(password);
    // eslint-disable-next-line no-await-in-loop
    await user.save();
    console.log(`created  ${email}  (${role}${unit ? `, ${unit}` : ''}, ${college})`);
  }
  console.log(`\nPassword for the new accounts: ${password}`);
  await mongoose.disconnect();
})().catch((err) => { console.error(err.message); process.exit(1); });
