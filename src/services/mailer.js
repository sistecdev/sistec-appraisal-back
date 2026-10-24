const nodemailer = require('nodemailer');

// Email is optional. With no SMTP settings it is off: invites cannot be sent
// (HR gives temporary passwords instead) and appraisal updates are only seen
// on the website. MAIL_TRANSPORT=json logs emails instead of sending them.

let transport = null;
const getTransport = () => {
  if (transport) return transport;
  if (process.env.MAIL_TRANSPORT === 'json') {
    transport = nodemailer.createTransport({ jsonTransport: true });
  } else if (process.env.SMTP_HOST) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE) === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
};

const mailEnabled = () => process.env.MAIL_TRANSPORT === 'json' || !!process.env.SMTP_HOST;

const siteUrl = () => String(process.env.CLIENT_URL || 'http://localhost:5174').split(',')[0].trim().replace(/\/+$/, '');
const short = () => process.env.INSTITUTE_SHORT || 'SISTec';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Plain, readable email: a greeting, a few lines, one button.
const layout = ({ name, lines, button }) => `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#111827">
    <h2 style="margin:0 0 12px">${escapeHtml(short())} Appraisal</h2>
    <p>Dear ${escapeHtml(name || 'colleague')},</p>
    ${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}
    ${button ? `<p style="margin:24px 0"><a href="${button.href}" style="background:#7c3aed;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(button.label)}</a></p>
    <p style="font-size:12px;color:#6b7280">If the button does not work, copy this address into your browser:<br>${escapeHtml(button.href)}</p>` : ''}
  </div>`;

const send = async ({ to, subject, name, lines, button }) => {
  const t = getTransport();
  if (!t) return { sent: false, reason: 'Email is not set up on this server' };
  const info = await t.sendMail({
    from: process.env.MAIL_FROM || `${short()} Appraisal <no-reply@localhost>`,
    to,
    subject,
    text: [`Dear ${name || 'colleague'},`, ...lines, button ? `${button.label}: ${button.href}` : ''].join('\n\n'),
    html: layout({ name, lines, button }),
  });
  if (process.env.MAIL_TRANSPORT === 'json') console.log(`[mail] to ${to}: ${subject}`);
  return { sent: true, id: info.messageId };
};

const sendInvite = (user, token) => send({
  to: user.email,
  name: user.name,
  subject: `Your ${short()} Appraisal account`,
  lines: ['An account has been created for you on the faculty appraisal website.', 'Choose your password with the link below. It works for 7 days.'],
  button: { label: 'Set my password', href: `${siteUrl()}/set-password#token=${token}` },
});

const sendReset = (user, token) => send({
  to: user.email,
  name: user.name,
  subject: `Reset your ${short()} Appraisal password`,
  lines: ['Someone asked to reset the password for this account. If it was you, use the link below — it works for one hour.', 'If it was not you, ignore this email; nothing changes.'],
  button: { label: 'Choose a new password', href: `${siteUrl()}/set-password#token=${token}` },
});

// The User ID and a temporary password, sent by the Super Admin.
const sendCredentials = (user, password) => send({
  to: user.email,
  name: user.name,
  subject: `Your ${short()} Appraisal sign-in details`,
  lines: [
    'Here are your sign-in details for the faculty appraisal website.',
    `User ID: ${user.email}`,
    `Temporary password: ${password}`,
    'You will be asked to choose your own password when you first sign in. Please do not share this email.',
  ],
  button: { label: 'Sign in', href: `${siteUrl()}/login` },
});

// Appraisal updates — sent only when email is on; never blocks the request.
const notify = (user, subject, line, path) => {
  if (!mailEnabled() || !user?.email) return;
  send({ to: user.email, name: user.name, subject, lines: [line], button: { label: 'Open the appraisal', href: `${siteUrl()}${path}` } })
    .catch((err) => console.error('appraisal email failed:', err.message));
};

module.exports = { mailEnabled, sendInvite, sendReset, sendCredentials, notify, siteUrl };
