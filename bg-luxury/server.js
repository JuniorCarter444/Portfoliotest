require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const fleet = require('./data/fleet');
const store = require('./data/store');
const { rentalPrice, daysBetween } = require('./public/pricing');

const PORT = Number(process.env.PORT) || 3000;
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const CURRENCY = (process.env.CURRENCY || 'gbp').toLowerCase();
const DEPOSIT_PERCENT = Number(process.env.DEPOSIT_PERCENT) || 25;
const MAX_RENTAL_DAYS = 30;
const CONTACT = {
  phone: process.env.CONTACT_PHONE || '+44 0000 000000',
  whatsapp: (process.env.CONTACT_WHATSAPP || '440000000000').replace(/\D/g, ''),
  email: process.env.CONTACT_EMAIL || 'info@example.com',
  instagram: process.env.CONTACT_INSTAGRAM || 'https://instagram.com/'
};

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const app = express();

// Stripe needs the raw body to verify the webhook signature, so this route comes before express.json().
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).send('Webhook not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    store.update('bookings', session.metadata.bookingId, {
      status: 'paid',
      amountPaid: session.amount_total / 100,
      stripeSessionId: session.id,
      paidAt: new Date().toISOString()
    });
  }
  res.json({ received: true });
});

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

app.get('/api/config', (req, res) => {
  res.json({ currency: CURRENCY, depositPercent: DEPOSIT_PERCENT, paymentsEnabled: Boolean(stripe), contact: CONTACT });
});

app.get('/api/fleet', (req, res) => res.json(fleet));

app.post('/api/inquiries', (req, res) => {
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
  store.insert('inquiries', inquiry);
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

  const name = clean(b.name, 100);
  const email = clean(b.email, 150);
  const phone = clean(b.phone, 40);
  if (!name || !EMAIL_RE.test(email) || !phone) {
    return res.status(400).json({ error: 'Please include your name, email and phone number.' });
  }
  if (!b.meetsRequirements || !b.agreeTerms) {
    return res.status(400).json({ error: 'Please confirm you meet the requirements and accept the terms.' });
  }

  const total = rentalPrice(car, days);
  const deposit = Math.round((total * DEPOSIT_PERCENT) / 100);
  const payInFull = b.paymentOption === 'full';
  const amountDue = payInFull ? total : deposit;

  const booking = store.insert('bookings', {
    id: crypto.randomUUID(),
    carId: car.id,
    carName: car.name,
    pickupDate: b.pickupDate,
    dropoffDate: b.dropoffDate,
    pickupTime: clean(b.pickupTime, 10),
    delivery: clean(b.delivery, 200),
    name,
    email,
    phone,
    notes: clean(b.notes, 1000),
    days,
    total,
    deposit,
    paymentOption: payInFull ? 'full' : 'deposit',
    amountDue,
    status: 'pending_payment',
    createdAt: new Date().toISOString()
  });

  if (!stripe) {
    return res.json({ url: `/success.html?booking=${booking.id}&demo=1` });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: Math.round(amountDue * 100),
            product_data: {
              name: `${car.name}: ${payInFull ? 'self-drive hire' : `${DEPOSIT_PERCENT}% reservation deposit`}`,
              description: `${b.pickupDate} to ${b.dropoffDate} (${days} day${days === 1 ? '' : 's'})`
            }
          }
        }
      ],
      metadata: { bookingId: booking.id },
      success_url: `${SITE_URL}/success.html?booking=${booking.id}`,
      cancel_url: `${SITE_URL}/cancel.html?booking=${booking.id}`
    });
    store.update('bookings', booking.id, { stripeSessionId: session.id });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(502).json({ error: 'We could not start the payment. Please try again or call us.' });
  }
});

app.get('/api/bookings/:id', (req, res) => {
  const booking = store.readAll('bookings').find((r) => r.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  const { carName, pickupDate, dropoffDate, days, total, amountDue, paymentOption, status } = booking;
  res.json({ carName, pickupDate, dropoffDate, days, total, amountDue, paymentOption, status });
});

app.listen(PORT, () => {
  console.log(`BG LUX running at ${SITE_URL}${stripe ? '' : ' (demo mode: no STRIPE_SECRET_KEY, payments are simulated)'}`);
});
