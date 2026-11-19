# Studio Booking

A mobile-first web application for small fitness and Pilates studios: fixed weekly groups, flexible make-up classes, and a simple admin panel for the studio owner.

> **Status:** In active development. The core booking flow, the admin panel and the public page work end to end and are covered by automated tests. Not deployed yet.

## The problem

Small neighborhood studios often manage group attendance through messaging apps and spreadsheets. Customers have to ask the owner which class still has room, and the owner has to track capacity, cancellations and make-up classes by hand, which is error-prone.

## The idea

- Every customer belongs to a **regular group** (for example Mon-Wed-Fri 09:00).
- If they cannot attend a class, they cancel it and get a **make-up credit**.
- They use the credit to book **any other class that still has a free spot**, without changing their regular group.
- The studio owner manages groups, customers, capacity and rules from one place.

## What works today

### Customer (mobile-first)

- Log in with phone number and password; set a new password on first login
- See the next two weeks of classes for their group
- "Can't come" to a class to earn a make-up credit, with an undo option
- Pick a make-up class from the sessions that still have a free spot
- See their membership end date and, if the studio allows it, their own payments

### Admin panel

- **Today:** the day's classes with attendee lists; browse other days, add people to a session, remove make-up guests
- **Customers:** list, detail, create (with a one-time temporary password), freeze, mark as left, reset password
- **Groups:** weekly schedules, capacity, scheduled changes and moving customers between groups, with a warning when capacity drops below the member count
- **Memberships and payments:** time-based membership periods, offline payment records, free months, freeze extensions and an overview of due, paid and overdue payments
- **Make-up credits:** grant credits with an expiry and a note; cancel a whole session and give everyone a credit automatically
- **Settings:** booking rules (cancellation deadline, credit validity, make-up cutoff, early make-up, undo) and the studio's contact details

### Public page

- Studio landing page at `/` with how it works, benefits and FAQ; the app itself lives under `/giris`
- The studio's own logo, photos and texts are kept outside the repository (see [Studio branding](#studio-branding))

## Key design decisions

- **Group vs. session:** A *group* is a weekly template; a *session* is that template on a specific date. Capacity, cancellations and make-ups always apply to a single session.
- **Occupancy is calculated, not stored:** `regular members (not frozen) - cancellations + make-up bookings` for that session, from a database view.
- **Concurrency-safe booking:** The session row is locked (`SELECT ... FOR UPDATE`) inside a transaction while a make-up is booked, so two people taking the last spot at the same moment can never overbook a class. Tests cover this case.
- **Configurable business rules:** Credit validity, cancellation deadline and similar rules are settings an admin can change, not constants in the code, so the product can adapt to different studios.
- **Soft delete:** Customers are never deleted; they are marked active, frozen or left, so history stays intact.
- **Admin-created accounts:** No public sign-up. The studio owner creates accounts, which fits a small studio and avoids unwanted registrations.
- **Sessions generated ahead of time:** Upcoming sessions are created from the group templates on startup and once a day.
- **Server-side sessions:** Login uses httpOnly cookies backed by a sessions table, so a member who leaves can be logged out instantly.
- **One studio per subdomain:** Several studios share one installation. Each studio has its own address (`ornek.example.com`), and the server picks the studio from the request's host. An unknown address never falls back to another studio; it gets a 404. The session cookie has no `Domain`, so it stays on its own studio's address.
- **Separate accounts per studio:** The same phone number can be a separate account, with its own password, in two studios. A studio resets only its own members' passwords. Data isolation between studios is proven by tests that try every endpoint with another studio's ids (`server/test/studioIsolation.test.js`).

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19 (Vite), CSS Modules | Clear separation from the backend, large ecosystem, PWA-friendly |
| Backend | Node.js + Express 5 (JavaScript) | Transparent, minimal framework; the API flow stays visible |
| Database | PostgreSQL 17, plain SQL (`pg`), numbered SQL migrations | Strong data integrity and transactions for booking logic |
| Authentication | Server-side sessions, httpOnly cookies, bcrypt password hashing | Sessions can be revoked instantly |
| Tests | Node's built-in test runner against a separate test database | No extra framework; real SQL is tested, not mocks |
| Local database | Docker Compose | One command to start PostgreSQL |

In production the backend will also serve the built React app, so the frontend and API share one origin (simpler cookies, no CORS setup). In development, Vite proxies `/api` and `/brand` to Express.

## Getting started

You need Node.js and Docker.

```bash
# 1. Environment files (then edit the passwords)
cp .env.example .env                 # used by Docker Compose
cp server/.env.example server/.env   # used by the Express server

# 2. Start PostgreSQL
docker compose up -d

# 3. Server: install, create tables, add demo data, run
cd server
npm install
npm run migrate
ALLOW_DEMO_SEED=1 npm run seed:dev        # demo studio (address "demo"), groups, members and sessions
ALLOW_DEMO_SEED=1 npm run seed:payments   # optional: demo memberships and payments
npm run dev             # API on 127.0.0.1:3000

# 4. Client (in a second terminal)
cd client
npm install
npm run dev             # open http://demo.localhost:5173
```

Each studio is opened at its own address: `<slug>.BASE_DOMAIN`. In development `server/.env` sets `BASE_DOMAIN=localhost`, so the demo studio is at `http://demo.localhost:5173` (browsers resolve `*.localhost` to your own machine). `http://localhost:5173` is the product's root address, not a studio. The server does not start without `BASE_DOMAIN`.

To add a studio, or an admin to an existing studio:

```bash
cd server
npm run create-admin -- <slug> "Full Name" "0532 123 45 67" ["Studio Name"]
```

The slug is the studio's address: lowercase letters, digits and hyphens, 3–63 characters, not starting or ending with a hyphen. A few names (`www`, `api`, `admin`, `app`, `mail`, `static`, `assets`) are reserved. The database enforces the same rules.

The demo login accounts (one customer, one admin) are listed in `DEV_ACCOUNTS` at the top of `server/src/scripts/seedDev.js`. They exist only on a development machine. Because their passwords are public, the seed scripts need an explicit `ALLOW_DEMO_SEED=1` on every run and refuse to run in production or on a database that already has data.

`server/.env` must set `NODE_ENV=development` (or `production`); the server does not start without it.

## Tests

```bash
cd server
npm test
```

Tests run against a separate `studio_booking_test` database that is created automatically. As a safety check, the test setup refuses any database whose name does not end in `_test`. About 210 tests cover authentication, booking and make-up rules, concurrency, the admin endpoints, phone number normalization and isolation between studios. HTTP tests talk to real studio subdomains (`test-1.localhost`).

## Production and security

The server checks its configuration on startup (`server/src/startupChecks.js`). With `NODE_ENV=production` it refuses to start, and says why, if any of these is missing:

- **Least-privilege database role.** The app must not connect as a superuser or as the role that owns the tables (an owner can drop them). Create a role that can only read and write with `server/db/roles/app-role.sql`, running it as the owner role; migrations run as the table owner (`DB_OWNER_USER`).
- **HTTPS proxy.** Run behind Caddy or Nginx, which handles HTTPS, and set `TRUST_PROXY` so rate limits see real client IPs. Values Express cannot use (`true`, `*`) are refused. The session cookie is `Secure` in production. The proxy must pass the original `Host` header (Caddy does by default; Nginx: `proxy_set_header Host $host;`): the studio is read from `Host`, never from `X-Forwarded-Host`, which a client could set.
- **Domain.** `BASE_DOMAIN` must be a bare domain such as `example.com` (no scheme, port or trailing dot) and cannot be `localhost` in production.
- **Not reachable directly.** The server listens on `127.0.0.1` by default (`HOST`), so only the local proxy can reach it. With the proxy on the same machine, leave `HOST` empty and use `TRUST_PROXY=loopback`. If a platform needs `HOST=0.0.0.0`, make sure the port is open only to the platform's proxy: with a hop count such as `TRUST_PROXY=1` and a public port, anyone could fake `X-Forwarded-For` and bypass the rate limits (the server warns about this combination).
- **Built client.** `CLIENT_DIR` points to `client/dist`; the site and the API share one origin.
- **Privacy notice (KVKK).** Each studio's `BRAND_DIR/<slug>/site.json` must contain `privacyNotice` (each studio is the data controller for its members). A draft template is in `server/site.example.json`; it is a starting point, not legal advice.

Also built in: per-IP rate limits on the API and on failed logins (`middleware/rateLimits.js`), on top of the per-phone login limit; security headers with a strict Content-Security-Policy (`helmet`); input size limits on login.

**Backups.** `server/scripts/backup.sh` writes an encrypted (`openssl`, AES-256) daily dump and deletes old ones; `server/scripts/restore.sh` restores a backup into a *new* database and never overwrites an existing one. Schedule the backup with cron, copy the files off the server, keep the passphrase somewhere else, and test a restore every month.

## Project structure

```
client/
  src/pages/      customer screens (login, my sessions, make-up picker)
  src/admin/      admin panel screens
  src/site/       public landing page
server/
  db/migrations/  numbered SQL migrations
  src/routes/     HTTP endpoints (auth, sessions, admin, studio)
  src/services/   business logic (booking, schedule, memberships…)
  src/scripts/    development seed scripts
  test/           integration tests
docker-compose.yml  local PostgreSQL
```

### Studio branding

A studio's own content (logo, colours, instructor, address, photos) is kept outside the repository. `BRAND_DIR` points to a folder with one subfolder per studio, named after its slug:

```
BRAND_DIR/
  demo/
    site.json    texts for the public page (format: server/site.example.json)
    theme.css    colour overrides
    logo.png     photos and other public files
```

`/brand/...` is served from the folder of the studio the request came to, so one studio can never load another's files. Every file in a studio's folder is public. Missing fields show placeholders.

## Not in the first version

Online payments (payments are collected in person and only recorded in the system), class packs (memberships are time-based only), WhatsApp/SMS reminders, waiting list, self sign-up, instructor role, reporting, native mobile app. Several studios already run on one installation, each on its own subdomain; there is no screen yet for opening a studio or changing its address (studios are created with `create-admin`).

## Roadmap

- [x] Requirements and business rules
- [x] Technology selection and development environment
- [x] Database design and migrations
- [x] Backend API, authentication and authorization
- [x] Booking and make-up logic with concurrency tests
- [x] Customer interface
- [x] Admin panel: customers, groups, sessions, settings, memberships and payments
- [x] Public landing page
- [x] Security review and first hardening pass (rate limits, security headers, least-privilege role, startup checks, backups)

Next: turning the app into a product several studios can use. Order and decisions: `docs/superpowers/specs/2026-11-18-roadmap-and-decisions.md`.

- [ ] Multi-studio foundation: each studio on its own subdomain, separate accounts per studio, data isolation proven by tests
- [ ] Branches: a studio can have several locations; groups belong to a branch
- [ ] Class packs (e.g. 8 or 12 sessions) as a second membership model, chosen per studio at setup
- [ ] New look for the customer and admin panels
- [ ] Appearance settings: brand and accent colours (other shades derived automatically) and logo
- [ ] Instructor role and panel
- [ ] Deployment and production setup (data stays in Turkey)
- [ ] Pilot with a real studio

## License

Not decided yet.
