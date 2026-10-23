# BG LUX Luxury Cars: refreshed website

A refreshed, modernised site for BG LUX Luxury Cars London, with online booking, payments, driver verification, security deposits and confirmation emails.

![Homepage](screenshot.png)

## What it does

**For customers**

- Browse the fleet (real BG LUX cars and prices, 3-day and weekly rates, price-on-request cars go to the enquiry form).
- **Book online**: choose a car, dates and delivery/collection (£40 each way), answer the 7 driver questions, read the full rental terms, tick to accept and type their name to sign, then pay a 25% reservation payment or the full amount through Stripe.
- **Verify**: upload licence (front and back), NI number, PDF bank statement, utility bill and a second proof of address using a secure link. Customers who booked by phone or WhatsApp can use `/verify.html` directly.
- **Security deposit**: once you set the amount, they get an email linking to a page that shows the terms again. They must tick to accept and sign before paying.
- Emails at every step (booking confirmed, documents received, deposit request, deposit received, deposit refunded, balance paid, enquiry received).

**For you (the admin page at `/admin`)**

- See every booking, verification and enquiry.
- Review driver answers (anything needing a call is flagged in red) and open the uploaded documents.
- See the terms acceptance record: the exact terms version, typed signature, date and time, and IP address.
- Request the security deposit (£1,000 to £10,000, your choice per customer), or mark it paid if they paid by bank transfer, card terminal or cash.
- Refund the deposit after the 3-week window, in full or minus deductions with a reason (the customer is emailed the breakdown).
- Charge any remaining hire balance to the card saved at checkout.
- Delete a customer's documents when you no longer need them.

## Run it locally

```bash
cd bg-luxury
npm install
cp .env.example .env    # then set at least ADMIN_PASSWORD
npm start               # http://localhost:3000, admin at http://localhost:3000/admin
```

With nothing else configured it runs in **demo mode**: payments are simulated and emails are saved to `data/outbox.json` instead of being sent, so you can click through the whole journey safely.

## Put a demo online (Render)

The repository includes a `render.yaml` at its root, so Render can set everything up for you:

1. Sign in at [render.com](https://render.com) with GitHub.
2. Click **New → Blueprint**, choose this repository and the branch with the site on it.
3. When asked, enter an `ADMIN_PASSWORD`. Leave the Stripe and SMTP fields empty for demo mode.
4. Click **Apply**. After a few minutes you get a link like `https://bg-lux.onrender.com` (admin at `/admin`).

The free plan sleeps when unused (the first visit can take about 30 seconds) and wipes saved bookings and uploads when it restarts. That's fine for a demo. For the live site, use a paid plan with a persistent disk (see Storage below).

## Going live: checklist

1. **Contact details**: set `CONTACT_PHONE`, `CONTACT_WHATSAPP`, `CONTACT_EMAIL` and `CONTACT_INSTAGRAM` in `.env`.
2. **Stripe** (payments and deposits):
   - Put your secret key in `STRIPE_SECRET_KEY` (test key `sk_test_...` first; test card `4242 4242 4242 4242`).
   - In the Stripe Dashboard, add a webhook to `https://YOUR-SITE/api/stripe/webhook` for the `checkout.session.completed` event and put its signing secret in `STRIPE_WEBHOOK_SECRET`. This is what confirms bookings and deposits.
3. **Email**: fill in the `SMTP_*` settings from your email provider and set `MAIL_FROM` and `BUSINESS_EMAIL`. Any provider with SMTP works (Google Workspace, Microsoft 365, Zoho, SendGrid, Resend).
4. **Admin**: set a long, unique `ADMIN_PASSWORD`.
5. **Hosting**: this is a Node.js (18+) app, so it needs a host that runs a server (Render, Railway, Fly.io or a VPS), with HTTPS. It won't work on GitHub Pages. Set `SITE_URL` to your web address and `TRUST_PROXY=1` if the host puts a proxy in front.
6. **Storage**: bookings and documents are saved in the `data/` folder. Use a host with a **persistent disk** (many wipe local files on each deploy), and back it up. For a bigger operation, move to a database and private cloud storage (e.g. S3), which `data/store.js` and the upload code are set up to swap out.

## How deposits work, and why

Your terms say the deposit is refunded **3 weeks after return**. A card "hold" (pre-authorisation) normally expires after about 7 days, so the site **charges** the deposit and you **refund** it from the admin page. Two things to know:

- Stripe keeps its processing fee when you refund (roughly 1.5% + 20p on UK cards, so about £37 on a £2,500 deposit). Customers can also pay by bank transfer instead; use "Mark paid" in the admin page, and refund them yourself.
- Card refunds take 5 to 10 working days to show on the customer's statement.

## Data protection (UK GDPR)

You'll be storing ID documents, NI numbers and bank statements, which are sensitive. Before going live:

- Add a **privacy notice** to the site saying what you collect, why, how long you keep it and who sees it.
- Decide a **retention period** (for example, delete documents 3 months after the deposit is refunded) and use "Delete documents" in the admin page.
- Keep `ADMIN_PASSWORD` private, use HTTPS, and limit who has server access.
- You'll likely need to register with the ICO as a data controller if you haven't already.

## Editing content

| What | Where |
| --- | --- |
| Cars, prices, packages, photos | `data/fleet.js` (photos in `public/images/`) |
| Rental terms | `data/terms.js`. Change `VERSION` whenever you edit the wording, so acceptances show which version was agreed to |
| Driver questions and required documents | `data/verification.js` |
| Delivery/collection fees | `HANDOVER` in `public/pricing.js` |
| Email wording | `lib/emails.js` |
| Colours and fonts | Variables at the top of `public/styles.css` |

The car photos were cropped from screenshots of the old site, so they're low resolution. Replace them with the original photos (same file names) for the best result.
