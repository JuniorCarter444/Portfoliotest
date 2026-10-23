// Email templates. Each returns { subject, html, text }.
// HTML uses inline styles and tables because many email apps ignore stylesheets.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const C = { page: '#f4f1ec', card: '#ffffff', line: '#e7e1d7', text: '#1f1b17', muted: '#6e665c', accent: '#7d6340' };

function money(n, currency) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: n % 1 ? 2 : 0 }).format(n || 0);
}

function longDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const first = (name) => esc(String(name).split(' ')[0]);

function button(href, label) {
  return `<p style="margin:22px 0 6px"><a href="${esc(href)}" style="display:inline-block;background:${C.text};color:#f4f1ec;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:14px 26px;border-radius:999px">${esc(label)}</a></p>`;
}

function layout({ heading, intro, rows = [], body = '', contact }) {
  const rowHtml = rows
    .map(([k, v, strong]) => `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.line};color:${C.muted};font-size:14px">${esc(k)}</td><td align="right" style="padding:10px 0;border-bottom:1px solid ${C.line};color:${strong ? C.accent : C.text};font-size:14px;font-weight:${strong ? 700 : 600}">${esc(v)}</td></tr>`)
    .join('');
  const html = `<!DOCTYPE html><html><body style="margin:0;background:${C.page};font-family:Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:32px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:14px">
<tr><td style="padding:28px 32px 0">
  <span style="display:inline-block;border:1.5px solid ${C.text};border-radius:6px;padding:6px 8px;color:${C.text};font-weight:800;font-style:italic;font-size:15px">BG LUX</span>
  <span style="color:${C.accent};font-size:11px;letter-spacing:3px;padding-left:10px">LUXURY CARS · LONDON</span>
</td></tr>
<tr><td style="padding:26px 32px 6px">
  <h1 style="margin:0 0 12px;font-family:Georgia,serif;font-weight:400;font-size:27px;color:${C.text}">${esc(heading)}</h1>
  <p style="margin:0;color:${C.muted};font-size:15px;line-height:1.6">${intro}</p>
</td></tr>
${rows.length ? `<tr><td style="padding:12px 32px"><table width="100%" cellpadding="0" cellspacing="0">${rowHtml}</table></td></tr>` : ''}
${body ? `<tr><td style="padding:6px 32px 10px;color:${C.muted};font-size:14px;line-height:1.6">${body}</td></tr>` : ''}
<tr><td style="padding:20px 32px 28px;color:${C.muted};font-size:12.5px;line-height:1.6;border-top:1px solid ${C.line}">
  Questions? Call <a href="tel:${esc(contact.phone.replace(/[^\d+]/g, ''))}" style="color:${C.accent}">${esc(contact.phone)}</a>, WhatsApp <a href="https://wa.me/${esc(contact.whatsapp)}" style="color:${C.accent}">wa.me/${esc(contact.whatsapp)}</a> or reply to this email.<br>BG LUX Luxury Cars London · Drive in Style
</td></tr>
</table></td></tr></table></body></html>`;
  const strip = (s) => s.replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g, '$2 ($1)').replace(/<br>|<\/p>|<\/li>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  const text = [heading, '', strip(intro), '', ...rows.map(([k, v]) => `${k}: ${v}`), '', strip(body), '', `Questions? Call ${contact.phone} or WhatsApp https://wa.me/${contact.whatsapp}`].join('\n');
  return { html, text };
}

function bookingRows(b, currency) {
  const balance = Math.max(0, b.total - (b.amountPaid ?? 0));
  return [
    ['Booking reference', b.ref],
    ['Vehicle', b.carName],
    ['Collection', `${longDate(b.pickupDate)}${b.pickupTime ? `, ${b.pickupTime}` : ''}`],
    ['Return', longDate(b.dropoffDate)],
    ...(b.handoverFee ? [['Delivery / collection', `${money(b.handoverFee, currency)}${b.delivery ? `: ${b.delivery}` : ''}`]] : []),
    ['Total', money(b.total, currency)],
    ['Paid', money(b.amountPaid ?? 0, currency)],
    ['Balance due', money(balance, currency), true]
  ];
}

module.exports = {
  bookingConfirmed(b, { currency, contact, links }) {
    const { html, text } = layout({
      heading: 'Your booking is confirmed',
      intro: `Hi ${first(b.name)}, thank you for booking with BG LUX. Your details are below.`,
      rows: bookingRows(b, currency),
      body: `<p style="margin:8px 0 0;color:${C.text};font-weight:600">Next step: verify your details</p>
<p style="margin:4px 0 0">Please upload your driving licence (front and back), National Insurance number, a PDF bank statement from the last two months, a recent utility bill and one more proof of address. Your security deposit (£1,000 to £10,000) is set once we've reviewed these, and is refunded 3 weeks after the car is returned.</p>
${button(links.verify(b), 'Upload documents')}`,
      contact
    });
    return { subject: `Booking confirmed: ${b.carName} (${b.ref})`, html, text };
  },

  newBookingAlert(b, { currency, contact, siteUrl }) {
    const { html, text } = layout({
      heading: `New booking: ${b.carName}`,
      intro: `${esc(b.name)} · <a href="tel:${esc(b.phone)}" style="color:${C.accent}">${esc(b.phone)}</a> · <a href="mailto:${esc(b.email)}" style="color:${C.accent}">${esc(b.email)}</a>`,
      rows: bookingRows(b, currency),
      body: `${b.notes ? `<p><b style="color:${C.text}">Notes:</b> ${esc(b.notes)}</p>` : ''}<p>Terms accepted and signed "${esc(b.termsAcceptance?.signature)}". The customer has been asked to upload their documents.</p>${button(`${siteUrl}/admin`, 'Open admin')}`,
      contact
    });
    return { subject: `New booking ${b.ref}: ${b.carName}, ${b.pickupDate}`, html, text };
  },

  enquiryReceived(q, { contact }) {
    const { html, text } = layout({
      heading: 'We received your enquiry',
      intro: `Hi ${first(q.name)}, thanks for getting in touch. A member of the BG LUX team will reply shortly.`,
      rows: [['Enquiry', q.topic], ...(q.carName ? [['Vehicle', q.carName]] : []), ...(q.date ? [['Date', longDate(q.date)]] : [])],
      body: `<p style="margin:0"><b style="color:${C.text}">Your message:</b><br>${esc(q.message).replace(/\n/g, '<br>')}</p>`,
      contact
    });
    return { subject: 'Thanks for your enquiry: BG LUX', html, text };
  },

  newEnquiryAlert(q, { contact }) {
    const { html, text } = layout({
      heading: `New enquiry: ${q.topic}`,
      intro: `${esc(q.name)} · <a href="tel:${esc(q.phone)}" style="color:${C.accent}">${esc(q.phone)}</a> · <a href="mailto:${esc(q.email)}" style="color:${C.accent}">${esc(q.email)}</a>`,
      rows: [...(q.carName ? [['Vehicle', q.carName]] : []), ...(q.date ? [['Date', longDate(q.date)]] : [])],
      body: `<p style="margin:0">${esc(q.message).replace(/\n/g, '<br>')}</p>`,
      contact
    });
    return { subject: `New enquiry from ${q.name}: ${q.topic}`, html, text };
  },

  verificationReceived(v, { contact }) {
    const { html, text } = layout({
      heading: 'Documents received',
      intro: `Hi ${first(v.name)}, thank you. We've received your verification form and documents and will review them shortly. We'll then confirm your security deposit.`,
      body: v.flags.length ? `<p style="margin:0;color:${C.text}"><b>Please give us a call</b> to talk through: ${esc(v.flags.join('; '))}.</p>` : '',
      contact
    });
    return { subject: 'Documents received: BG LUX', html, text };
  },

  newVerificationAlert(v, { contact, siteUrl }) {
    const { html, text } = layout({
      heading: `Verification submitted${v.bookingRef ? `: ${v.bookingRef}` : ''}`,
      intro: `${esc(v.name)} · <a href="tel:${esc(v.phone)}" style="color:${C.accent}">${esc(v.phone)}</a> · <a href="mailto:${esc(v.email)}" style="color:${C.accent}">${esc(v.email)}</a>`,
      body: `${v.flags.length ? `<p style="margin:0;color:#a0402c"><b>Call required:</b> ${esc(v.flags.join('; '))}</p>` : '<p style="margin:0">No answers needing a call.</p>'}${button(`${siteUrl}/admin`, 'Review in admin')}`,
      contact
    });
    return { subject: `Verification submitted by ${v.name}${v.flags.length ? ' (call required)' : ''}`, html, text };
  },

  depositRequested(b, { currency, contact, links }) {
    const { html, text } = layout({
      heading: 'Your security deposit',
      intro: `Hi ${first(b.name)}, thanks for completing your verification. The refundable security deposit for your ${esc(b.carName)} hire (${esc(b.ref)}) is <b style="color:${C.text}">${money(b.securityDeposit.amount, currency)}</b>.`,
      body: `<p style="margin:0">It's refunded 3 weeks after the vehicle is returned, once it's clear of any fines or tickets, less any charges under the rental terms. You'll be asked to review and accept the terms before paying.</p>${button(links.deposit(b), 'Review terms & pay deposit')}`,
      contact
    });
    return { subject: `Security deposit for ${b.ref}: ${money(b.securityDeposit.amount, currency)}`, html, text };
  },

  depositPaid(b, { currency, contact }) {
    const { html, text } = layout({
      heading: 'Deposit received',
      intro: `Hi ${first(b.name)}, we've received your ${money(b.securityDeposit.amount, currency)} security deposit for ${esc(b.carName)} (${esc(b.ref)}). It will be refunded 3 weeks after the vehicle is returned, less any charges under the rental terms.`,
      body: `<p style="margin:0">Remember: no smoking, eating, drinking or balloons in the car, and 100 miles a day are included (£1 per extra mile).</p>`,
      contact
    });
    return { subject: `Deposit received: ${b.ref}`, html, text };
  },

  depositPaidAlert(b, { currency, contact }) {
    const a = b.securityDeposit.termsAcceptance;
    const { html, text } = layout({
      heading: `Deposit paid: ${b.ref}`,
      intro: `${esc(b.name)} paid the ${money(b.securityDeposit.amount, currency)} security deposit for ${esc(b.carName)}.`,
      body: a ? `<p style="margin:0">Terms version ${esc(a.termsVersion)} accepted and signed "${esc(a.signature)}" at ${esc(a.acceptedAt)}.</p>` : '',
      contact
    });
    return { subject: `Deposit paid: ${b.ref} (${money(b.securityDeposit.amount, currency)})`, html, text };
  },

  depositRefunded(b, { currency, contact }) {
    const d = b.securityDeposit;
    const { html, text } = layout({
      heading: d.deduction ? 'Security deposit update' : 'Security deposit refunded',
      intro: `Hi ${first(b.name)}, thanks for hiring with BG LUX. ${d.refundAmount ? `We've refunded <b style="color:${C.text}">${money(d.refundAmount, currency)}</b> of your ${money(d.amount, currency)} security deposit.` : `Your ${money(d.amount, currency)} security deposit has been retained.`}${d.refundAmount && d.method === 'card' ? ' Card refunds usually take 5 to 10 working days to appear.' : ''}`,
      rows: d.deduction ? [['Deposit', money(d.amount, currency)], ['Deducted', money(d.deduction, currency)], ['Refunded', money(d.refundAmount, currency), true]] : [],
      body: d.deduction ? `<p style="margin:0"><b style="color:${C.text}">Reason for deduction:</b> ${esc(d.reason)}</p>` : '',
      contact
    });
    return { subject: `Security deposit ${d.deduction ? 'update' : 'refunded'}: ${b.ref}`, html, text };
  },

  balancePaid(b, amount, { currency, contact }) {
    const { html, text } = layout({
      heading: 'Payment received',
      intro: `Hi ${first(b.name)}, we've received your balance payment of <b style="color:${C.text}">${money(amount, currency)}</b> for your ${esc(b.carName)} hire (${esc(b.ref)}). Your hire is now paid in full.`,
      contact
    });
    return { subject: `Payment received: ${b.ref}`, html, text };
  }
};
