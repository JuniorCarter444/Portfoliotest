const state = { fleet: [], config: { currency: 'gbp', depositPercent: 25, contact: {} }, filter: 'All' };
const CATEGORY_ORDER = ['Supercar', 'Prestige', 'SUV', 'Saloon'];
const CATEGORY_LABELS = { All: 'All cars', Supercar: 'Supercars', SUV: 'SUVs', Saloon: 'Saloons' };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: state.config.currency.toUpperCase(), maximumFractionDigits: 0 }).format(n);
// Local calendar date (not UTC) so evening visitors aren't pushed to tomorrow.
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + n));
};
const bookable = () => state.fleet.filter((c) => c.dailyRate);

async function init() {
  $('#year').textContent = new Date().getFullYear();
  setupNav();
  try {
    const [config, fleet] = await Promise.all([fetch('/api/config').then((r) => r.json()), fetch('/api/fleet').then((r) => r.json())]);
    state.config = config;
    state.fleet = fleet;
  } catch {
    $('.fleet-grid').innerHTML = '<p class="muted">We could not load the fleet. Please refresh the page or call us.</p>';
    return;
  }
  applyContact();
  $$('.dep-pct').forEach((el) => (el.textContent = `${state.config.depositPercent}%`));
  renderFilters();
  renderFleet();
  setupBooking();
  setupQuickBook();
  setupEnquiry();
}

function applyContact() {
  const c = state.config.contact || {};
  const wa = `https://wa.me/${c.whatsapp}?text=${encodeURIComponent("Hi BG LUX, I'd like to enquire about hiring a car.")}`;
  $$('[data-tel]').forEach((a) => (a.href = `tel:${(c.phone || '').replace(/[^\d+]/g, '')}`));
  $$('[data-wa]').forEach((a) => Object.assign(a, { href: wa, target: '_blank', rel: 'noopener' }));
  $$('[data-mail]').forEach((a) => (a.href = `mailto:${c.email}`));
  $$('[data-ig]').forEach((a) => (a.href = c.instagram));
  $$('[data-text]').forEach((el) => (el.textContent = c[el.dataset.text] || ''));
}

function setupNav() {
  const nav = $('.nav');
  const toggle = $('.nav-toggle');
  const links = $('.nav-links');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 30);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const setOpen = (open) => {
    links.classList.toggle('open', open);
    nav.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', open);
  };
  toggle.addEventListener('click', () => setOpen(!links.classList.contains('open')));
  links.addEventListener('click', (e) => e.target.tagName === 'A' && setOpen(false));
}

function renderFilters() {
  const present = new Set(state.fleet.map((c) => c.category));
  const cats = ['All', ...CATEGORY_ORDER.filter((c) => present.has(c)), ...[...present].filter((c) => !CATEGORY_ORDER.includes(c))];
  const wrap = $('.filters');
  wrap.innerHTML = cats.map((c) => `<button role="tab" aria-selected="${c === state.filter}" data-cat="${esc(c)}">${esc(CATEGORY_LABELS[c] || c)}</button>`).join('');
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.filter = btn.dataset.cat;
    $$('button', wrap).forEach((b) => b.setAttribute('aria-selected', b === btn));
    renderFleet();
  });
}

function carCard(c) {
  const pkgs = (c.packages || []).map((p) => `<span class="pkg">${money(p.price)} <small>/ ${esc(p.label)}</small></span>`).join('');
  const prices = c.dailyRate
    ? `<div class="prices"><span class="price">${money(c.dailyRate)} <small>/ day</small></span>${pkgs}</div>`
    : '<div class="prices"><span class="por">Price on request</span></div>';
  const actions = c.dailyRate
    ? `<div class="car-actions"><button class="btn btn-gold" data-book="${esc(c.id)}">Book</button><button class="btn btn-outline" data-enquire="${esc(c.id)}">Enquire</button></div>`
    : `<div class="car-actions single"><button class="btn btn-outline" data-enquire="${esc(c.id)}">Enquire</button></div>`;
  return `
    <article class="car">
      <div class="car-media">
        <span class="badge${c.featured ? ' gold' : ''}">${c.featured ? 'Premium' : esc(c.category)}</span>
        <img src="${esc(c.image)}" alt="${esc(`${c.name} ${c.trim || ''}`)}" loading="lazy">
      </div>
      <div class="car-body">
        <h3>${esc(c.name)}</h3>
        <p class="trim">${esc(c.trim)}</p>
        ${prices}
        ${c.shoots ? `<p class="shoots">${esc(c.shoots)}</p>` : ''}
        ${actions}
      </div>
    </article>`;
}

function renderFleet() {
  const all = state.filter === 'All';
  const cars = state.fleet.filter((c) => all || c.category === state.filter);
  $('.featured-grid').innerHTML = all ? cars.filter((c) => c.featured).map(carCard).join('') : '';
  $('.fleet-grid').innerHTML = cars.filter((c) => !all || !c.featured).map(carCard).join('');
}

function setupBooking() {
  const form = $('#booking-form');
  form.carId.innerHTML = '<option value="">Choose a vehicle…</option>' +
    bookable().map((c) => `<option value="${esc(c.id)}">${esc(c.name)} · ${money(c.dailyRate)}/day</option>`).join('');

  setDates(form);
  form.pickupDate.addEventListener('change', () => syncReturn(form));
  form.addEventListener('input', updateQuote);
  form.addEventListener('change', updateQuote);
  updateQuote();

  $('#fleet').addEventListener('click', (e) => {
    const book = e.target.closest('[data-book]');
    const enquire = e.target.closest('[data-enquire]');
    if (book) {
      form.carId.value = book.dataset.book;
      updateQuote();
      $('#book').scrollIntoView({ behavior: 'smooth' });
    } else if (enquire) {
      $('#enquiry-form').carId.value = enquire.dataset.enquire;
      $('#enquiry').scrollIntoView({ behavior: 'smooth' });
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-msg', form);
    if (!validate(form, msg)) return;
    const data = Object.fromEntries(new FormData(form));
    data.meetsRequirements = form.meetsRequirements.checked;
    data.agreeTerms = form.agreeTerms.checked;
    await submit(form, msg, '/api/bookings', data, (res) => {
      if (res.url) window.location.href = res.url;
    });
  });
}

function setDates(form) {
  const today = isoDate(new Date());
  form.pickupDate.min = today;
  form.pickupDate.value = today;
  form.dropoffDate.min = addDays(today, 1);
  form.dropoffDate.value = addDays(today, 1);
}

function syncReturn(form) {
  if (!form.pickupDate.value) return;
  const next = addDays(form.pickupDate.value, 1);
  form.dropoffDate.min = next;
  if (form.dropoffDate.value < next) form.dropoffDate.value = next;
}

function setupQuickBook() {
  const quick = $('#quick-book');
  const form = $('#booking-form');
  quick.carId.innerHTML = '<option value="">Any car</option>' + bookable().map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  setDates(quick);
  quick.pickupDate.addEventListener('change', () => syncReturn(quick));
  quick.addEventListener('submit', (e) => {
    e.preventDefault();
    form.carId.value = quick.carId.value;
    form.pickupDate.value = quick.pickupDate.value;
    syncReturn(form);
    form.dropoffDate.value = quick.dropoffDate.value;
    updateQuote();
    $('#book').scrollIntoView({ behavior: 'smooth' });
  });
}

function updateQuote() {
  const form = $('#booking-form');
  const car = state.fleet.find((c) => c.id === form.carId.value);
  const days = Pricing.daysBetween(form.pickupDate.value, form.dropoffDate.value);
  const total = car && days > 0 ? Pricing.rentalPrice(car, days) : null;
  const deposit = total && Math.round((total * state.config.depositPercent) / 100);
  const due = form.paymentOption.value === 'full' ? total : deposit;
  const saving = total ? car.dailyRate * days - total : 0;
  const set = (k, v) => ($(`[data-q="${k}"]`).textContent = v);

  $('.summary-car').textContent = car ? car.name : 'Select a vehicle';
  const img = $('.summary-img img');
  if (car) {
    img.src = car.image;
    img.alt = car.name;
  }
  img.hidden = !car;
  set('rate', car ? money(car.dailyRate) : '–');
  set('days', days > 0 ? `${days} day${days === 1 ? '' : 's'}` : '–');
  $('.summary .saving').hidden = !(saving > 0);
  set('saving', saving > 0 ? `−${money(saving)}` : '');
  set('total', total ? money(total) : '–');
  set('due', due ? money(due) : '–');
}

function setupEnquiry() {
  const form = $('#enquiry-form');
  form.carId.innerHTML = '<option value="">Not sure yet</option>' + state.fleet.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  form.date.min = isoDate(new Date());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-msg', form);
    if (!validate(form, msg)) return;
    await submit(form, msg, '/api/inquiries', Object.fromEntries(new FormData(form)), () => {
      form.reset();
      msg.className = 'form-msg ok';
      msg.textContent = "Thanks! Your enquiry has been sent. We'll be in touch shortly.";
    });
  });
}

function validate(form, msg) {
  let firstBad = null;
  $$('[required]', form).forEach((el) => {
    const bad = el.type === 'checkbox' ? !el.checked : !el.checkValidity() || !el.value.trim();
    el.classList.toggle('invalid', bad);
    if (bad && !firstBad) firstBad = el;
  });
  if (firstBad) {
    msg.className = 'form-msg error';
    msg.textContent = firstBad.type === 'checkbox' ? 'Please tick both boxes to continue.' : 'Please fill in the highlighted fields.';
    firstBad.focus();
    return false;
  }
  msg.textContent = '';
  return true;
}

async function submit(form, msg, url, data, onOk) {
  const btn = $('button[type="submit"]', form);
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
