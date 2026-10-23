require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const fleet = require('./data/fleet');
const store = require('./data/store');
const terms = require('./data/terms');
const verification = require('./data/verification');
const { rentalPrice, daysBetween, HANDOVER } = require('./public/pricing');
const mailer = require('./lib/mailer');
const emails = require('./lib/emails');
const { createPayments } = require('./lib/payments');
const { createAdminRouter } = require('./lib/admin');

const PORT = Number(process.env.PORT) || 3000;
// RENDER_EXTERNAL_URL is set automatically on Render.
const SITE_URL = (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const CURRENCY = (process.env.CURRENCY || 'gbp').toLowerCase();
const DEPOSIT_PERCENT = Number(process.env.DEPOSIT_PERCENT) || 25;
const MAX_RENTAL_DAYS = 30;
const UPLOAD_DIR = path.join(store.DATA_DIR, 'uploads');
const CONTACT = {
  phone: process.env.CONTACT_PHONE || '+44 0000 000000',
  whatsapp: (process.env.CONTACT_WHATSAPP || '440000000000').replace(/\D/g, ''),
  email: process.env.CONTACT_EMAIL || 'info@example.com',
  instagram: process.env.CONTACT_INSTAGRAM || 'https://instagram.com/'
};
// Where new booking, enquiry and verification alerts go.
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || CONTACT.email;

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const payments = createPayments(stripe, CURRENCY);
const links = {
  verify: (b) => `${SITE_URL}/verify.html?b=${b.id}&t=${b.token}`,
  deposit: (b) => `${SITE_URL}/deposit.html?b=${b.id}&t=${b.token}`
};
const ctx = { currency: CURRENCY, contact: CONTACT, siteUrl: SITE_URL, paymentsLive: Boolean(stripe), links };
const app = express();
// Behind a proxy or load balancer (Render, Railway, Heroku...) set TRUST_PROXY=1 so recorded IP addresses are the customer's.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const newToken = () => crypto.randomBytes(24).toString('hex');
const sameToken = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

// A record of the customer agreeing to the terms: which exact wording, when, who (typed name), from where.
function acceptance(req, signature) {
  return {
    termsVersion: terms.version,
    termsHash: terms.hash,
    signature,
    acceptedAt: new Date().toISOString(),
    ip: req.ip,
    userAgent: clean(req.headers['user-agent'], 300)
  };
}

function bookingFromToken(id, token) {
  const b = store.find('bookings', clean(id, 40));
  return b && sameToken(b.token, token) ? b : null;
}

async function sendBookingEmails(booking) {
  await Promise.all([
    mailer.send({ to: booking.email, replyTo: BUSINESS_EMAIL, ...emails.bookingConfirmed(booking, ctx) }),
    mailer.send({ to: BUSINESS_EMAIL, replyTo: booking.email, ...emails.newBookingAlert(booking, ctx) })
  ]);
}

async function markDepositPaid(bookingId, fields) {
  const b = store.find('bookings', bookingId);
  if (!b || b.securityDeposit?.status === 'paid') return; // Stripe can deliver an event twice
  const updated = store.update('bookings', b.id, { securityDeposit: { ...b.securityDeposit, status: 'paid', paidAt: new Date().toISOString(), ...fields } });
  await Promise.all([
    mailer.send({ to: b.email, replyTo: BUSINESS_EMAIL, ...emails.depositPaid(updated, ctx) }),
    mailer.send({ to: BUSINESS_EMAIL, ...emails.depositPaidAlert(updated, ctx) })
  ]);
}

// Stripe needs the raw body to verify the webhook signature, so this route comes before express.json().
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).send('Webhook not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      if (session.metadata.type === 'security_deposit') {
        await markDepositPaid(session.metadata.bookingId, { intentId: session.payment_intent, method: 'card' });
      } else {
        const existing = store.find('bookings', session.metadata.bookingId);
        if (existing && existing.status !== 'paid') {
          // The saved card is used later to charge any balance.
          const intent = await stripe.paymentIntents.retrieve(session.payment_intent);
          const booking = store.update('bookings', existing.id, {
            status: 'paid',
            amountPaid: session.amount_total / 100,
            stripeSessionId: session.id,
            stripeCustomerId: session.customer,
            paymentMethodId: intent.payment_method,
            paidAt: new Date().toISOString()
          });
          await sendBookingEmails(booking);
        }
      }
    } catch (err) {
      console.error('Webhook handling failed:', err.message);
      return res.status(500).send('Retry later'); // Stripe retries failed webhooks automatically
    }
  }
  res.json({ received: true });
});

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(createAdminRouter({ payments, ctx, uploadDir: UPLOAD_DIR }));

app.get('/api/config', (req, res) => {
  res.json({ currency: CURRENCY, depositPercent: DEPOSIT_PERCENT, paymentsEnabled: Boolean(stripe), contact: CONTACT, handover: HANDOVER });
});
app.get('/api/fleet', (req, res) => res.json(fleet));
app.get('/api/terms', (req, res) => res.json(terms));
app.get('/api/verification-config', (req, res) => res.json({ questions: verification.questions, documents: verification.documents }));

app.post('/api/inquiries', async (req, res) => {
  const b = req.body || {};
  if (b.company) return res.json({ ok: true }); // honeypot field: bots fill it, people never see it
  const inquiry = {
    id: crypto.randomUUID(),
    name: clean(b.name, 100),
    email: clean(b.email, 150),
    phone: clean(b.phone, 40),
    topic: clean(b.topic, 60),
    carId: clean(b.carId, 40),
    date: clean(b.date, 10),
    message: clean(b.message, 2000),
    createdAt: new Date().toISOString()
  };
  if (!inquiry.name || !EMAIL_RE.test(inquiry.email) || !inquiry.phone || !inquiry.message) {
    return res.status(400).json({ error: 'Please include your name, a valid email, your phone number and a message.' });
  }
  inquiry.carName = fleet.find((c) => c.id === inquiry.carId)?.name || '';
  store.insert('inquiries', inquiry);
  await Promise.all([
    mailer.send({ to: inquiry.email, replyTo: BUSINESS_EMAIL, ...emails.enquiryReceived(inquiry, ctx) }),
    mailer.send({ to: BUSINESS_EMAIL, replyTo: inquiry.email, ...emails.newEnquiryAlert(inquiry, ctx) })
  ]);
  res.json({ ok: true });
});

app.post('/api/bookings', async (req, res) => {
  const b = req.body || {};
  if (b.company) return res.json({ ok: true });

  const car = fleet.find((c) => c.id === b.carId);
  if (!car) return res.status(400).json({ error: 'Please choose a vehicle.' });
  if (!car.dailyRate) return res.status(400).json({ error: `The ${car.name} is price on request. Please send an enquiry instead.` });

  // Customers pick dates in their own timezone, so allow "today" anywhere in the world (UTC minus one day).
  const earliest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const days = daysBetween(b.pickupDate, b.dropoffDate);
  if (!days || b.pickupDate < earliest) return res.status(400).json({ error: 'Please choose valid pickup and return dates.' });
  if (days < 1 || days > MAX_RENTAL_DAYS) {
    return res.status(400).json({ error: `Online bookings run from 1 to ${MAX_RENTAL_DAYS} days. Enquire for longer hires.` });
  }
  const handover = HANDOVER[b.handover] ? b.handover : 'none';
  const address = clean(b.delivery, 200);
  if (handover !== 'none' && !address) return res.status(400).json({ error: 'Please add the address for delivery or collection.' });

  const name = clean(b.name, 100);
  const email = clean(b.email, 150);
  const phone = clean(b.phone, 40);
  if (!name || !EMAIL_RE.test(email) || !phone) {
    return res.status(400).json({ error: 'Please include your name, email and phone number.' });
  }
  const checked = verification.checkAnswers(b.answers);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const signature = clean(b.signature, 100);
  if (!b.agreeTerms || !signature) {
    return res.status(400).json({ error: 'Please read and accept the rental terms and type your full name to sign.' });
  }

  const hireTotal = rentalPrice(car, days);
  const handoverFee = HANDOVER[handover].fee;
  const total = hireTotal + handoverFee;
  const deposit = Math.round((total * DEPOSIT_PERCENT) / 100);
  const payInFull = b.paymentOption === 'full';
  const amountDue = payInFull ? total : deposit;

  const id = crypto.randomUUID();
  const verificationId = crypto.randomUUID();
  const booking = store.insert('bookings', {
    id,
    ref: `BG-${id.slice(0, 6).toUpperCase()}`,
    token: newToken(),
    verificationId,
    carId: car.id,
    carName: car.name,
    pickupDate: b.pickupDate,
    dropoffDate: b.dropoffDate,
    pickupTime: clean(b.pickupTime, 10),
    handover,
    delivery: address,
    name,
    email,
    phone,
    notes: clean(b.notes, 1000),
    days,
    hireTotal,
    handoverFee,
    total,
    deposit,
    paymentOption: payInFull ? 'full' : 'deposit',
    amountDue,
    termsAcceptance: acceptance(req, signature),
    status: 'pending_payment',
    createdAt: new Date().toISOString()
  });
  store.insert('verifications', {
    id: verificationId,
    bookingId: id,
    bookingRef: booking.ref,
    name,
    email,
    phone,
    answers: checked.answers,
    flags: checked.flags,
    termsAcceptance: booking.termsAcceptance,
    niNumber: '',
    documents: {},
    status: 'awaiting_documents',
    createdAt: booking.createdAt
  });

  if (!stripe) {
    // Demo mode: treat the booking as paid so emails and the admin tools can be tried out.
    const paid = store.update('bookings', id, { status: 'paid', amountPaid: amountDue, demo: true, paidAt: new Date().toISOString() });
    await sendBookingEmails(paid);
    return res.json({ url: `/success.html?b=${id}&t=${booking.token}&demo=1` });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      customer_creation: 'always',
      // Save the card so any remaining balance can be charged without the customer re-entering it.
      payment_intent_data: { setup_future_usage: 'off_session', metadata: { bookingId: id } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: Math.round(amountDue * 100),
            product_data: {
              name: `${car.name}: ${payInFull ? 'self-drive hire' : `${DEPOSIT_PERCENT}% reservation payment`}`,
              description: `${b.pickupDate} to ${b.dropoffDate} (${days} day${days === 1 ? '' : 's'})`
            }
          }
        }
      ],
      metadata: { bookingId: id, type: 'booking' },
      success_url: `${SITE_URL}/success.html?b=${id}&t=${booking.token}`,
      cancel_url: `${SITE_URL}/cancel.html`
    });
    store.update('bookings', id, { stripeSessionId: session.id });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(502).json({ error: 'We could not start the payment. Please try again or call us.' });
  }
});

app.get('/api/bookings/:id', (req, res) => {
  const b = bookingFromToken(req.params.id, req.query.t);
  if (!b) return res.status(404).json({ error: 'Not found' });
  const v = store.find('verifications', b.verificationId);
  const { ref, carName, pickupDate, dropoffDate, days, total, amountDue, paymentOption, status } = b;
  res.json({ ref, carName, pickupDate, dropoffDate, days, total, amountDue, paymentOption, status, documentsDone: v?.status !== 'awaiting_documents' });
});

// ---- Driver verification: questions, terms and documents ----

// Checks the file really is what it claims to be by its first bytes, not just its name.
function sniff(buf) {
  const head = buf.subarray(0, 12);
  if (head.subarray(0, 4).toString() === '%PDF') return 'application/pdf';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (head.subarray(4, 8).toString() === 'ftyp' && /^(heic|heix|mif1|msf1|heif)$/.test(head.subarray(8, 12).toString())) return 'image/heic';
  return null;
}
const EXT = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic' };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: verification.documents.length, fields: 30 }
}).fields(verification.documents.map((d) => ({ name: d.id, maxCount: 1 })));

app.get('/api/verify', (req, res) => {
  if (!req.query.b) return res.json({ standalone: true });
  const b = bookingFromToken(req.query.b, req.query.t);
  if (!b) return res.status(404).json({ error: 'This link is not valid. Please use the link from your confirmation email or call us.' });
  const v = store.find('verifications', b.verificationId);
  res.json({
    standalone: false,
    ref: b.ref,
    carName: b.carName,
    name: b.name,
    pickupDate: b.pickupDate,
    complete: v.status !== 'awaiting_documents',
    uploaded: Object.keys(v.documents),
    hasNi: Boolean(v.niNumber)
  });
});

app.post('/api/verify', (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 10 MB or smaller.' : 'The upload failed. Please try again.';
      return res.status(400).json({ error: msg });
    }
    const body = req.body || {};
    const files = req.files || {};
    let v;
    let booking = null;

    if (body.b) {
      booking = bookingFromToken(body.b, body.t);
      if (!booking) return res.status(404).json({ error: 'This link is not valid.' });
      v = store.find('verifications', booking.verificationId);
    } else {
      // Standalone form (customers who booked by phone or WhatsApp): needs details, answers and terms too.
      const name = clean(body.name, 100);
      const email = clean(body.email, 150);
      const phone = clean(body.phone, 40);
      if (!name || !EMAIL_RE.test(email) || !phone) return res.status(400).json({ error: 'Please include your name, email and phone number.' });
      let answers;
      try {
        answers = JSON.parse(body.answers || '{}');
      } catch {
        answers = {};
      }
      const checked = verification.checkAnswers(answers);
      if (checked.error) return res.status(400).json({ error: checked.error });
      const signature = clean(body.signature, 100);
      if (body.agreeTerms !== 'true' || !signature) return res.status(400).json({ error: 'Please read and accept the rental terms and type your full name to sign.' });
      v = {
        id: crypto.randomUUID(),
        bookingId: null,
        bookingRef: clean(body.bookingRef, 40),
        name,
        email,
        phone,
        answers: checked.answers,
        flags: checked.flags,
        termsAcceptance: acceptance(req, signature),
        documents: {},
        createdAt: new Date().toISOString()
      };
    }

    const ni = clean(body.niNumber, 20).replace(/\s/g, '').toUpperCase();
    if (!verification.NI_RE.test(ni)) return res.status(400).json({ error: 'Please enter a valid National Insurance number, e.g. AB 12 34 56 C.' });

    // Validate every file before saving any.
    const incoming = {};
    for (const d of verification.documents) {
      const f = files[d.id]?.[0];
      if (!f) {
        if (v.documents[d.id]) continue; // already uploaded earlier
        return res.status(400).json({ error: `Please upload: ${d.label}` });
      }
      const type = sniff(f.buffer);
      if (!type || !verification.MIME[d.accept].includes(type)) {
        const want = d.accept === 'pdf' ? 'a PDF' : d.accept === 'image' ? 'a photo (JPG, PNG or HEIC)' : 'a photo or PDF';
        return res.status(400).json({ error: `${d.label} must be ${want}.` });
      }
      incoming[d.id] = { buffer: f.buffer, type, originalName: clean(f.originalname, 120), size: f.size };
    }

    const dir = path.join(UPLOAD_DIR, v.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const [docId, f] of Object.entries(incoming)) {
      const stored = `${docId}${EXT[f.type]}`;
      for (const old of fs.readdirSync(dir).filter((n) => n.startsWith(`${docId}.`))) fs.unlinkSync(path.join(dir, old));
      fs.writeFileSync(path.join(dir, stored), f.buffer);
      v.documents[docId] = { stored, type: f.type, originalName: f.originalName, size: f.size, uploadedAt: new Date().toISOString() };
    }
    v.niNumber = ni;
    v.status = 'submitted';
    v.submittedAt = new Date().toISOString();

    if (store.find('verifications', v.id)) store.update('verifications', v.id, v);
    else store.insert('verifications', v);

    await Promise.all([
      mailer.send({ to: v.email, replyTo: BUSINESS_EMAIL, ...emails.verificationReceived(v, ctx) }),
      mailer.send({ to: BUSINESS_EMAIL, replyTo: v.email, ...emails.newVerificationAlert(v, ctx) })
    ]);
    res.json({ ok: true, flags: v.flags });
  });
});

// ---- Security deposit: shown with the terms, accepted, then paid ----

app.get('/api/deposit', (req, res) => {
  const b = bookingFromToken(req.query.b, req.query.t);
  if (!b || !b.securityDeposit) return res.status(404).json({ error: 'There is no deposit request for this link. Please call us if you think this is wrong.' });
  const d = b.securityDeposit;
  res.json({ ref: b.ref, carName: b.carName, name: b.name, pickupDate: b.pickupDate, dropoffDate: b.dropoffDate, amount: d.amount, status: d.status });
});

app.post('/api/deposit', async (req, res) => {
  const body = req.body || {};
  const b = bookingFromToken(body.b, body.t);
  if (!b || !b.securityDeposit) return res.status(404).json({ error: 'There is no deposit request for this link.' });
  if (b.securityDeposit.status !== 'requested') return res.status(400).json({ error: 'This deposit has already been paid.' });
  const signature = clean(body.signature, 100);
  if (!body.agreeTerms || !signature) return res.status(400).json({ error: 'Please tick to accept the rental terms and type your full name to sign.' });

  const updated = store.update('bookings', b.id, { securityDeposit: { ...b.securityDeposit, termsAcceptance: acceptance(req, signature) } });
  const back = `${SITE_URL}/deposit.html?b=${b.id}&t=${b.token}`;
  try {
    const url = await payments.depositCheckoutUrl(updated, { successUrl: `${back}&paid=1`, cancelUrl: back });
    if (url) return res.json({ url });
    await markDepositPaid(b.id, { method: 'demo' });
    res.json({ url: `${back}&paid=1&demo=1` });
  } catch (err) {
    console.error('Deposit checkout failed:', err.message);
    res.status(502).json({ error: 'We could not start the payment. Please try again or call us.' });
  }
});

app.listen(PORT, () => {
  console.log(`BG LUX running at ${SITE_URL}`);
  if (!stripe) console.log('  Demo mode: no STRIPE_SECRET_KEY, payments are simulated.');
  if (!mailer.configured) console.log('  Email: no SMTP_HOST, emails are saved to data/outbox.json instead of sent.');
  console.log(process.env.ADMIN_PASSWORD ? `  Admin: ${SITE_URL}/admin` : '  Admin: disabled (set ADMIN_PASSWORD).');
});
