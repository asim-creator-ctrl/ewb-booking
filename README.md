# EDITORWALABHAIYA — Booking system

Next.js 16 · Supabase (Postgres + Auth) · Razorpay (Phase 4) · Vercel

## Phase 1 — done
- Full database schema (all tables for every phase), with the double-booking guard enforced by Postgres
- Seeded placeholder config: 2 shoot types × 3 durations, location options, 6 Kolkata areas, included / not-included lists, extra-charge types, working hours, reminder rules, draft policies
- Pricing engine (`lib/pricing.ts`), one function shared by browser and server, 10 tests
- Admin login (email link, allow-listed accounts only)
- Admin screens: Shoots & pricing, Locations & areas, Included & extras, Working hours, Policies (versioned), Settings, Overview with live price preview
- Live public endpoints: `GET /api/public/config`, `POST /api/quote` (never cached)

## Phase 2 — done
- Availability engine (`lib/availability.ts`): timezone-correct conversion between wall-clock time and UTC using `Intl.DateTimeFormat` (not the fragile locale-string trick — works the same regardless of which timezone the server itself runs in), plus the slot-finding logic itself. 23 tests, including a live run against a real Postgres database that confirms the engine agrees exactly with the database's own double-booking constraint.
- Live public endpoints: `GET /api/availability?date=&durationMinutes=` (one day's open slots), `GET /api/availability/days?from=&to=&durationMinutes=` (a date range's slot counts, for a calendar or date-strip)
- Admin **Calendar**: a month view (working/closed days, free-slot counts, dots for blocks and bookings) and a day view (working hours for that weekday, existing blocks with delete, a form to block specific times or the whole day, and a live "free slots" preview using the exact same engine the booking page will use)
- `scripts/smoke-availability.ts` — an optional dev-only script that runs the engine against a real local Postgres database to sanity-check it end to end. Needs `pg` and `tsx` (already in devDependencies) and a local Postgres server; not needed for normal use or deployment.

## Phase 3 — done
- The real customer booking page at **`/book`**, linked from the homepage's "Check availability" button. Six steps — Shoot, Duration, Date & Time, Location, Details, Review — all driven by live data: your real prices via `calculatePrice`, real open slots via the Phase 2 availability API, real locations and areas.
- **Payment isn't live yet (that's Phase 4), so "Review" ends in a WhatsApp handoff instead of a dead end**: the button sends you a pre-filled WhatsApp message with everything — shoot, date, time, location, full price breakdown, customer name and Instagram — so a customer can complete the whole flow today and you get a ready-to-answer message instead of a vague DM. Nothing is written to the database at this step; that starts in Phase 4 once payment exists to pair it with.
- A zone needing a custom quote (like "Outside Kolkata") shows its own WhatsApp button instead of a price, and blocks the online-booking button.
- `lib/whatsapp.ts` — builds that message and the `wa.me` link, 4 tests.
- 37 tests passing across pricing, availability and WhatsApp; full production build clean.

## Phase 4 — done
- **Real payment**: the Review step now reserves the slot and opens Razorpay Checkout for the advance, instead of only offering WhatsApp. If Razorpay's keys aren't set yet, the page automatically falls back to the Phase 3 WhatsApp button — nothing breaks either way, and switching over later needs no code change, just adding the keys.
- `lib/bookings.ts` — `createBookingHold` re-validates the price and re-confirms the exact slot is still free (against live blocks/bookings) immediately before reserving it, then opens the Razorpay order. `confirmBookingByOrderId` is the shared confirm step called by both the browser (right after checkout) and the webhook, written to be safely idempotent — calling it twice for the same payment is a no-op, not a double-confirm.
- **Verified against a real Postgres database**, including the two race conditions that matter most with real money on the line: a late payment for a hold that expired but nobody else took → correctly reclaimed, with a real booking reference assigned. A late payment for a hold that expired *and was taken by someone else* → correctly rejected by the database's own exclusion constraint and routed to `payment_conflict` for a manual refund, never silently overwriting the other person's booking.
- `lib/razorpay-verify.ts` — the HMAC signature checks for both a completed Checkout payment and an incoming webhook delivery, kept in their own pure/testable file (no network calls, no secrets baked in) so the actual cryptographic logic has direct test coverage. 7 tests, including tamper detection.
- `POST /api/bookings/hold` — reserves the slot, creates the Razorpay order.
- `POST /api/payments/verify` — the browser calls this right after Checkout; verifies the signature, then confirms.
- `POST /api/webhooks/razorpay` — Razorpay's own server-to-server notification; the durable path if the browser closes before verify runs. Deduplicated, so a redelivered webhook is a safe no-op.
- Expired holds are swept (marked `expired`, freeing the slot) on every visit to the availability API and the admin calendar, so a stale hold never phantom-blocks a slot from other customers or from you.
- 44 tests passing; full production build clean.

## Phase 5 — done
- **Instant alert to you** the moment a booking is confirmed — Telegram (if configured) and a backup email, with the customer's name, shoot, date, price and contact details.
- **Confirmation email to the customer** with a calendar invite (`.ics` file) attached, so it drops straight into their phone's calendar.
- **Automated reminders** — 7 days before, 24 hours before, 2 hours before the shoot, and a balance-due reminder afterward — configurable from the `reminder_rules` table (times and wording can change without touching code). Each is scheduled the moment a booking is confirmed and sent later by a small endpoint.
- Email is sent through your own Gmail with an App Password — works with no domain of your own; swapping in a proper sender (Resend or similar) later is a one-file change (`lib/email.ts`), nothing else.
- **Vercel's free tier only runs its own cron once a day** — too coarse for a "2 hours before" reminder — so reminders are sent by `GET /api/cron/notifications`, a secret-protected endpoint any free external scheduler can call every 10–15 minutes (setup below). A daily Vercel cron hits the same endpoint as a fallback safety net either way.
- 5 new tests for the calendar-invite builder (date formatting, text escaping, structure); 49 tests passing total; full production build clean.

## Phase 6 — done
- **Admin → Bookings**: every booking, filterable (Upcoming / Today / Pending balance / All), each linking to a full detail page.
- **Booking detail page**: customer contact, full price breakdown, payment history, and every action from here on:
  - **Add an extra charge or a discount** (studio rental, travel, props — whatever comes up after booking) — updates the balance owed immediately, computed fresh from the booking's items and payments every time rather than stored as a number that could drift.
  - **Send a balance payment link** — a real Razorpay Payment Link for whatever's currently owed, with a ready WhatsApp message and share button. Paid automatically via webhook, or you can **mark it paid manually** for cash/UPI collected in person.
  - **Mark the shoot completed**, **cancel** (with an optional automatic refund of the advance via Razorpay), and **reschedule** (checked against your blocks and every other booking — the same database guarantee from Phase 2 still applies).
  - **Admin notes** — private, never shown to the customer.
- **Overview dashboard** now shows real numbers: today's shoots, upcoming confirmed bookings, bookings with a pending balance, this month's revenue, and total outstanding balance — each linking straight to the filtered list.
- One more Razorpay webhook event to add: open your existing webhook (Settings → Webhooks → the one you made in Phase 4) and add **`payment_link.paid`** alongside the two you already have — this is what lets a balance payment link confirm itself automatically.
- Full production build clean; all 49 tests still passing (this phase's logic — balance calculation, reschedule conflict handling, cancellation — was verified directly against a real Postgres database rather than adding more unit tests, since it's mostly database queries rather than pure functions).

## Phase 7 — done
- **Homepage now has a full pricing table** (every shoot type, every duration, every price — live from your admin config) and an **FAQ section** answering the questions people actually DM about (price, availability, duration, outdoor/indoor, advance %, how to book) — the whole point being fewer repetitive DMs, per the original brief.
- **Policy pages are live and linked** — `/legal/cancellation`, `/legal/terms`, `/legal/refund`, `/legal/privacy`, `/legal/rescheduling` — linked from the homepage footer and, importantly, from the booking Review step's "I accept the cancellation policy and terms" line, which previously mentioned them without a way to actually read them. These pages are also what Razorpay's own review checks for.
- Full production build clean, all 49 tests passing.

## Launch checklist
Everything code-related is done. What's left is entirely in your hands:
- [ ] **Razorpay account review** approved (you're waiting on this already)
- [ ] **A custom domain**, if you want one instead of `ewb-booking.vercel.app` — connect it in Vercel, then update `NEXT_PUBLIC_SITE_URL` in Vercel and the Site URL / Redirect URLs in Supabase to match
- [ ] **Real photos** — replace the `[Your best portrait — full bleed]` placeholder on the homepage with 5–8 of your actual portraits
- [ ] **Read through your 5 policies** one more time (`/legal/cancellation` etc. once live) — these are the actual terms a paying customer agrees to
- [ ] **One real test booking** through the full flow, start to finish, once Razorpay is approved
- [ ] Turn `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` on if you decide you want instant Telegram alerts after all (skipped in Phase 5 setup, easy to add anytime)

## Setup (one time, ~15 minutes)

### 1. Supabase
1. Create a new project at supabase.com (region: Mumbai).
2. **SQL Editor → New query**: paste `supabase/migrations/0001_schema.sql`, run. Then paste `supabase/migrations/0002_phase4.sql`, run. Then paste `supabase/seed.sql`, run.
3. **Authentication → Users → Add user**: your email, "Auto confirm" on.
4. SQL Editor, make that account the admin:
   ```sql
   insert into admins (user_id, email)
   select id, email from auth.users where email = 'YOUR@EMAIL.COM';
   ```
5. **Authentication → URL Configuration**
   - Site URL: your live URL (e.g. `https://book.editorwalabhaiya.com`)
   - Redirect URLs: add `http://localhost:3000/auth/callback` and `https://YOUR-DOMAIN/auth/callback`

> **Already have this project running?** You only need to run the new file: SQL Editor → new query → paste `supabase/migrations/0002_phase4.sql` → Run. It's a small addition (one permission grant) safe to run on top of everything you already have — it doesn't touch your existing data.

### 2. GitHub → Vercel
1. Create a new GitHub repo (e.g. `ewb-booking`) and push this folder.
2. Vercel → Add New Project → import the repo.
3. Environment variables (from Supabase → Project Settings → API):
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (secret — server only) |
   | `NEXT_PUBLIC_SITE_URL` | your live URL, no trailing slash |
   | `RAZORPAY_KEY_ID` | from Razorpay (see below) — optional, payments fall back to WhatsApp without it |
   | `RAZORPAY_KEY_SECRET` | from Razorpay (see below) — optional, same fallback |
   | `RAZORPAY_WEBHOOK_SECRET` | from Razorpay (see below) — optional, same fallback |
   | `TELEGRAM_BOT_TOKEN` | from Telegram (see below) — optional |
   | `TELEGRAM_CHAT_ID` | from Telegram (see below) — optional |
   | `GMAIL_USER` | your Gmail address (see below) — optional |
   | `GMAIL_APP_PASSWORD` | Gmail App Password (see below) — optional |
   | `GMAIL_FROM_NAME` | e.g. `EDITORWALABHAIYA` — optional |
   | `CRON_SECRET` | any long random text you choose — optional, needed for reminders |
4. Deploy. Open `/admin`, enter your email, click the link.

### 3. Razorpay (Phase 4 — optional until you're ready)
Test mode keys work immediately with no KYC, so you can try the whole payment flow today; switch to live keys later with no code change, just updating these same env vars.

1. Sign up at razorpay.com (or log in if you started this earlier).
2. **Settings → API Keys → Generate Test Key** (or Live Key, once KYC is approved). Copy the Key ID and Key Secret into Vercel as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
3. **Settings → Webhooks → Add New Webhook**
   - URL: `https://YOUR-SITE/api/webhooks/razorpay`
   - Active events: check `payment.captured` and `payment.failed`
   - Save, then copy the webhook secret it shows you into Vercel as `RAZORPAY_WEBHOOK_SECRET`
4. Redeploy (Vercel → Deployments → ⋯ → Redeploy) so the new env vars take effect.
5. Test it: use Razorpay's [test card numbers](https://razorpay.com/docs/payments/payments/test-card-upi-details/) on `/book` to confirm a booking end to end without moving real money.

### 4. Notifications (Phase 5 — optional until you're ready)

**Telegram (instant alerts to you):**
1. In Telegram, message **@BotFather** → send `/newbot` → follow the prompts. Copy the token it gives you into Vercel as `TELEGRAM_BOT_TOKEN`.
2. Send your new bot any message (e.g. "hi").
3. In a browser, visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` (with your real token in place). Find `"chat":{"id": ...}` in the response — that number is `TELEGRAM_CHAT_ID`.

**Gmail (customer confirmations, reminders, and a backup admin alert):**
1. On the Google Account you want to send from: **Security → 2-Step Verification** (turn on if it isn't already).
2. **Security → App passwords** → create one for "Mail". Copy the 16-character password.
3. Add to Vercel: `GMAIL_USER` (the Gmail address), `GMAIL_APP_PASSWORD` (the 16-character password), `GMAIL_FROM_NAME` (e.g. `EDITORWALABHAIYA`).

**The reminder scheduler (free, no signup fee):**
1. Add a `CRON_SECRET` to Vercel — any long random text you make up yourself, e.g. `ewb-cron-8pQ2vTa9Kx`.
2. Go to **cron-job.org** (free) → sign up → **Create cronjob**:
   - URL: `https://ewb-booking.vercel.app/api/cron/notifications`
   - Schedule: every 15 minutes
   - Under **Advanced → Request headers**, add: `Authorization: Bearer <the exact CRON_SECRET you set>`
3. Save. That's it — this is what actually sends reminders on time; Vercel's own daily cron is just a backup.
4. Redeploy after adding the env vars so they take effect.

### Local
```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev                  # http://localhost:3000/admin
npm test                     # pricing tests
```

## How "no code changes" is guaranteed
- No prices, hours or rules exist in code. Everything is read from the database per request.
- `/api/public/config` and every admin page are dynamic (`ƒ` in the build output), never statically cached.
- Admin saves write straight to the database, so the next customer request sees them.

## Security model
- Customers never touch the database directly. Public routes use the service-role key on the server only, and validate everything.
- Admin screens use the admin's own session. Every action re-checks admin rights in code, and Row Level Security (`is_admin()`) enforces it again in Postgres.
- Every admin change is written to `audit_logs`.
- `bookings_no_overlap` (Postgres exclusion constraint) makes overlapping live bookings impossible, including buffer time, even under simultaneous checkouts.

## Next phases
None — all 7 phases from the original brief are built. See the Launch checklist above for what's left, and it's all outside the code.
