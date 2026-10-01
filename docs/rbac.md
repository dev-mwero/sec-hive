# SecHive — RBAC

## Design goal

Authorisation must be extensible to finer-grained permissions **without redesigning the
authorisation layer**. That is achieved by separating two concepts:

- **Permission** — `"assignments:create"`. A capability, not a job title.
- **Role** — a named bundle of permissions assigned to a user.

Adding a role later is a new row in one matrix. Adding a fine-grained capability later is a new
string plus a matrix entry — no new plumbing, no new `if (role === ...)` branches scattered
through the codebase.

---

## Roles

| Role | Description | Tenant scope |
| --- | --- | --- |
| `platform_admin` | SecHive operator. Manages organisations themselves. | Platform-wide (explicit opt-in, audited) |
| `security_company_admin` | Runs the security company. Full control of its tenant. | Organisation |
| `supervisor` | Operational control over assigned sites. | Assigned sites only |
| `guard` | Performs duties. | Own assignments only |
| `site_manager` | Day-to-day site operations for assigned sites. | Assigned sites only |
| `client_admin` | Primary contact for a client. Manages their own users. | Own `clientId` only |
| `client_viewer` | Read-only client stakeholder. | Own `clientId` only |

### Why `platform_admin` is a role but not a bypass

Platform admins are a genuine operational need (support, onboarding), but an unbounded bypass
is a liability. A platform admin:

- must **explicitly select** the organisation they are acting within,
- has that selection recorded in **every** AuditLog entry,
- still passes through the normal per-tenant permission checks for day-to-day actions.

The alternative — `if (role === 'platform_admin') return everything` — is the kind of shortcut
that silently disables tenant isolation.

---

## Permission matrix

`✔` granted · `·` denied · `own` scoped to self · `assigned` scoped to assigned sites ·
`client` scoped to own client

### Company administration

| Permission | co_admin | supervisor | site_manager | client_admin | client_viewer | guard |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| `users:read` | ✔ | · | · | own client | · | · |
| `users:create` | ✔ | · | · | own client | · | · |
| `users:update` | ✔ | · | · | own client | · | · |
| `users:deactivate` | ✔ | · | · | · | · | · |
| `guards:read` | ✔ | assigned | assigned | · | · | own |
| `guards:create` | ✔ | · | · | · | · | · |
| `guards:update` | ✔ | · | · | · | · | · |
| `clients:read` | ✔ | assigned | assigned | own | own | · |
| `clients:create` / `:update` | ✔ | · | · | · | · | · |
| `sites:read` | ✔ | assigned | assigned | own client | own client | assigned |
| `sites:create` / `:update` | ✔ | · | · | · | · | · |
| `stations:read` | ✔ | assigned | assigned | own client | own client | assigned |
| `stations:create` / `:update` | ✔ | · | · | · | · | · |
| `shifts:read` | ✔ | assigned | assigned | own client | own client | own |
| `shifts:create` / `:update` | ✔ | · | · | · | · | · |

### Deployment operations

| Permission | co_admin | supervisor | site_manager | client_admin | client_viewer | guard |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| `assignments:read` | ✔ | assigned | assigned | own client | own client | own |
| `assignments:create` | ✔ | assigned | · | · | · | · |
| `assignments:update` | ✔ | assigned | · | · | · | · |
| `assignments:cancel` | ✔ | assigned | · | · | · | · |
| `attendance:read` | ✔ | assigned | assigned | own client | own client | own |
| `attendance:checkin` / `:checkout` | ✔ | · | · | · | · | own |
| `attendance:correct` | ✔ | assigned | · | · | · | · |
| `attendance:mark_absent` | ✔ | assigned | · | · | · | · |
| `coverage:read` | ✔ | assigned | assigned | own client | own client | · |
| `deployment:read` (live board) | ✔ | assigned | assigned | own client | own client | · |

### Platform, reporting, admin surfaces

| Permission | co_admin | supervisor | site_manager | client_admin | client_viewer | guard |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| `reports:read` | ✔ | assigned | · | own client | own client | · |
| `reports:export` | ✔ | assigned | · | own client | own client | · |
| `notifications:read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `audit:read` | ✔ | · | · | · | · | · |
| `audit:read_site` | ✔ | assigned | · | · | · | · |
| `settings:read` / `:update` | ✔ | · | · | · | · | · |
| `organizations:*` | platform_admin | · | · | · | · | · |

---

## Scope model

Granted permission is necessary but not sufficient. Every request also passes a **scope**
check. These compose:

```ts
type Scope =
  | { kind: "organization" }                       // whole tenant
  | { kind: "sites"; siteIds: ObjectId[] }         // subset of sites
  | { kind: "client"; clientId: ObjectId }         // one client
  | { kind: "self" };                              // own records only
```

Resolution:

```
PLATFORM_ADMIN     → organization, only with explicit active org
SECURITY_COMPANY_ADMIN → organization
SUPERVISOR         → sites: [sites where supervisorIds contains user]
SITE_MANAGER       → sites: [same]
CLIENT_ADMIN       → client: user.clientId
CLIENT_VIEWER      → client: user.clientId
GUARD              → self
```

A scope can only ever **narrow**. A service never widens a caller's scope to make a query
work; if the target record falls outside scope, the request returns **404**.

### Why 404, not 403

Returning `403 Forbidden` for "exists but not yours" confirms the record exists — a free
existence oracle for enumerating client ids, guard ids and site ids across tenants. Returning
`404` for both "does not exist" and "not yours" makes the two indistinguishable.

`403` is reserved for a **legitimate** record the caller may read but not write
(e.g. a `client_viewer` attempting to cancel an assignment).

---

## Enforcement points

Authorisation is enforced at three layers. Any single layer alone is insufficient.

### 1. Navigation & UI (convenience only)

`src/lib/permissions.ts` exposes `can(role, permission)` used by the sidebar and by buttons.
This **hides** what a user cannot do. It is never trusted — a hidden button is not a control.

### 2. `proxy.ts` (optimistic redirect)

Checks for the presence of a session cookie before rendering an authenticated shell. It runs
on every matched request and keeps the session rolling. It performs **no** database access and
makes **no** authorisation decision.

### 3. Server (the real boundary)

Every Server Component, Server Action and Route Handler passes through a guard:

```ts
const ctx = await requirePermission("assignments:create");  // auth + role + scope
const assignment = await createAssignment(ctx.organizationId, ctx.scope, input);
```

`requirePermission` throws a typed `AuthError`, which is translated to a redirect (pages) or
an error envelope (API). There is no code path that reaches a service without one.

---

## API authorisation pattern

Route handlers never trust the request body or path for scope:

```ts
// ✗ Never
const site = await Site.findById(body.siteId);

// ✓ Always — org from session, then verify
const site = await Site.findOne({
  _id: input.siteId,
  organizationId: ctx.organizationId,       // from the session, not the client
  clientId: { $in: ctx.clientIds },          // from scope, when client-scoped
});
if (!site) throw new NotFoundError("Site not found");
```

Every `findOne` / `findById` / `updateOne` / `deleteOne` in the service layer carries
`organizationId` in the filter. A query without it does not typecheck — `OrgQuery<T>` in
`src/lib/db/types.ts` requires it.

---

## Guard bootstrap & escalation

A `GUARD` user may have a `Guard` record pointing back at them via `Guard.userId`. The linkage
is one-to-one and written only by the service layer.

**Escalation vectors explicitly closed:**

| Vector | Control |
| --- | --- |
| Guard sets their own `role` on registration | `role` is never client-writable; registration always creates `client_viewer` or is admin-invited |
| Guard passes `guardId` of another guard to check in | `attendance:checkin` resolves the guard from the session, never from the request body |
| Client user passes another `clientId` to widen their view | `ctx.clientIds` comes from `User.clientId`; the body value is validated against it, not assigned from it |
| Client user reads guard phone/email | Privacy projection strips the fields server-side |
| Supervisor passes a site outside their assignment | Site is re-fetched with `{ _id, organizationId }`, then checked against `ctx.siteIds` |
| Platform admin used as a blanket bypass | Requires explicit org selection; audited on every write |

---

## Test matrix

`src/lib/permissions.test.ts` and `src/server/**/*.test.ts` cover:

- every role × every permission pair against the matrix,
- `SiteManager` and `Supervisor` cannot write outside their sites,
- `Guard` cannot read another guard's assignments,
- `ClientViewer` receives `403` (not `404`) on a record it can legitimately read,
- client A cannot read client B's assignments — **404**, and existence is not leaked,
- `PlatformAdmin` without an active org selection is refused,
- a request carrying another tenant's `organizationId` in the body is ignored in favour of the
  session value.