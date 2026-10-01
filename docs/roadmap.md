# SecHive — Roadmap

Scope discipline rule for every feature:

> **MVP** — does it help a security company know *who is deployed where* and *whether that
> deployment is currently active or covered*? If not, it belongs later.

---

## Phase 0 — Discovery ✅

Architecture, domain model, RBAC, API design, security model. See [architecture.md](./architecture.md).

## Phase 1 — Foundation

Dependencies, env config, Mongoose connection, folder structure, domain types, design tokens,
shadcn/ui primitives, lint/typecheck clean.

## Phase 2 — Application shell & UI system

Landing page, authenticated shell, sidebar with role-aware navigation, topbar, user menu,
breadcrumbs, status badge system, data tables with filters, pagination, responsive behaviour.

> **UI-first.** Screens are built against typed dummy data before the backend exists, so layout
> and hierarchy are settled while they are cheap to change.

## Phase 3 — Authentication

Registration, login, logout, session handling, protected routes, password policy, rate limiting.

## Phase 4 — Multi-tenancy + RBAC

Organisation model, permission matrix, scope resolution, server-side guards, cross-tenant tests.

## Phase 5 — Users, Guards, Clients, Sites, Stations, Shifts

CRUD with search, filtering, pagination, and correct permission gating throughout.

## Phase 6 — Duty assignments

Assignment creation with shift materialisation, overnight-shift handling, **overlap detection
(blocked, not warned)**, edit, cancel, history.

## Phase 7 — Live deployment + coverage

The primary operational screen. Filters, search, date selection, coverage rollup, uncovered
station surfacing, auto-refresh with an honest "updated Ns ago" indicator.

## Phase 8 — Guard duty, attendance, supervisor, client portal

Guard mobile-first check-in/out, lateness detection with per-company grace period, supervisor
site coverage, strictly isolated client portal.

## Phase 9 — Audit, reports, notifications

Audit log, deployment/attendance/coverage reports, CSV export (with formula-injection
protection), in-app notifications.

## Phase 10 — Hardening & verification

Security review against [security.md](./security.md), test suite, typecheck, lint, build.

---

## Post-MVP

### Phase 2 of the roadmap — Verification & communications

QR-code check-in · GPS check-in · geofencing · automated email / SMS / WhatsApp
notifications · supervisor site visits · shift templates per site.

### Phase 3 — Incident & patrol management

Incident reports · digital occurrence book · patrol management · patrol checkpoints ·
evidence and photos · emergency alerts.

### Phase 4 — Workforce & commercial

Payroll · leave management · guard documents and licence expiry tracking · contracts ·
client billing · invoices · payments · subscriptions.

### Phase 5 — Intelligence

Advanced analytics · workforce analytics · staffing optimisation · natural-language reporting.

### Phase 6 — Platform

Native mobile applications · advanced guard verification · multi-company ecosystem · guard
marketplace / network · external integrations.

---

## Anti-scope rules

Not introduced without an explicit request, even though they appear above:

- Incidents, patrols, payroll, invoicing in MVP — none of them answer *"who is guarding what
  right now?"*
- GPS or QR check-in in MVP — `Station` already has room for coordinates later, and
  `DutyAssignment` is already a time-scoped record.
- Real-time websockets in MVP — the MVP uses server rendering plus polling and **says so in
  the UI**. Claiming real-time when it is a 30-second poll would be dishonest.
- Client-facing billing data — never.
- Guard HR fields in the client portal — excluded by the privacy projection.

---

## Branching

```
main            protected, releasable
 └── dev        integration branch
      ├── feat/<slug>
      └── fix/<slug>
```

A phase merges to `dev` only after `biome check`, `tsc --noEmit` and `next build` are clean
and the UI has been reviewed at desktop **and** mobile widths.