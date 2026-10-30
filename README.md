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
npm run seed:dev        # demo studio, groups, members and sessions
npm run seed:payments   # optional: demo memberships and payments
npm run dev             # http://localhost:3000

# 4. Client (in a second terminal)
cd client
npm install
npm run dev             # http://localhost:5173
```

The demo login accounts (one customer, one admin) are listed in `DEV_ACCOUNTS` at the top of `server/src/scripts/seedDev.js`. They exist only on a development machine; the seed script refuses to run in production or on a database that already has data.

## Tests

```bash
cd server
npm test
```

Tests run against a separate `studio_booking_test` database that is created automatically. As a safety check, the test setup refuses any database whose name does not end in `_test`. About 130 tests cover authentication, booking and make-up rules, concurrency, the admin endpoints and phone number normalization.

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

A studio's own content (logo, instructor, address, photos) is kept outside the repository in a folder set by `BRAND_DIR` and served under `/brand`. The public page reads `BRAND_DIR/site.json`; see `server/site.example.json` for the format. Missing fields show placeholders.

## Not in the first version

Online payments (payments are collected in person and only recorded in the system), class packs (memberships are time-based only), WhatsApp/SMS reminders, waiting list, self sign-up, instructor role, reporting, multi-studio screens, native mobile app. The data model leaves room for multiple studios later.

## Roadmap

- [x] Requirements and business rules
- [x] Technology selection and development environment
- [x] Database design and migrations
- [x] Backend API, authentication and authorization
- [x] Booking and make-up logic with concurrency tests
- [x] Customer interface
- [x] Admin panel: customers, groups, sessions, settings, memberships and payments
- [x] Public landing page
- [ ] Security review (rate limiting, input validation pass)
- [ ] Deployment and production setup
- [ ] Pilot with a real studio

## License

Not decided yet.
