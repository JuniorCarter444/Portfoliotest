# Making the BG LUX site live: step by step

Allow 2 to 3 hours, plus 1 to 3 days for Stripe to verify the business. Do the steps in order.

**You'll need:** the GitHub login, access to wherever `bgluxurycars.com` is registered (GoDaddy, 123-reg, Wix, Squarespace...), the business email account, business bank details, and photo ID for the Stripe owner.

**Running cost:** about $7/month for Render hosting with storage, plus Stripe fees per payment (roughly 1.5% + 20p on UK cards).

---

## Step 1. Finish the content (30 min)

Send these to your developer (or Claude) to update:

- [ ] Prices for the price-on-request cars (Ghost, GLB, C 200, A6, A 180), or confirm they stay "price on request".
- [ ] Confirm the grey SUV is a Mercedes GLB.
- [ ] The original car photos (higher quality than the ones cropped from the old site).
- [ ] Any wording fixes to the rental terms ("recieved", "applaudable").
- [ ] A **privacy notice** (see Step 8).

Contact details (phone, WhatsApp, email, Instagram) don't need code changes. You enter them in Step 5.

## Step 2. Set up Stripe (30 min, then 1 to 3 days for approval)

1. Go to **stripe.com**, click **Start now**, and create an account with the business email.
2. Click **Activate payments** and fill in the business details, owner details and UK bank account for payouts. Stripe may ask for ID.
3. Under **Settings → Branding**, add the BG LUX logo and colours so the payment page matches the site.
4. Under **Settings → Public details**, set the statement descriptor to something customers will recognise, e.g. `BG LUX CARS`.
5. Make sure **Test mode** is switched **on** (toggle at the top). Go to **Developers → API keys** and copy the **Secret key** (starts `sk_test_`). Keep it somewhere safe.

You'll create the webhook in Step 6, once the site has an address.

## Step 3. Set up email sending (15 min)

The site sends confirmations from your business email. Pick the option that matches yours:

**Google Workspace / Gmail**
1. Turn on 2-Step Verification for the account (myaccount.google.com → Security).
2. Create an **App password** (myaccount.google.com → Security → App passwords). Copy the 16-character password.
3. Your settings: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER=` your full email address, `SMTP_PASS=` the app password.

**Microsoft 365 / Outlook**
1. In the Microsoft 365 admin centre, open the mailbox → **Mail → Manage email apps** → tick **Authenticated SMTP**.
2. Your settings: `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER=` the email address, `SMTP_PASS=` its password.

**No business email yet?** Sign up for **Resend** (resend.com), add and verify `bgluxurycars.com`, create an API key. Settings: `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=resend`, `SMTP_PASS=` the API key.

Also decide:
- `MAIL_FROM`: the sender customers see, e.g. `BG LUX <bookings@bgluxurycars.com>`. It must be an address your provider lets you send from.
- `BUSINESS_EMAIL`: where *you* get booking, document and deposit alerts.

## Step 4. Get the code onto the main branch (5 min)

The new site is on the branch `claude/fervent-lovelace-cklle4`. Either:
- open a pull request on GitHub from that branch into `main` and merge it, **or**
- just pick that branch in Step 5.

## Step 5. Create the site on Render (20 min)

1. Go to **render.com** and sign up with **GitHub**. Allow it access to the `Portfoliotest` repository.
2. Click **New → Blueprint**, choose `JuniorCarter444/Portfoliotest` and the branch from Step 4.
3. Render reads the settings file and shows a web service called **bg-lux** (Starter plan, Frankfurt, 1 GB disk). It then asks you to fill in these values:

| Setting | What to enter |
| --- | --- |
| `SITE_URL` | `https://bgluxurycars.com` (no slash at the end) |
| `ADMIN_PASSWORD` | A long password only staff know, e.g. from a password manager |
| `STRIPE_SECRET_KEY` | The `sk_test_...` key from Step 2 |
| `STRIPE_WEBHOOK_SECRET` | Leave blank for now (Step 6) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | From Step 3 |
| `MAIL_FROM`, `BUSINESS_EMAIL` | From Step 3 |
| `CONTACT_PHONE` | e.g. `+44 7700 900000` |
| `CONTACT_WHATSAPP` | Same number, digits only with country code, e.g. `447700900000` |
| `CONTACT_EMAIL` | The public enquiries email |
| `CONTACT_INSTAGRAM` | e.g. `https://instagram.com/bgluxurycars` |

4. Click **Apply** and add a payment card for the Starter plan. The first deploy takes 3 to 5 minutes.
5. When it says **Live**, open the `https://bg-lux.onrender.com` link at the top. The site should load with your phone number in the header.

## Step 6. Connect Stripe to the site (5 min)

1. In Stripe (still **Test mode**), go to **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://bg-lux.onrender.com/api/stripe/webhook` (switch to `https://bgluxurycars.com/...` after Step 7).
3. Select the event **`checkout.session.completed`** and click **Add endpoint**.
4. Click **Reveal** under *Signing secret* and copy it (starts `whsec_`).
5. In Render, open **bg-lux → Environment**, set `STRIPE_WEBHOOK_SECRET` to it and **Save**. Render redeploys automatically.

## Step 7. Point bgluxurycars.com at the new site (15 min, then up to 24h)

> This takes the old site offline and puts the new one up, so do it once Step 9's test passes on the `onrender.com` address.

1. In Render: **bg-lux → Settings → Custom Domains → Add**. Add `bgluxurycars.com`, then `www.bgluxurycars.com`.
2. Render shows the DNS records to create (an **A** record for `bgluxurycars.com` and a **CNAME** for `www`).
3. Log in where the domain is registered → **DNS settings**. Remove the old A/CNAME records for `@` and `www`, and add the ones Render shows. **Don't touch MX records**: they're your email.
4. Back in Render, click **Verify**. HTTPS is set up automatically once DNS updates (minutes to a few hours).
5. Update the Stripe webhook URL (Step 6) to `https://bgluxurycars.com/api/stripe/webhook`.

If the domain is managed by Wix or Squarespace, the DNS settings are in that site's **Domains** page. You may need to cancel the old website plan afterwards, but keep the domain.

## Step 8. Privacy and data protection (UK GDPR)

You'll collect driving licences, NI numbers and bank statements, so before taking real bookings:
- [ ] Add a privacy notice page: what you collect, why, how long you keep it, who sees it, and how customers can ask for their data to be deleted.
- [ ] Register with the ICO (ico.org.uk/fee) if you haven't. Most small businesses pay the lowest tier (around £50 a year).
- [ ] Decide how long you keep documents (e.g. 3 months after the deposit is refunded), then use **Delete documents** in the admin page.
- [ ] Only share the admin password with people who need it.

## Step 9. Test everything in test mode (30 min)

Do a full booking yourself on the live address. Use a real email address you can check.

1. **Book**: pick a car and dates, answer the questions, accept the terms, sign, and pay with the Stripe test card **4242 4242 4242 4242** (any future expiry date, any CVC, any postcode).
2. **Check**: you land on "Thank you" and both the customer email and your `BUSINESS_EMAIL` alert arrive (check spam).
3. **Verify**: click **Upload documents** and upload photos or PDFs.
4. **Admin**: open `https://YOUR-SITE/admin`. Log in with any username and your `ADMIN_PASSWORD`. Check the booking shows **Paid** and you can open the documents.
5. **Deposit**: enter an amount and click **Request**. Open the deposit email, accept the terms, pay with the test card.
6. **Refund**: back in admin, refund with a small deduction and a reason. Check the customer email and that the refund shows in Stripe → **Payments**.
7. **Balance**: if you booked with 25%, click **Charge saved card** and check it appears in Stripe.

If any email doesn't arrive, check Render → **Logs** for the error.

## Step 10. Switch to real payments

Once Stripe has approved the account and Step 9 worked:
1. In Stripe, switch **Test mode off**.
2. **Developers → API keys**: copy the **live** secret key (`sk_live_...`).
3. **Developers → Webhooks**: add the endpoint again in live mode (same URL, same event) and copy its **new** signing secret.
4. In Render → **Environment**, replace `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` with the live values. Save.
5. Make one real booking on a cheap car, check it all works, then refund it in Stripe.

**You're live.** 🎉

---

## Day-to-day

- **New booking**: you get an email. The customer is automatically asked to upload documents.
- **Documents in**: you get an email. Check them in admin, call the customer if it says *Call required*, then **Request** the deposit.
- **Before collection**: check the deposit shows **Paid** and the balance is cleared (**Charge saved card**, or take it in person).
- **3 weeks after return**: **Refund** the deposit in admin, entering any deductions with a reason.
- **Backups**: Render → bg-lux → **Disks** → take a snapshot now and then (Render also keeps daily snapshots).

## If something goes wrong

| Problem | Fix |
| --- | --- |
| Site says "Admin is disabled" | `ADMIN_PASSWORD` isn't set in Render → Environment |
| Payments work but bookings stay "Awaiting payment" | The webhook URL or `STRIPE_WEBHOOK_SECRET` is wrong (Step 6). Stripe → Webhooks shows failed attempts |
| Emails don't arrive | Check Render → Logs. Usually a wrong app password, or `MAIL_FROM` isn't an address your provider allows |
| Links in emails go to the wrong address | Set `SITE_URL` to your real web address |
| "Card declined" when charging the balance | The customer's bank wants them to approve it. Take it in person or send them a payment link from Stripe |
