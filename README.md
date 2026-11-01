# Antrian

SaaS queue-management foundation built as a Next.js modular monolith. A single
business model supports different business types through configuration rather
than industry-specific applications.

## Stack

- Next.js App Router, React, TypeScript, Tailwind CSS, and lucide-react icons
- MySQL and Prisma
- Auth.js credentials authentication
- Zod input validation

## Quick start with Docker Compose

```bash
cp .env.example .env                 # set APP_URL (IP host / domain) first
docker compose up -d --build
docker compose ps                    # web-antrian-mysql (healthy), web-antrian-app
curl -fsS "$APP_URL"                 # defaults to http://127.0.0.1:3000
docker compose logs -f --tail=50 app
docker compose down                  # do NOT pass -v: it deletes the MySQL data volume
```

Compose fills `DATABASE_URL`, `AUTH_SECRET`, and `AUTH_TRUST_HOST`, then runs
`prisma migrate deploy` + seed + build + start automatically. Host ports:
application `3000:3000`, MySQL `3307:3306`. The compose credentials and secret
are for local development only.

`APP_URL` is the single source of truth for every absolute link the application
generates — QR codes, customer status links, display/TV links, and auth
callbacks. `NEXT_PUBLIC_APP_URL` carries the same value into client components.
Both must point at the public origin of the deployment; localhost is only ever a
local-development default. The Midtrans *Payment Notification URL* is built from
the same value — `<APP_URL>/api/v1/billing/midtrans/webhook` is shown in the
platform console at `/platform/integrasi` so it can be copied verbatim. Midtrans
must be able to reach it over HTTPS without a redirect, so a LAN address will
never work. `APP_PROTOCOL` optionally forces `http`/`https` when a
reverse proxy does not forward `X-Forwarded-Proto`.

## Local setup

Requirements: Node.js 20+, MySQL 8+, and npm.

1. Copy `.env.example` to `.env` and set `APP_URL`, `NEXT_PUBLIC_APP_URL`,
   `DATABASE_URL`, a unique `AUTH_SECRET`, and `AUTH_TRUST_HOST=true`. Only enable
   trusted-host mode when the application is accessed directly in local
   development or behind a reverse proxy that validates the incoming `Host`
   header.
2. Create the MySQL database named in `DATABASE_URL`.
3. Install dependencies with `npm install`.
4. Generate the Prisma client and apply the migrations:

   ```powershell
   npm run db:generate
   npm run db:migrate
   ```

5. Create the local demo business, staff account, and sample queues:

   ```powershell
   npm run db:seed
   ```

6. Start Next.js with `npm run dev` and open `http://localhost:3000`.

Local seed accounts, all for local development only — replace them and rotate
`AUTH_SECRET` before deploying:

| Account | Password | Reaches |
|---|---|---|
| `admin@antrian.test` | `Antrian123!` | Demo workspace dashboard |
| `owner@antrian.test` | `Owner12345!` | Workspace owner, including `/dashboard/klinik-sehat/langganan` |
| `spv@antrian.test` | `SuperAdmin123!` | Workspace Super Admin |
| `master@antrian.test` | `MasterAdmin123!` | Platform console `/platform` (`MASTER_ADMIN`) |

The workspace owner reaches the demo subscription page; the platform console
account configures Google login and the Midtrans keys there.

## Implemented foundation

- Tenant-aware business memberships and server-side role checks.
- Database-backed credentials authentication with bcrypt password hashes and
  a persistent login rate limit.
- Core business, branch, service, counter, customer, queue, booking, feature,
  access-token, audit, and outbox schema with MySQL indexes and constraints.
- Queue state machine, transactional next-ticket assignment, counter reservation,
  immutable queue history, audit events, and an outbox record per mutation.
- QR queue issuance and anonymous status links with hashed tokens, server-side
  feature checks, and database-backed rate limits.
- Public appointment booking with 30-minute local-time slots, one booking per
  service slot, concurrent slot locking, branch operating hours, confirmation
  links, admin confirmation/cancellation, and same-day queue check-in.
- Role-aware operational dashboard and a customer-facing QR queue flow.
- Per-workspace branding: an optional app title and an uploaded logo drive the
  browser tab title, favicon, sidebar, and public QR page. The dashboard greeting
  and dates follow the branch timezone. Both are configured on the workspace
  settings page (`/dashboard/<slug>/pengaturan`), Super Admin only.
- Branded 404 and runtime-error pages, retryable availability feedback, and
  accessible field-level validation messages for public queue and booking forms.
- Searchable service pickers appear automatically when a business has more than
  five active services; shorter lists keep the compact native select control.
- Account menu in the navbar: an initials avatar opens a modal with the account
  identity and a sign-out action. Anyone who needs a new password gets it reset by
  an admin (team page for tenants, platform console for operators), and the
  registration and password fields have a show/hide toggle.
- Platform console for the SaaS operator (`/platform`): businesses, users, plans,
  subscription assignment, trial reset, manual renewal, payment history, and the
  integration settings for Google login and Midtrans. Access requires the
  `MASTER_ADMIN` platform role, which is separate from any workspace membership.
- Midtrans billing per workspace: sandbox and production keys are stored
  encrypted (one slot per mode), a workspace owner picks a plan and pays through
  Snap, and renewal is driven by signature-verified notifications. Refunds do not
  pull a paid payment back to pending; they mark it with a refund timestamp.
- Role-aware in-app tutorial (`/dashboard/<slug>/panduan`) whose steps are
  filtered by the reader's role and the features enabled for that workspace.

## Verification

```powershell
npx prisma generate
npm run lint
npm run typecheck
npm test
npm run build
```

All five steps must exit 0 before committing; CI in `.github/workflows/ci.yml`
runs the same sequence on Node 20. There is no Playwright/E2E dependency in this
repository — UI verification is done manually in the browser.

The application requires a configured MySQL instance for authenticated pages,
seed data, and API/database integration flows. Unit tests for domain logic do not
require a database — `npm test` runs `tsx --test tests/*.test.ts` on `node:test`
and needs no server. WhatsApp delivery, full branch administration,
advertisement, and analytics reports are not implemented yet. There is no
Playwright/E2E dependency either: the flows were exercised in a real browser
manually, plus scripted HTTP checks kept out of the repository.

Working rules for AI agents and contributors are in `AGENTS.md`.
