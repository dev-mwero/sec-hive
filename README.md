# SecHive — Security Hive

> **Know Who's on Guard. Know Where. Know When.**

Multi-tenant SaaS for private security companies to manage guard deployment across client
sites — live deployment, duty assignments, attendance and station coverage.

```
Security Company → Client → Site → Station → Duty Assignment → Guard → Attendance
```

SecHive is a **deployment** platform. `DutyAssignment` is the first-class entity; attendance
is the evidence that a deployment actually happened.

---

## Stack

| Layer         | Choice                                  |
| ------------- | --------------------------------------- |
| Framework     | Next.js 16.3 (App Router, Turbopack)    |
| Language      | TypeScript 5 (strict)                    |
| UI            | React 19.2 · Tailwind v4 · shadcn/ui · Lucide |
| Forms/valid.  | React Hook Form · Zod 4                 |
| Database      | MongoDB (Atlas) · Mongoose 9            |
| Auth          | Auth.js / NextAuth v5 (Credentials + JWT) |
| Lint          | Biome 2                                  |
| Tests         | Vitest · Playwright                     |
| Deploy        | Vercel + MongoDB Atlas                  |

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in MONGODB_URI + AUTH_SECRET
npm run dev                    # http://localhost:3000
```

```bash
npm run lint        # biome check
npm run typecheck   # tsc --noEmit
npm run build       # next build
```

## Architecture at a glance

- **Tenant** = `Organization` (the security company). Every tenant-owned document carries a
  required `organizationId`.
- **Isolation is enforced server-side in three places**: query scope, ownership re-verification
  on every mutation, and a type-level requirement that a filter carry `organizationId`.
- **Authorisation** is a role → permission matrix plus a scope that can only narrow.
- **Client portal** reads live under `/api/v1/portal` with a stripped guard projection — no HR
  fields ever reach a client.

## Documentation

| Doc                                                | Contents                                              |
| -------------------------------------------------- | ----------------------------------------------------- |
| [architecture.md](docs/architecture.md)             | Stack, layering, data flow, branching, risks           |
| [database.md](docs/database.md)                     | Models, indexes, status machines, historical integrity |
| [rbac.md](docs/rbac.md)                             | Roles, permission matrix, scopes, escalation controls  |
| [api.md](docs/api.md)                               | Endpoints, envelopes, error codes, security middleware |
| [security.md](docs/security.md)                     | Threat model and controls                              |
| [roadmap.md](docs/roadmap.md)                       | Phases, scope discipline, anti-scope rules             |

## Key decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Auth | Auth.js v5, Credentials + JWT | Self-hosted; JWT carries `organizationId` + `role` so authorisation is a pure check |
| Client portal auth | Same system, `CLIENT_ADMIN` / `CLIENT_VIEWER` roles with a `clientId` scope | One RBAC matrix serves both company and portal |
| Shift times | `Date` pinned to 1970-01-01, read via minutes-since-midnight | Numeric arithmetic and range queries, no string parsing |
| Overnight shifts | `crossesMidnight` flag; `scheduledEnd` lands on the next day | Night shifts are first-class, not a special case |
| Lateness | Per-organisation `gracePeriodMinutes` (default 5) | Tolerance is company policy — 5, 15, or strict |
| Real-time | SSR + explicit refresh + 30s polling, labelled honestly | Polling is not real-time and the UI does not pretend it is |
| Assignment conflicts | **Blocked** with `409`, not warned | A silently double-booked guard is worse than a failed form |
| Demo data | Typed dummy data in `src/data/`, UI built first | Layout decisions are cheap while data is fake |

## Branching

```
main          protected, releasable
 └── dev      integration branch
      ├── feat/<slug>
      └── fix/<slug>
```

Each phase lands as meaningful conventional commits and merges to `dev` only after
`biome check`, `tsc --noEmit` and `next build` are clean.

## Status

Development in progress. See [roadmap.md](docs/roadmap.md).