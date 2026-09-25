# EDITORWALABHAIYA — Booking system

Next.js 16 · Supabase (Postgres + Auth) · Razorpay (Phase 4) · Vercel

## Phase 1 — done
- Full database schema (all tables for every phase), with the double-booking guard enforced by Postgres
- Seeded placeholder config: 2 shoot types × 3 durations, location options, 6 Kolkata areas, included / not-included lists, extra-charge types, working hours, reminder rules, draft policies
- Pricing engine (`lib/pricing.ts`), one function shared by browser and server, 10 tests
- Admin login (email link, allow-listed accounts only)
- Admin screens: Shoots & pricing, Locations & areas, Included & extras, Working hours, Policies (versioned), Settings, Overview with live price preview
- Live public endpoints: `GET /api/public/config`, `POST /api/quote` (never cached)

## Setup (one time, ~15 minutes)

### 1. Supabase
1. Create a new project at supabase.com (region: Mumbai).
2. **SQL Editor → New query**: paste `supabase/migrations/0001_schema.sql`, run. Then paste `supabase/seed.sql`, run.
3. **Authentication → Users → Add user**: your email, "Auto confirm" on.
4. SQL Editor, make that account the admin:
   ```sql
   insert into admins (user_id, email)
   select id, email from auth.users where email = 'YOUR@EMAIL.COM';
   ```
5. **Authentication → URL Configuration**
   - Site URL: your live URL (e.g. `https://book.editorwalabhaiya.com`)
   - Redirect URLs: add `http://localhost:3000/auth/callback` and `https://YOUR-DOMAIN/auth/callback`

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
4. Deploy. Open `/admin`, enter your email, click the link.

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
2. Availability engine + slot API + admin calendar with date/time blocking
3. Customer booking flow (7 steps, mobile-first, sticky price)
4. Slot holds + Razorpay + webhooks + confirmation
5. Email + Telegram notifications, reminders, calendar invites
6. Booking management: extra charges, balance links, reschedule / cancel / refund, dashboard numbers
7. Landing page, policy pages, launch
