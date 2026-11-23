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
- In a studio with several branches, see which branch each class is at

### Admin panel

- **Today:** the day's classes with attendee lists; browse other days, add people to a session, remove make-up guests
- **Customers:** list, detail, create (with a one-time temporary password), freeze, mark as left, reset password
- **Groups:** weekly schedules, capacity, scheduled changes and moving customers between groups, with a warning when capacity drops below the member count
- **Memberships and payments:** time-based membership periods, offline payment records, free months, freeze extensions and an overview of due, paid and overdue payments
- **Make-up credits:** grant credits with an expiry and a note; cancel a whole session and give everyone a credit automatically
- **Settings:** booking rules (cancellation deadline, credit validity, make-up cutoff, early make-up, undo) and the studio's contact details
- **Branches:** a studio can have several branches with their own address and map link; every group belongs to one branch. The admin adds, edits and closes branches, filters Today by branch, and decides whether members may book make-ups at other branches. A single-branch studio sees no branch controls at all

### Two membership models

Each studio picks one model when it is set up (`create-admin --model grup|paket`); the admin cannot switch it later, because the two models count attendance differently.

- **Group + make-up** (`grup`, default): time-based membership periods. A cancelled class earns a make-up credit.
- **Session packages** (`paket`): the admin keeps a package catalog (name, number of sessions, price, validity in days) and sells packages to members. There are no make-up credits. A finished class counts against the member's package unless the member cancelled in time or the studio cancelled the class; a no-show counts too. A member may cancel until the class starts; a cancel after the deadline is a *late cancel*, and a setting decides whether it still uses a session. Usage is calculated, never stored: sessions fill the oldest open package first, sessions with no package wait for the next package, and sessions left unused after a package's last day are lost. The admin can mark no-shows on a started class ("Gelmedi"); this is a record only and does not change the count.

### Public page

- Studio landing page at `/`; the app itself lives under `/giris`
- Sections: hero, why us, courses, a "which class suits you?" quiz, a featured programme, branches (tabs with address, map link and weekly schedule), instructor with count-up stats, how it works, FAQ, footer and a floating WhatsApp button
- Each studio fills only the sections it has content for; a section without content is left out of both the page and the menu
- The page's built-in texts follow the studio's membership model: no make-up promises on a session-package studio (and none when the model cannot be loaded). Texts the studio writes in `site.json` are shown as written, so they must match its own rules
- Quiz answers stay in the browser and are never sent anywhere
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
- **A session's branch comes from its group:** Sessions do not store a branch; they read it from their group, and a member's branch is the branch of their group on that date. Moving a group to another branch therefore also shows its past sessions there, an accepted trade-off while there are no reports. A composite foreign key keeps a group from pointing to another studio's branch. With the same-branch make-up rule on, the server refuses a make-up at another branch even if the request is sent by hand.

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
npm run create-admin -- <slug> "Full Name" "0532 123 45 67" ["Studio Name"] [--model paket]
```

`--model paket` opens a new studio with session packages; without it the studio uses groups and make-up credits. The option is ignored for an existing studio.

The slug is the studio's address: lowercase letters, digits and hyphens, 3–63 characters, not starting or ending with a hyphen. A few names (`www`, `api`, `admin`, `app`, `mail`, `static`, `assets`) are reserved. The database enforces the same rules.

The demo login accounts (one customer, one admin) are listed in `DEV_ACCOUNTS` at the top of `server/src/scripts/seedDev.js`. They exist only on a development machine. Because their passwords are public, the seed scripts need an explicit `ALLOW_DEMO_SEED=1` on every run and refuse to run in production or on a database that already has data.

`server/.env` must set `NODE_ENV=development` (or `production`); the server does not start without it.

## Tests

```bash
cd server
npm test
```

Tests run against a separate `studio_booking_test` database that is created automatically. As a safety check, the test setup refuses any database whose name does not end in `_test`. About 330 tests cover authentication, booking and make-up rules, session packages, concurrency, the admin endpoints, branches, phone number normalization and isolation between studios. HTTP tests talk to real studio subdomains (`test-1.localhost`).

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

A studio's own content (logo, instructor, address, photos) is kept outside the repository; its colours are set in the admin panel (see below). `BRAND_DIR` points to a folder with one subfolder per studio, named after its slug:

```
BRAND_DIR/
  demo/
    site.json    texts for the public page (format: server/site.example.json)
    logo.png     photos and other public files
```

`/brand/...` is served from the folder of the studio the request came to, so one studio can never load another's files. Every file in a studio's folder is public.

`site.json` fields (all optional except `privacyNotice` in production; `server/site.example.json` shows every one):

| Field | Used for |
|---|---|
| `hero.eyebrow`, `tagline`, `subline` | Handwritten line, heading and text at the top |
| `reasons` | Up to four "why us" cards; generic cards are shown when missing |
| `courses` | Up to six course cards; `highlight` makes one dark, `link` points to a section on the page (e.g. `test`) |
| `quiz` | Questions whose options lead either to a later question (`next`) or to a result (`result`); options that would loop or point nowhere are dropped |
| `spotlight` | Featured programme with tabs (`label`, `meta`, `title`, `items`) |
| `instructor`, `stats` | Instructor section and up to three stats (short values such as `8` or `500+`) |
| `branchDetails` | Badge, description and weekly schedule per branch, matched by the branch name in the admin panel |
| `phone`, `workingHours`, `groupSize`, `equipment`, `address`, `mapsUrl`, `instagramUrl`, `photos` | Contact details, FAQ answers and photos; branch addresses entered in the admin panel take the place of `address` |
| `privacyNotice` | The studio's KVKK privacy notice page |

Invalid values are dropped field by field, so a typo hides one card instead of breaking the page; a file that is not valid JSON is logged and the page falls back to its defaults.

**Colours.** Settings › Appearance takes two colours, a brand colour and an accent colour. The server derives every other shade from them (darker bands, light surfaces, text colours, hover states; `server/src/theme/palette.js`) and serves the result as `/brand/theme.css`. Text colours on brand-coloured surfaces are picked automatically for readability. The panel warns, but still saves, when button text cannot reach WCAG AA contrast (4.5:1), when the brand colour is hard to read as link text and focus outline on light surfaces, or when the accent colour is too pale (accent text then uses a darker shade). No colours means the default palette. A `theme.css` file in the brand folder is no longer read.

### UI conventions

- **Role-based CSS variables.** Colours are named by what they do, not by how they look: `--brand`, `--brand-strong`, `--brand-soft`, `--accent`, `--surface`, `--surface-raised`, `--surface-sunken`, `--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--warning`, `--danger`, plus text colours for filled backgrounds (`--on-brand`, `--on-danger`) (`client/src/index.css`). Components use only these names, so a studio's theme changes every screen at once. Body text pairs are checked for WCAG AA contrast (4.5:1); `--ink-faint` is kept for secondary, non-essential text.
- **Default palette.** Cream surfaces with olive green and a muted gold accent; DM Sans for interface text and Cormorant Garamond for headings and large numbers (served from npm via `@fontsource`, no third-party font requests). Numbers use lining figures so times and counts line up.
- **Theme override.** The generated `/brand/theme.css` sets the same variables under `html:root`; it needs no knowledge of the components. It is sent with `Cache-Control: no-cache` and an ETag, so a saved colour shows on the next page load.
- **Layout.** The member app is a single phone-width column. The admin panel shows a dark sidebar from 900px wide and a bottom tab bar below that; the customer list becomes a table on wide screens and cards on phones.
- **Feedback.** Success messages appear in one shared toast (`useToast` + `<Toast>`, shown once per app and passed to pages as `showToast(tone, text)`); form errors stay next to the field or inside the open sheet. Confirmations and forms open in a `<Sheet>` (a bottom sheet on phones, a centred dialog on wider screens). Actions that cannot be undone, such as a late cancel that uses up a session, use the red `danger` button.

## Not in the first version

Online payments (payments are collected in person and only recorded in the system), WhatsApp/SMS reminders, waiting list, self sign-up, instructor role, reporting, native mobile app. Several studios already run on one installation, each on its own subdomain; there is no screen yet for opening a studio or changing its address (studios are created with `create-admin`).

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

- [x] Multi-studio foundation: each studio on its own subdomain, separate accounts per studio, data isolation proven by tests
- [x] Branches: a studio can have several locations; groups belong to a branch
- [x] Session packages (e.g. 8 or 12 sessions) as a second membership model, chosen per studio at setup
- [x] New look for the customer and admin panels and the public page
- [ ] Appearance settings: brand and accent colours (other shades derived automatically) — colours done; prices on the public page next (logo upload later)
- [ ] Instructor role and panel
- [ ] Deployment and production setup (data stays in Turkey)
- [ ] Pilot with a real studio

## License

Not decided yet.
