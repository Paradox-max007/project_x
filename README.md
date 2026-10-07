# ASM Manpower Management System

A full-stack workforce management platform for manpower companies: employees, sites, attendance, leave, warnings, fines, uniform/PPE registry, cancellations, notifications, audit logs, analytics and role-based access control.

**Backend:** Supabase (PostgreSQL) via Prisma ORM
**Hosting:** Vercel (Next.js)

## Tech Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS 4** + shadcn/ui (New York) + Lucide icons
- **Prisma ORM** against **Supabase PostgreSQL**
- Custom session auth (scrypt password hashing, AES-256-GCM field encryption)
- Recharts dashboards, jsPDF reports

## Features (15 modules)

Dashboard analytics · Employees (encrypted documents, PDF CV/report) · Sites (team leaders, history) · Attendance (monthly matrix, calendar, bulk, overtime) · Leave requests (approval -> attendance integration) · Warnings (auto-check, rating penalties) · Fines · Cancellation requests (soft-delete with history preservation) · Uniform/PPE registry (issues, tokens, renewals) · Notifications (deep links) · Administrators (granular menu permissions) · Audit logs (before/after JSON) · Settings · Role-based access (super admin / admin)

## Quick Start

### Prerequisites

- Node.js 20+ (or Bun 1.1+)
- A free [Supabase](https://supabase.com) project

### 1. Create the Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. When asked, set a database password (save it — you need it below).
3. Open **Settings -> Database -> Connection string -> URI**. Supabase shows two hosts:
   - **Transaction pooler** (`...pooler.supabase.com:6543`) — for the running app
   - **Session/direct** (`...pooler.supabase.com:5432`) — for schema changes

### 2. Configure the environment

Edit `.env` in the project root and replace the placeholders:

```env
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
ASM_SECRET_KEY="[REPLACE-WITH-LONG-RANDOM-STRING]"
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled runtime connection (app queries). Keep `?pgbouncer=true`. |
| `DIRECT_URL` | Direct connection used by `prisma db push` / migrations / seed. |
| `ASM_SECRET_KEY` | Key material for AES-256-GCM encryption of passport/ID numbers. **Set before first seed** — generate with `openssl rand -hex 32`. |

### 3. Install, create the schema, seed

```bash
bun install          # or: npm install
bun run db:push      # creates all tables in Supabase
bun run db:seed      # demo data (24 employees, 6 sites, attendance, ...)
bun run dev          # http://localhost:3000
```

> `npm run db:push` / `npm run db:seed` work identically if you prefer npm.

### 4. Log in (seeded accounts)

| Account | Password | Access |
| --- | --- | --- |
| `superadmin@asm.com` | `SuperAdmin@123` | Everything |
| `hr.admin@asm.com` | `Admin@123` | HR modules only |
| `ops.admin@asm.com` | `Admin@123` | Operations modules only |

## Deploy to Vercel

1. Push this repository to GitHub.
2. In [vercel.com](https://vercel.com) choose **Add New -> Project** and import the repo.
3. Framework preset is auto-detected (**Next.js**); keep the default build command (`next build`).
4. Under **Environment Variables**, add the same three variables from `.env` (`DATABASE_URL`, `DIRECT_URL`, `ASM_SECRET_KEY`) for Production and Preview.
5. Click **Deploy**.

The `postinstall` script runs `prisma generate` automatically during the Vercel build.

> The database schema must exist before the first deploy. If you have not run `bun run db:push` + `bun run db:seed` in step 3 above, run them once from your machine — they target Supabase directly, so the tables created locally are the ones Vercel uses.

## Project Structure

```
prisma/schema.prisma     # 17 models (PostgreSQL)
prisma/seed.ts           # demo data
src/app/api/             # 46 REST route handlers
src/app/page.tsx         # SPA entry (client-side view switching)
src/components/manpower/ # views + shared UI
src/lib/                 # auth, crypto, permissions, api helpers
```

## Security Notes

- Sensitive fields (passport/ID numbers) are AES-256-GCM encrypted at rest with `ASM_SECRET_KEY`; masked by default and revealed on demand (audited).
- All authorization is enforced server-side per request (menu permissions + role checks).
- Every mutation writes an audit log entry (actor, entity, before/after JSON).
- Sessions are httpOnly cookies (7 days) stored in the `Session` table.
