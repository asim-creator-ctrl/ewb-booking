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
5. Email + Telegram notifications, reminders, calendar invites
6. Booking management: extra charges, balance links, reschedule / cancel / refund, dashboard numbers
7. Landing page, policy pages, launch
