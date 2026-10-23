// Create (or reset) an HR or Super Admin account from the command line.
//   npm run create-hr -- --name "Priya Sharma" --email hr@sistec.ac.in [--college GN|RB|ALL]
//   npm run create-hr -- --name "Admin" --email admin@sistec.ac.in --role super_admin
// Prints a temporary password; it must be changed at the first sign-in.
// On a host without a shell (Render free), use the website's /setup page
// instead for the first HR account.
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const User = require('../src/models/User');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : '';
};

(async () => {
  const email = String(arg('email')).trim().toLowerCase();
  const name = String(arg('name')).trim();
  if (!email) {
    console.log('Usage: npm run create-hr -- --name "Full Name" --email hr@sistec.ac.in');
    process.exit(1);
  }
  await connectDB();
  let user = await User.findOne({ email });
  const role = arg('role') === 'super_admin' ? 'super_admin' : 'hr';
  const asked = String(arg('college') || 'ALL').toUpperCase();
  const college = role === 'super_admin' ? 'ALL' : ['GN', 'RB', 'ALL'].includes(asked) ? asked : 'ALL';
  if (!user) user = new User({ name: name || email, email, role, college });
  else { user.role = role; user.college = college; }
  user.isActive = true;
  const password = `Hr${crypto.randomBytes(4).toString('hex')}9`;
  await user.setPassword(password, { temporary: true });
  await user.save();
  console.log(`${role === 'super_admin' ? 'Super Admin' : 'HR'} account ready: ${user.email}`);
  console.log(`Temporary password: ${password}  (change it at the first sign-in)`);
  await mongoose.disconnect();
})().catch((err) => { console.error(err.message); process.exit(1); });
