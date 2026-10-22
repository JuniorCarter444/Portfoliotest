const state = { fleet: [], config: { currency: 'usd', depositPercent: 25, securityDeposit: 1000 }, filter: 'All' };

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: state.config.currency.toUpperCase(), maximumFractionDigits: 0 }).format(n);
// Local calendar date (not UTC) so evening visitors aren't pushed to tomorrow.
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const CAR_SVG = `<svg viewBox="0 0 200 70" fill="currentColor" aria-hidden="true"><path d="M8 50c0-6 4-9 10-10l24-4 26-16c6-3 12-5 20-5h34c8 0 14 2 20 7l16 13 24 4c6 1 10 5 10 11v6c0 2-2 4-4 4h-12a16 16 0 0 0-32 0H64a16 16 0 0 0-32 0H12c-2 0-4-2-4-4z"/><circle cx="48" cy="60" r="10"/><circle cx="160" cy="60" r="10"/></svg>`;

async function init() {
  $('#year').textContent = new Date().getFullYear();
  setupNav();
  try {
    const [config, fleet] = await Promise.all([fetch('/api/config').then((r) => r.json()), fetch('/api/fleet').then((r) => r.json())]);
    state.config = config;
    state.fleet = fleet;
  } catch {
    $('.fleet-grid').innerHTML = '<p>We could not load the fleet. Please refresh the page.</p>';
    return;
  }
  $('.dep-pct').textContent = `${state.config.depositPercent}%`;
  $('.sec-dep').textContent = money(state.config.securityDeposit);
  renderFilters();
  renderFleet();
  setupBooking();
  setupContact();
}

function setupNav() {
  const toggle = $('.nav-toggle');
  const links = $('.nav-links');
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
  links.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}

function renderFilters() {
  const cats = ['All', ...new Set(state.fleet.map((c) => c.category))];
  const wrap = $('.filters');
  wrap.innerHTML = cats.map((c) => `<button role="tab" aria-selected="${c === state.filter}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.filter = btn.dataset.cat;
    wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b === btn));
    renderFleet();
  });
}

function renderFleet() {
  const cars = state.fleet.filter((c) => state.filter === 'All' || c.category === state.filter);
  $('.fleet-grid').innerHTML = cars.map((c) => `
    <article class="card car">
      <div class="car-media">
        ${c.image ? `<img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy">` : CAR_SVG}
        <span class="car-tag">${esc(c.category)}</span>
      </div>
      <div class="car-body">
        <h3>${esc(c.name)}</h3>
        <ul class="specs"><li>${c.hp} hp</li><li>0–60 ${c.zeroToSixty}s</li><li>${c.seats} seats</li></ul>
        <div class="car-foot">
          <span class="price">${money(c.dailyRate)} <small>/ day</small></span>
          <button class="btn btn-ghost btn-sm" data-reserve="${esc(c.id)}">Reserve</button>
        </div>
      </div>
    </article>`).join('');
}

function setupBooking() {
  const form = $('#booking-form');
  const select = form.carId;
  select.innerHTML = '<option value="">Choose a vehicle…</option>' +
    state.fleet.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} · ${money(c.dailyRate)}/day</option>`).join('');

  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  form.pickupDate.min = isoDate(today);
  form.pickupDate.value = isoDate(today);
  form.dropoffDate.min = isoDate(tomorrow);
  form.dropoffDate.value = isoDate(tomorrow);

  $('.fleet-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-reserve]');
    if (!btn) return;
    select.value = btn.dataset.reserve;
    updateQuote();
    $('#book').scrollIntoView({ behavior: 'smooth' });
  });

  form.pickupDate.addEventListener('change', () => {
    const [y, m, d] = form.pickupDate.value.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    form.dropoffDate.min = isoDate(next);
    if (form.dropoffDate.value <= form.pickupDate.value) form.dropoffDate.value = isoDate(next);
  });
  form.addEventListener('input', updateQuote);
  form.addEventListener('change', updateQuote);
  updateQuote();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-msg', form);
    if (!validate(form, msg)) return;
    const data = Object.fromEntries(new FormData(form));
    data.over25 = form.over25.checked;
    data.agreeTerms = form.agreeTerms.checked;
    await submit(form, msg, '/api/bookings', data, (res) => {
      if (res.url) window.location.href = res.url;
    });
  });
}

function currentQuote() {
  const form = $('#booking-form');
  const car = state.fleet.find((c) => c.id === form.carId.value);
  const start = new Date(`${form.pickupDate.value}T00:00:00Z`);
  const end = new Date(`${form.dropoffDate.value}T00:00:00Z`);
  const days = Math.round((end - start) / 86400000);
  if (!car || !(days > 0)) return { car };
  const total = car.dailyRate * days;
  const deposit = Math.round((total * state.config.depositPercent) / 100);
  const due = form.paymentOption.value === 'full' ? total : deposit;
  return { car, days, total, due };
}

function updateQuote() {
  const q = currentQuote();
  const set = (k, v) => ($(`[data-q="${k}"]`).textContent = v);
  $('.summary-car').textContent = q.car ? q.car.name : 'Select a vehicle';
  set('rate', q.car ? money(q.car.dailyRate) : '–');
  set('days', q.days || '–');
  set('total', q.total ? money(q.total) : '–');
  set('due', q.due ? money(q.due) : '–');
}

function setupContact() {
  const form = $('#contact-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-msg', form);
    if (!validate(form, msg)) return;
    await submit(form, msg, '/api/inquiries', Object.fromEntries(new FormData(form)), () => {
      form.reset();
      msg.className = 'form-msg ok';
      msg.textContent = 'Thanks! Your message has been sent. We will be in touch soon.';
    });
  });
}

function validate(form, msg) {
  let firstBad = null;
  form.querySelectorAll('[required]').forEach((el) => {
    const bad = el.type === 'checkbox' ? !el.checked : !el.checkValidity() || !el.value.trim();
    el.classList.toggle('invalid', bad);
    if (bad && !firstBad) firstBad = el;
  });
  if (firstBad) {
    msg.className = 'form-msg error';
    msg.textContent = firstBad.type === 'checkbox' ? 'Please confirm the requirements above.' : 'Please fill in the highlighted fields.';
    firstBad.focus();
    return false;
  }
  msg.textContent = '';
  return true;
}

async function submit(form, msg, url, data, onOk) {
  const btn = form.querySelector('button[type="submit"]');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Please wait…';
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
    onOk(body);
  } catch (err) {
    msg.className = 'form-msg error';
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

init();
