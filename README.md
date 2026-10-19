# Antrian

SaaS queue-management foundation built as a Next.js modular monolith. A single
business model supports different business types through configuration rather
than industry-specific applications.

## Stack

- Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui
- MySQL and Prisma
- Auth.js credentials authentication
- Zod input validation

## Quick start with Docker Compose

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps                    # web-antrian-mysql (healthy), web-antrian-app
curl -fsS http://127.0.0.1:3000
docker compose logs -f --tail=50 app
docker compose down                  # do NOT pass -v: it deletes the MySQL data volume
```

Compose fills `DATABASE_URL`, `AUTH_SECRET`, and `AUTH_TRUST_HOST`, then runs
`prisma migrate deploy` + seed + build + start automatically. Host ports:
application `3000:3000`, MySQL `3307:3306`. The compose credentials and secret
are for local development only.

## Local setup

Requirements: Node.js 20+, MySQL 8+, and npm.

1. Copy `.env.example` to `.env` and set `DATABASE_URL`, a unique `AUTH_SECRET`,
   and `AUTH_TRUST_HOST=true`. Only enable trusted-host mode when the application
   is accessed directly in local development or behind a reverse proxy that
   validates the incoming `Host` header.
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

The local seed account is `admin@antrian.test` / `Antrian123!`. It is for local
development only. Replace it and rotate `AUTH_SECRET` before deploying.

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
- Branded 404 and runtime-error pages, retryable availability feedback, and
  accessible field-level validation messages for public queue and booking forms.
- Searchable service pickers appear automatically when a business has more than
  five active services; shorter lists keep the compact native select control.

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
require a database. WhatsApp delivery, full branch administration,
advertisement, and analytics reports are not implemented yet.

Working rules for AI agents and contributors are in `AGENTS.md`.
