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
| `guards:read_public` | ✔ | assigned | assigned | own client | own client | · |
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
  | { kind: "organization" }                    // whole tenant
  | { kind: "sites"; siteIds: string[] }        // subset of sites
  | { kind: "client"; clientIds: string[] }     // subset of client accounts
  | { kind: "self" };                           // own records only

type ScopeTarget = "site" | "client" | "child";
```

Resolution:

```
PLATFORM_ADMIN        → organization, only with explicit active org
SECURITY_COMPANY_ADMIN → organization
SUPERVISOR            → sites: [sites where supervisorIds contains user]
SITE_MANAGER          → sites: [same]
CLIENT_ADMIN          → client: [user.clientId]
CLIENT_VIEWER         → client: [user.clientId]
GUARD                 → self
```

A scope can only ever **narrow**. A service never widens a caller's scope to make a query
work; if the target record falls outside scope, the request returns **404**.

### Scope → filter: the scope is not enough

`scopeFilter(scope, target)` in `src/lib/tenant.ts` translates a resolved scope into the Mongo
predicate it contributes. It takes a **second, required** argument, because the scope→field
mapping is a property of the *collection* rather than of the scope:

| `target` | Collection shape | `sites` scope narrows on | `client` scope narrows on |
| --- | --- | --- | --- |
| `"child"` | Carries `siteId` / `clientId` as a foreign key — `Station`, `DutyAssignment`, `AttendanceRecord`, … | `siteId` | `clientId` |
| `"site"` | The `Site` collection itself — a site document's own id *is* the site, so it has no `siteId` field | `_id` | `clientId` |
| `"client"` | The `Client` collection itself — a client document's own id *is* the client, so it has no `clientId` field, and the site→client relation lives on `Site`, so it carries no site membership | `{ _id: null }` — unrepresentable, matches nothing | `_id` |

A `target` exists for a collection whose *own* identity is what the scope names, and for no other
reason: `Client` has the same defect `Site` had, one link up the chain, and a client-scoped read of
`Client` narrows on `_id` exactly as a site-scoped read of `Site` does. A `null` cell means the
collection cannot express that scope at all — the site→client relation is stored on `Site`, so a
supervisor's site list cannot be resolved against `Client` without a cross-collection lookup, which
is resolution rather than filtering. Unrepresentable therefore matches nothing.

| Scope kind | `"child"` | `"site"` | `"client"` |
| --- | --- | --- | --- |
| `organization` | `{}` | `{}` | `{}` |
| `sites` | `{ siteId: { $in: siteIds } }` | `{ _id: { $in: siteIds } }` | `{ _id: null }` |
| `client` | `{ clientId: { $in: clientIds } }` | `{ clientId: { $in: clientIds } }` | `{ _id: { $in: clientIds } }` |
| `self` | `{ _id: null }` | `{ _id: null }` | `{ _id: null }` |
| unrecognised target or scope kind | `{ _id: null }` | `{ _id: null }` | `{ _id: null }` |

Two rules make this safe, and `src/lib/security.test.ts` holds both:

1. **`{}` is produced only by `organization` scope**, in every collection. `{}` matches every
   document, so a filter that "lost" its predicate is a full tenant leak. Every other scope kind
   either narrows or matches nothing — `{ _id: null }` is always false, since `_id` is an ObjectId
   and is never `null`. This includes a target or scope kind that arrives via a cast: the lookup
   misses and resolves to `{ _id: null }`, never to an absent predicate.

2. **`target` has no default.** A defaulted target would preserve the defect it exists to fix —
   `scopeFilter(ctx.scope)` against `Site` would compile, silently match zero rows, and read as a
   successful, correctly-scoped but empty board. Requiring it makes every call site declare which
   collection shape it is reading, and a wrong literal is a compile error at that call site.

`organization` is resolved before the target is consulted, so it is the one case where a
misspelled `target` still yields `{}`. That is correct: the caller already holds the widest scope
there is, the tenant predicate is supplied separately by `OrgFilter` (`organizationId` is required
on every service read), and failing closed would deny a legitimate org-wide admin over a typo.

### `supervisorIds` is resolution, not filtering

`Site.supervisorIds` admits a second strategy: `{ supervisorIds: userId }`, resolving a
supervisor's sites by assignment at read time instead of from a precomputed id list. It is
deliberately **not** part of `scopeFilter`.

Both are the *same* step — turning "this user is a supervisor" into "these site ids" — and
`resolveScope`'s contract already fixes that step as *"siteIds must be supplied by the caller from
the database, never from the request body"*. The difference is only whether the ids are
materialised into a `Scope` or left as a query, which is a query-plan decision for the service
layer that builds `AuthContext`, not a property of the filter translator. Putting it in
`scopeFilter` would make the filter depend on a user id that is not part of `Scope` — precisely
the optional-argument-whose-absence-changes-the-security-property shape this API avoids.

Should the id list ever grow too large to materialise into `$in`, the fix is a new `Scope`
variant resolved from `supervisorIds` in the service layer, not a special case inside
`scopeFilter`.

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

### Unscoped reads

A page that renders **unscoped** organisation rows — no `organizationId`, `clientId` or
`siteId` predicate narrowing them — asserts two checks, not one. `can()` answers "may this
role do this"; `hasOrgWideScope()` answers "may these rows exist for this role". They are
different questions and only one of them is a capability check:

```ts
// ✔ Both. dashboard/live is unscoped, so both are required.
if (!can(role, "deployment:read") || !hasOrgWideScope(role)) redirect(homeForRole(role));
```

Asserting `can()` alone is a tenant leak rather than a missing check: `client_admin`,
`client_viewer`, `supervisor` and `site_manager` all hold `deployment:read` — see the live
board row in the deployment table above — and a capability check cannot distinguish a role
scoped by *site* from a role scoped by *nothing*.

Three rules follow, and `src/lib/security.test.ts` is where they are held:

1. **Both checks, always.** Any page reading unscoped organisation rows asserts `can()` *and*
   `hasOrgWideScope()`. Pages reading scoped rows call neither and narrow by `clientId` or
   `siteId` in the query instead.

2. **The two modules must not disagree.** `hasOrgWideScope(role)` is true **iff**
   `scopeFilter(resolveScope(role, …), target)` is empty. The predicate lives in `permissions.ts` and
   scope resolution in `tenant.ts`; they answer the same question in two files, and the
   composed-guarantee test is the only thing stopping them drifting — the live board was
   silently served to site-scoped roles precisely because the two disagreed. The equivalence
   holds for *every* `target`, because `organization` is the only scope kind that yields `{}` and
   it yields it regardless of collection — so the premise survives `scopeFilter` gaining a
   target dimension, and the test asserts it for each one rather than for a single representative
   call. `CLIENT_ROLES`,
   `SITE_SCOPED_ROLES` and `SELF_SCOPED_ROLES` in `src/constants/domain.ts`, plus
   `ORGANIZATION_SCOPED_ROLES` in `permissions.ts`, are the single source of truth for all
   three classifiers (`hasOrgWideScope`, `isClientRole`, `isSiteScopedRole`) — each classifier
   reads its bucket rather than restating the role literals. The four buckets partition `ROLES`
   exactly once each, and `ORGANIZATION_SCOPED_ROLES` is an **allowlist** so that a role added
   to `ROLES` without being classified is least-privilege rather than org-wide.

3. **Site-scoped roles get the scoped board, not a redirect.** A `supervisor` or
   `site_manager` is redirected off an *unscoped* surface, but where the surface reads through
   the caller's scope filter they are entitled to the rows. Narrowing is the control; denying
   the page outright would be a defect in its own right.

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

`src/lib/security.test.ts` and `src/server/**/*.test.ts` cover:

- every role × every permission pair against the matrix,
- `SiteManager` and `Supervisor` cannot write outside their sites,
- `Guard` cannot read another guard's assignments,
- `ClientViewer` receives `403` (not `404`) on a record it can legitimately read,
- client A cannot read client B's assignments — **404**, and existence is not leaked,
- `PlatformAdmin` without an active org selection is refused,
- a request carrying another tenant's `organizationId` in the body is ignored in favour of the
  session value.