# Studio Booking

A mobile-first web application for small fitness and Pilates studios: fixed weekly groups, flexible make-up classes, and a simple admin panel for the studio owner.

> **Status:** Planning complete, development starting. This README will grow as the project does.

## The problem

Small neighborhood studios often manage group attendance through messaging apps and spreadsheets. Customers have to ask the owner which class still has room, and the owner has to track capacity, cancellations and make-up classes by hand, which is error-prone.

## The idea

- Every customer belongs to a **regular group** (for example Mon-Wed-Fri 09:00).
- If they cannot attend a class, they cancel it and get a **make-up credit**.
- They use the credit to book **any other class that still has a free spot**, without changing their regular group.
- The studio owner manages groups, customers, capacity and rules from one place.

## Key design decisions

- **Group vs. session:** A *group* is a weekly template; a *session* is that template on a specific date. Capacity, cancellations and make-ups always apply to a single session.
- **Occupancy is calculated, not stored:** `regular members (not frozen) - cancellations + make-up bookings` for that session.
- **Configurable business rules:** Credit validity, cancellation deadline and similar rules are settings an admin can change, not constants in the code, so the product can adapt to different studios.
- **Soft delete:** Customers are never deleted; they are marked active, frozen or left, so history stays intact.
- **Admin-created accounts:** No public sign-up. The studio owner creates accounts, which fits a small studio and avoids unwanted registrations.
- **Concurrency-safe booking:** Two people booking the last spot at the same time must never overbook a class (to be handled at the database level).

## Planned scope (MVP)

| Area | Features |
|---|---|
| Public site | Single-page studio introduction, working hours, contact, login button |
| Customer | Login, view own group and upcoming classes, cancel a class, book a make-up class |
| Admin | Manage customers, groups, capacity, bookings; freeze or unfreeze memberships; configure rules; track membership periods and record offline payments (due soon, paid, overdue) |

## Not in the first version

Online payments (payments are collected in person and only recorded in the system), class packs (memberships are time-based only), WhatsApp/SMS reminders, waiting list, self sign-up, instructor role, reporting, multi-studio screens, native mobile app. The data model will leave room for multiple studios later.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React (Vite) | Clear separation from the backend, large ecosystem, PWA-friendly |
| Backend | Node.js + Express (JavaScript) | Transparent, minimal framework; the API flow stays visible |
| Database | PostgreSQL, plain SQL (`pg`) | Strong data integrity and transactions for booking logic |
| Authentication | Server-side sessions, httpOnly cookies, bcrypt password hashing | Sessions can be revoked instantly (e.g. when a member leaves) |
| Deployment | Decided later, see below | Pricing changes often, so this is re-checked right before deploying |

The backend will also serve the built React app, so the frontend and API share one origin (simpler cookies, no CORS setup).

## Roadmap

1. Requirements and business rules (done)
2. User flows and wireframes
3. Technology selection
4. Development environment and repository setup
5. Database design
6. Backend and API
7. Authentication and authorization
8. Customer interface
9. Admin panel
10. Booking and make-up logic
11. Validation, security and testing
12. Deployment and documentation

## License

Not decided yet.
