// Sends email over SMTP (Gmail, Outlook, Zoho, SendGrid, Resend, Mailgun... all offer SMTP).
// Without SMTP settings, emails are written to data/outbox.json and the console instead, so nothing is lost while testing.
const nodemailer = require('nodemailer');
const store = require('../data/store');

const configured = Boolean(process.env.SMTP_HOST);
const transport = configured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    })
  : null;

const FROM = process.env.MAIL_FROM || 'BG LUX <no-reply@example.com>';

// Never throws: a failed email must not break a booking or payment.
async function send({ to, subject, html, text, replyTo }) {
  if (!to) return false;
  if (!transport) {
    store.insert('outbox', { to, subject, text, createdAt: new Date().toISOString() });
    console.log(`[email not sent: SMTP not configured] to=${to} subject="${subject}"`);
    return false;
  }
  try {
    await transport.sendMail({ from: FROM, to, subject, html, text, replyTo });
    return true;
  } catch (err) {
    console.error(`Email to ${to} failed:`, err.message);
    return false;
  }
}

module.exports = { send, configured };
