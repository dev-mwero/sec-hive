# SecHive — Architecture

> **Know Who's on Guard. Know Where. Know When.**

## 1. What SecHive Is

SecHive is a multi-tenant SaaS platform for **private security companies** to manage guard
deployment across client sites.

The core question SecHive answers:

> Who is on duty, where are they, at which station, for which client, under which security
> company, and what is their current status?

### The core domain concept is DEPLOYMENT, not attendance

```
Security Company
       ↓
     Client
       ↓
      Site
       ↓
    Station
       ↓
 Duty Assignment   ← first-class domain entity
       ↓
     Guard
       ↓
   Attendance      ← evidence that the deployment happened
```

A **DutyAssignment** is the scheduling record. An **AttendanceRecord** is the proof of
presence for that assignment. Attendance is downstream of deployment — never the reverse.

## 2. Stack

| Layer           | Choice                                        | Rationale                              |
| --------------- | --------------------------------------------- | -------------------------------------- |
| Framework       | Next.js 16.3 (App Router, Turbopack)          | RSC + Server Actions + Route Handlers  |
| Language        | TypeScript 5 (strict)                          | Domain safety at compile time          |
| UI              | React 19.2                                     |                                        |
| Styling         | Tailwind CSS v4                                | Tokens via `@theme`                    |
| Components      | shadcn/ui + Radix + Lucide                     | Accessible primitives, owned in-repo   |
| Forms           | React Hook Form + Zod                          | Shared schemas for client + server     |
| Validation      | Zod 4                                           | One schema, two enforcement points     |
| Database        | MongoDB (Atlas) + Mongoose 9                   | Flexible nested deployment documents   |
| Auth            | Auth.js / NextAuth v5 (Credentials + JWT)      | Self-hosted, no vendor lock-in         |
| Lint / Format   | Biome 2                                         | Fast, already in repo                 |
| Tests           | Vitest (unit) + Playwright (E2E)                |                                        |
| Deploy          | Vercel + MongoDB Atlas                          |                                        |

### Why MongoDB

Deployment data is read-heavy, highly filtered and varies in shape per tenant. Documents map
naturally onto the domain chain (a station's coverage, an assignment's denormalised
scheduled window). Tenant isolation is a mandatory field on every collection, so a compound
`{ organizationId, ... }` prefix keeps every query tenant-local by construction.

## 3. Repository layout

```text
src/
  app/                        # Next.js App Router
    (marketing)/              # Public landing page (no auth)
    (auth)/                   # Login
    (app)/                    # Authenticated app shell
      dashboard/              # Role-aware dashboard
      live-deployment/        # Primary operational screen
      assignments/
      guards/ clients/ sites/ stations/ shifts/
      attendance/ coverage/ reports/
      notifications/ audit-log/ users/ settings/
      duty/                   # Guard mobile-first experience
      portal/                 # Client portal
    api/v1/                   # Versioned Route Handlers
      auth/ guards/ clients/ sites/ stations/ shifts/
      assignments/ attendance/ dashboard/ notifications/
  components/
    ui/                       # shadcn/ui primitives (owned, not a dep)
    shared/                   # Cross-domain components
    layout/                   # Sidebar, Topbar, Breadcrumbs, UserMenu
    tables/                   # DataTable, filters, pagination
    status/                   # StatusBadge, CoverageMeter (text + colour, never colour alone)
  lib/
    auth/                     # auth.ts config, session helpers
    db/                       # Mongoose connection singleton
    permissions.ts            # RBAC matrix + can() helpers
    tenant.ts                 # org scoping primitives
    api-response.ts           # success()/failure() envelope
    validation.ts             # shared primitives
    utils.ts
  models/                     # Mongoose schemas (one file per entity)
  schemas/                    # Zod schemas (shared client/server)
  server/
    services/                 # Business logic (org-scoped)
    queries/                  # Read models / aggregations
    audit.ts                  # Audit writer
    notifications.ts          # In-app notification writer
  types/                      # Domain TypeScript types
  constants/                  # Enums, nav config, labels
  data/                       # DUMMY DATA — dev only, typed, clearly marked
docs/
```

### Layer rules

```
app/**            → may call server/**
server/**         → may call models/**, lib/**, schemas/**
models/**         → may call lib/** only (no UI, no session)
lib/**            → framework-agnostic helpers
```

- **Never** query Mongoose directly from a component.
- **Never** place business logic inside a UI component (e.g. lateness calculation lives in
  `server/services/attendance.ts`, not in the badge).
- **Never** accept a tenant id from the browser as authority — derive it from the session.

## 4. Data access strategy

Three layers, each with a single responsibility:

1. **`server/services`** — mutations and business rules. Every write validates ownership and
   writes an AuditLog entry.
2. **`server/queries`** — read models. Every query begins with `{ organizationId }` from the
   session. Never from input.
3. **`server/audit.ts`** — the only writer of AuditLog. Fire-and-forget on success.

Read paths use MongoDB aggregations for the Live Deployment / Coverage screens, because those
are cross-collection joins (Assignment ⨝ Guard ⨝ Station ⨝ Site ⨝ Client) with no write
side-effects.

## 5. Request & data flow

```text
Browser
  │  cookie: <session>
  ▼
proxy.ts                       coarse route gate (session cookie present?)
  │
  ▼
Server Component / Route Handler
  │
  ├─► auth()                   → { userId, organizationId, role, clientId? }
  │      └─ throws/redirects if unauthenticated
  │
  ├─► requirePermission('assignments:create', ctx)
  │      └─ RBAC check AND tenant scope check
  │
  ├─► zod.parse(body)          → typed, whitelisted input
  │
  ├─► service.mutate(...)      → ownership re-verified in the DB query
  │
  ├─► audit.write(...)         → AuditLog
  │
  └─► response envelope        → { success, data, message } | { success, error }
```

`proxy.ts` is an **optimisation for redirects only**. It is not a security boundary — every
page and route handler re-checks the session server-side.

## 6. Multi-tenancy

The tenant is the **Organization** (the security company). Every tenant-owned collection
carries a required `organizationId`.

Three tenant shapes:

| Shape        | Example                       | Scope rule                                          |
| ------------ | ----------------------------- | --------------------------------------------------- |
| Company-wide | Guard, Shift, Station         | `organizationId`                                    |
| Sub-tenant   | Client                        | `organizationId` **and** `clientId`                  |
| Per-site     | Site                          | `organizationId` **and** `clientId` **and** `siteId` |

Isolation is enforced in **three** independent places:

1. **Query scope** — services/queries accept an `orgId` and include it in the filter.
2. **Ownership re-verification** — a write on `:id` re-reads the doc with `{ _id, organizationId }`
   in the filter. A mismatch returns 404 (not 403 — see §Security).
3. **Route layout** — role-appropriate sections live in separate route groups.

## 7. Authentication architecture

- **Auth.js v5** (`next-auth@5.0.0-beta.32`), `Credentials` provider, **JWT** session strategy.
- Passwords hashed with **bcrypt** (cost 12). Never logged, never returned.
- The JWT carries `{ sub, organizationId, role, clientId? }` so authorisation is a pure,
  synchronous, non-DB check at the edge of every request.
- `proxy.ts` (Next 16's replacement for `middleware.ts`) uses the Auth.js `auth()` wrapper for
  optimistic redirects.

### ⚠ Known upstream constraint (Next.js 16)

Auth.js's **`signIn` server action is broken on Next.js 16** (it synthesises a request URL and
the `x-forwarded-proto` header is absent in the Server Action context, producing a protocol
mismatch). Upstream issue: `nextauthjs/next-auth#13387`.

**Decision:** SecHive posts credentials via the **HTTP handler path** — a client-side
`signIn()` call, or a direct form POST to `/api/auth/callback/credentials`. Both exercise
`handlers.POST`, which works correctly on Next 16 on localhost and Vercel. Verified in
`src/lib/auth/sign-in.ts`. Do **not** reintroduce the server-action `signIn`.

## 8. RBAC architecture

Role → permission matrix in `src/lib/permissions.ts`. Permissions are strings
(`resource:action`) so finer-grained roles can be added later **without redesigning the
authorisation layer** — adding a role means adding a row to the matrix, nothing else.

```ts
can(ctx, 'assignments:create')            // pure check
requirePermission('assignments:create')   // throws/redirects
```

See [rbac.md](./rbac.md).

## 9. UI strategy: UI-first with dummy data

To keep momentum and keep design decisions cheap to change, the build order is **UI first**:

1. Build the screen against typed dummy data in `src/data/` — real shapes, fake records.
2. Lock the layout, information hierarchy and mobile behaviour.
3. Swap the data source for a service call. The component signature does not change because
   the dummy data is typed with the **same** domain types.

Dummy data is dev-only and isolated in `src/data/`. It is never imported from `server/`.

### Design system

`src/app/globals.css` + `src/lib/design/tokens.ts` define the tokens: colour, radius, type
scale, status semantics. Status is **always text + icon + colour**, never colour alone
(§34 of the product spec and WCAG 1.4.1).

## 10. Real-time strategy

MVP is **server-rendered with explicit refresh and short polling** (30s on Live Deployment,
60s on dashboards). This is honest about what it is — a 30-second poll is not real-time, and
the UI says so ("Updated 12s ago").

The domain already emits the events a future SSE/WebSocket transport would carry
(`guard.checked_in`, `assignment.created`, `station.uncovered`). `server/notifications.ts` is
the single write point; swapping its delivery to a push channel later does not change the
domain.

## 11. Caching

Per the Next 16 data-security guide, we use **request-scoped caching only** (`React.cache` /
`"use cache"` within a request) and explicit **`updateTag`** in Server Actions for
read-your-writes. There is **no shared cache** holding tenant data across users, so there is
no cross-tenant cache-poisoning surface.

## 12. Deployment

Vercel (serverless Node runtime) + MongoDB Atlas. Connection pooling via a Mongoose
singleton cached on `globalThis` so warm lambdas reuse one pool. `serverExternalPackages`
keeps Mongoose out of the bundler.

## 13. Branching & commit strategy

```
main  ── protected, releasable
 └── dev  ── integration branch
      ├── feat/<slug>      ── merges to dev when verified (typecheck + lint + build + manual UI pass)
      └── fix/<slug>
```

Every phase is one or more **meaningful conventional commits**. A phase is not merged until
`biome check` is clean, `tsc --noEmit` is clean and `next build` succeeds.

## 14. Architectural risks

| Risk | Mitigation |
| --- | --- |
| Cross-tenant data leakage via a missed filter | All reads/writes go through services that require `orgId`; forbidden id returns 404 |
| IDOR on `:id` routes | Ownership re-verified inside the mutation, filter `{ _id, organizationId }` |
| Auth.js `signIn` server action broken on Next 16 | Use HTTP-handler path; documented above |
| Client portal leaking guard HR data | Serialiser layer — client-facing projection omits `employeeNumber`, `phone`, `email`, `dateJoined` |
| Mongoose in serverless → connection storms | `globalThis` singleton + `serverExternalPackages` |
| Shift template edits rewriting history | Assignment denormalises `scheduledStart`/`scheduledEnd` at creation |
| Assignment conflicts silently created | Overlap detection in `server/services/assignments.ts`; blocked, not warned |
| Denormalised assignment fields drifting | Assignment is the record of truth; Shift is only a template |
| Colour-only status signalling | Status components render text + icon + colour |