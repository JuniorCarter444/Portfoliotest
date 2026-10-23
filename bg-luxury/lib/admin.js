// Staff-only page and API: bookings, enquiries, driver verifications (with documents) and security deposits.
// Protected by HTTP Basic auth with ADMIN_PASSWORD (any username). Serve the site over HTTPS in production.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const store = require('../data/store');
const verification = require('../data/verification');
const emails = require('./emails');
const mailer = require('./mailer');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

function requireAdmin(req, res, next) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return res.status(503).send('Admin is disabled. Set ADMIN_PASSWORD in .env to enable it.');
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  const given = scheme === 'Basic' ? Buffer.from(encoded || '', 'base64').toString().split(':').slice(1).join(':') : '';
  if (crypto.timingSafeEqual(sha(given), sha(password))) return next();
  res.set('WWW-Authenticate', 'Basic realm="BG LUX admin"').status(401).send('Authentication required');
}

function createAdminRouter({ payments, ctx, uploadDir }) {
  const router = express.Router();
  router.use('/api/admin', requireAdmin);

  router.get('/admin', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, '..', 'views', 'admin.html')));

  router.get('/api/admin/data', (req, res) => {
    const newestFirst = (a, b) => b.createdAt.localeCompare(a.createdAt);
    res.json({
      bookings: store.readAll('bookings').sort(newestFirst),
      inquiries: store.readAll('inquiries').sort(newestFirst),
      verifications: store.readAll('verifications').sort(newestFirst),
      questions: verification.questions,
      documents: verification.documents,
      paymentsLive: ctx.paymentsLive,
      emailLive: mailer.configured
    });
  });

  // Documents are never public: they're only served here, behind the admin password.
  router.get('/api/admin/files/:vid/:doc', (req, res) => {
    const v = store.find('verifications', req.params.vid);
    const doc = v?.documents?.[req.params.doc];
    if (!doc) return res.status(404).send('Not found');
    res.set('Cache-Control', 'no-store');
    res.type(doc.type).sendFile(path.join(uploadDir, v.id, path.basename(doc.stored)));
  });

  router.post('/api/admin/verifications/:id/delete-documents', (req, res) => {
    const v = store.find('verifications', req.params.id);
    if (!v) return res.status(404).json({ error: 'Not found' });
    fs.rmSync(path.join(uploadDir, v.id), { recursive: true, force: true });
    const updated = store.update('verifications', v.id, { documents: {}, documentsDeletedAt: new Date().toISOString() });
    res.json({ ok: true, verification: updated });
  });

  // Wraps each booking action: loads the booking, runs it, turns expected errors into a 400 with a readable message.
  const action = (fn) => async (req, res) => {
    const booking = store.find('bookings', req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    try {
      const updated = await fn(booking, req.body || {});
      res.json({ ok: true, booking: updated });
    } catch (err) {
      if (!(err instanceof payments.PaymentError) && !err.expose) console.error(err);
      res.status(400).json({ error: err.message });
    }
  };

  const fail = (message) => Object.assign(new Error(message), { expose: true });
  const amountFrom = (v, { allowZero = false } = {}) => {
    const n = Math.round(Number(v) * 100) / 100;
    if (Number.isNaN(n) || n < 0 || (!allowZero && n === 0) || n > 100000) throw fail('Enter a valid amount.');
    return n;
  };
  const paidUp = (b) => {
    if (b.status !== 'paid') throw fail('This booking has not been paid yet.');
  };

  router.post('/api/admin/bookings/:id/deposit/request', action(async (b, body) => {
    paidUp(b);
    const v = store.find('verifications', b.verificationId);
    if (!v || v.status === 'awaiting_documents') throw fail('The customer has not completed their verification and documents yet.');
    if (b.securityDeposit && b.securityDeposit.status !== 'requested') throw fail('The deposit has already been paid.');
    const amount = amountFrom(body.amount);
    const updated = store.update('bookings', b.id, { securityDeposit: { amount, status: 'requested', requestedAt: new Date().toISOString() } });
    await mailer.send({ to: b.email, ...emails.depositRequested(updated, ctx) });
    return updated;
  }));

  // For deposits paid by bank transfer or in person.
  router.post('/api/admin/bookings/:id/deposit/mark-paid', action(async (b, body) => {
    if (b.securityDeposit?.status !== 'requested') throw fail('Request the deposit first.');
    const method = ['bank transfer', 'card terminal', 'cash'].includes(body.method) ? body.method : 'bank transfer';
    return store.update('bookings', b.id, { securityDeposit: { ...b.securityDeposit, status: 'paid', method, paidAt: new Date().toISOString() } });
  }));

  // Refunds the deposit, keeping `deduction` (fines, damage, fuel...) with a reason the customer sees.
  router.post('/api/admin/bookings/:id/deposit/refund', action(async (b, body) => {
    const d = b.securityDeposit;
    if (d?.status !== 'paid') throw fail('There is no paid deposit to refund.');
    const deduction = amountFrom(body.deduction || 0, { allowZero: true });
    if (deduction > d.amount) throw fail('The deduction cannot be more than the deposit.');
    const reason = String(body.reason || '').trim().slice(0, 500);
    if (deduction > 0 && !reason) throw fail('Add a reason for the deduction. It is included in the email to the customer.');
    const refundAmount = Math.round((d.amount - deduction) * 100) / 100;
    // Card deposits are refunded through Stripe; bank transfer or cash deposits are refunded by you and just recorded here.
    const refundId = d.method === 'card' ? await payments.refund(d.intentId, refundAmount) : null;
    const status = !deduction ? 'refunded' : refundAmount ? 'partly_refunded' : 'retained';
    const updated = store.update('bookings', b.id, {
      securityDeposit: { ...d, status, refundAmount, deduction, reason, refundId, refundedAt: new Date().toISOString() }
    });
    await mailer.send({ to: b.email, ...emails.depositRefunded(updated, ctx) });
    return updated;
  }));

  router.post('/api/admin/bookings/:id/balance', action(async (b) => {
    paidUp(b);
    const balance = Math.round((b.total - (b.amountPaid || 0)) * 100) / 100;
    if (!(balance > 0)) throw fail('Nothing left to pay on this booking.');
    const intentId = await payments.chargeBalance(b, balance);
    const updated = store.update('bookings', b.id, {
      amountPaid: b.total,
      balancePayment: { intentId, amount: balance, paidAt: new Date().toISOString() }
    });
    await mailer.send({ to: b.email, ...emails.balancePaid(updated, balance, ctx) });
    return updated;
  }));

  router.post('/api/admin/bookings/:id/resend', action(async (b) => {
    paidUp(b);
    const sent = await mailer.send({ to: b.email, ...emails.bookingConfirmed(b, ctx) });
    if (!sent && mailer.configured) throw fail('The email could not be sent. Check the SMTP settings.');
    return b;
  }));

  return router;
}

module.exports = { createAdminRouter };
