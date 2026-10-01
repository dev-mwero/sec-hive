# SecHive — Security

SecHive holds live operational information about where armed guards are deployed. A
cross-tenant leak is a **safety** incident, not just a data breach. Every control below is
treated as a release blocker.

## Threat model

| Actor | Capability | Primary risk |
| --- | --- | --- |
| Unauthenticated | Reaches any endpoint | Enumeration, credential stuffing, disclosure |
| Guard | Valid low-privilege login | Privilege escalation, checking in for another guard |
| Supervisor | Valid login, subset of sites | Accessing sites outside their assignment |
| Client user | Valid login, own client | Reading other clients, or guard HR data |
| Compromised tenant | Full access to own tenant | Cross-tenant pivoting via IDs in request bodies |
| Malicious insider | Legitimate broad access | Reading data they should not, undetected |

---

## 1. Authentication

- **Auth.js v5**, `Credentials` provider, **JWT** session strategy.
- Passwords hashed with **bcrypt, cost 12**. `passwordHash` uses `select: false` — an accidental
  `.findOne()` cannot leak it into a response.
- Minimum 12 characters, and password strength is checked against a small breached-password
  list before the hash is created.
- Generic error on failed sign-in: `"Invalid email or password"`. The response never reveals
  whether the account exists.
- Failed logins are **rate limited** and audit-logged.
- Sessions are `httpOnly`, `sameSite: lax`, `secure` in production, and rolling.
- `AUTH_SECRET` is required in production; the app refuses to boot without it.

### Known Next.js 16 constraint

Auth.js's `signIn` **server action** is broken on Next.js 16 — it builds a synthetic request
URL from an absent `x-forwarded-proto` header and produces a protocol mismatch
(upstream `nextauthjs/next-auth#13387`).

**Control:** SecHive authenticates through the HTTP-handler path
(`/api/auth/callback/credentials`) via a client-side `signIn()` in
`src/lib/auth/sign-in.ts`. A lint rule and a code comment prevent reintroducing the server
action.

---

## 2. Authorisation

Authorisation is enforced in the **server layer only**. UI hiding is convenience, never a
control.

```ts
const ctx = await requirePermission("assignments:create");
```

`requirePermission` verifies three things in order and throws `AuthError` otherwise:

1. Session exists and is unexpired.
2. The role's matrix grants the permission.
3. A scope could be resolved for the caller.

See [rbac.md](./rbac.md) for the matrix and scope model.

### No blanket platform-admin bypass

`platform_admin` must **explicitly select** an organisation to act within. The selection is
written to every audit entry. There is no `if (isPlatformAdmin) return allData()` shortcut.

---

## 3. Tenant isolation

The single most important control. Defence in depth:

### Layer 1 — Query construction

`organizationId` comes from the **session**, never from the request. It cannot be overridden
by a body field, query parameter or header.

### Layer 2 — Ownership re-verification

Every mutation re-fetches the target with the tenant in the filter:

```ts
const assignment = await DutyAssignment.findOne({
  _id: input.assignmentId,
  organizationId: ctx.organizationId,
});
```

A miss returns 404 — no distinction between "missing" and "someone else's".

### Layer 3 — Type-level enforcement

`OrgQuery<T>` in `src/lib/db/types.ts` requires `organizationId`:

```ts
// A filter without organizationId does not compile.
async function findStation(filter: OrgQuery<Station>) { … }
```

This turns "I forgot the tenant filter" from a review comment into a build error.

### Layer 4 — Route separation

Client-portal reads live under `/api/v1/portal`, where every query also includes
`clientId` from the session. They cannot be reached through a company route by accident.

### Cross-tenant regression tests

Enforced in CI, not just reviewed:

```
Company A admin → GET /guards/<Company B guard id>          → 404
Company A admin → POST /assignments with Company B stationId → 404
Client A        → GET /assignments?clientId=<Client B>       → 200, empty
Guard A         → GET /assignments/<Guard B assignment>       → 404
Supervisor A    → GET /sites/<Site outside assignment>       → 404
```

---

## 4. IDOR

Every `:id` route parameter goes through the same three steps:

1. **Shape** — Zod validates it is a well-formed ObjectId (`400` otherwise).
2. **Ownership** — re-fetch with `organizationId` **and** the caller's scope filter.
3. **Permission** — the action permission is checked (`403` only if the record is genuinely
   visible to them).

Guards, client users and supervisors can never supply an identity in the request body:

| Endpoint | Identity source |
| --- | --- |
| `POST /attendance/:id/checkin` | `ctx.userId → Guard.userId` |
| `POST /attendance/:id/correct` | `ctx.userId` recorded as `recordedBy` |
| `POST /assignments` | `ctx.userId` recorded as `assignedBy` |

---

## 5. Input validation

- One Zod schema per endpoint, in `src/schemas/`, imported by **both** the client form (via
  React Hook Form resolvers) and the server handler.
- `.strict()` on request bodies → unknown keys rejected, so a client cannot smuggle
  `organizationId` or `role` into a payload.
- ObjectId fields are validated as strings and **explicitly converted**
  (`z.string().regex(/^[0-9a-fA-F]{24}$/).transform(v => new Types.ObjectId(v))`).
- Sort keys and filter fields are **allow-listed**. No caller string is interpolated into a
  Mongo sort or a regex.
- Search input is escaped for regex use (`escapeRegExp`) before being turned into a `$regex`,
  so a search for `(` cannot become a catastrophic-backtracking pattern or a query selector.
- Body size is limited; `Content-Type` is verified before parsing.

### NoSQL injection

Mongoose operator objects (`{ $ne: null }`, `{ $gt: "" }`) are the classic vector. Defences:

1. Zod parses bodies into **primitives**, so an operator object never reaches a query.
2. `express.json`-style extended parsing is not used — route handlers read raw `Request.json()`
   under a Zod `.strict()` object schema.
3. No user string is ever spread into a query document.

---

## 6. XSS

- React escapes by default. No `dangerouslySetInnerHTML` anywhere in the product.
- No raw HTML in notifications, notes, client names or guard names — all rendered as text.
- CSP is set in `next.config.ts`:

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval'   # Next.js needs these in dev
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:;
font-src 'self' data:;
connect-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none'
```

`'unsafe-inline'`/`'unsafe-eval'` are required by the Next.js runtime. They are **not** ideal;
a nonce-based CSP is a documented post-MVP hardening item.

- User-supplied URLs (`logoUrl`, `profilePhotoUrl`) are validated as `https:` (or a relative
  path) at the Zod layer, so `javascript:` and `data:` are impossible.
- Notes and free-text fields are length-capped.

---

## 7. CSRF

- SameSite `lax` session cookie.
- Auth.js verifies its own CSRF token on credential callbacks.
- Server Actions use the framework's origin/`Host` comparison.
- State-changing Route Handlers require a non-simple `Content-Type` (`application/json`) or
  an explicit CSRF header; simple cross-origin form posts are rejected.
- No endpoint changes state via `GET`.

---

## 8. Session security

- `httpOnly` — not reachable from JavaScript.
- `sameSite: lax`.
- `secure: true` in production.
- `AUTH_SECRET` ≥ 32 random bytes, from the environment, never committed (`.env*` is gitignored).
- Session payload holds only `{ sub, organizationId, role, clientId, guardId }` — **no**
  personal data, so a leaked token discloses nothing beyond identifiers.
- Deactivating a user bumps a `sessionsValidFrom` timestamp; tokens issued before it are
  rejected on next verification.
- Role changes take effect on the next request — the role is re-read from the database for
  privileged actions, not trusted from the token alone.

---

## 9. Rate limiting

| Scope | Limit |
| --- | --- |
| Login | 5 attempts / 15 min per IP + email |
| Register | 3 / hour per IP |
| Check-in / check-out | 20 / min per user |
| Attendance correction | 30 / hour per user |
| All other writes | 60 / min per user |

Fixed-window counter persisted in MongoDB, keyed by `sha256(identifier)` so emails and IPs are
not stored in plaintext. The 429 response includes `Retry-After`.

**Trade-off documented:** MongoDB-backed counters are not shared across regions. Adequate for
MVP single-region; Redis is the documented upgrade when deploying to multiple regions.

---

## 10. Error handling

| Layer | Behaviour |
| --- | --- |
| `ZodError` | 422, field-level `details`, no stack |
| `AuthError` | 401 / 403, generic message |
| `NotFoundError` | 404, generic message |
| `ConflictError` | 409, with actionable `details` (e.g. the overlapping duty) |
| Unknown | 500, `"An unexpected error occurred"`, **logged with full detail server-side** |

`src/lib/api-response.ts` is the only place a response is shaped. Raw `Error`, Mongoose
`ValidationError`, MongoDB driver errors and stack traces never reach a client.

---

## 11. Audit logging

Audited events:

```
user.created            user.updated            user.deactivated
user.role_changed       user.password_reset
guard.created           guard.updated
client.created          client.updated
site.created            site.updated            site.supervisors_changed
station.created         station.updated
shift.created           shift.updated
assignment.created      assignment.updated      assignment.cancelled
assignment.conflict_blocked
attendance.checked_in   attendance.checked_out
attendance.corrected    attendance.marked_absent
coverage.guard_marked_absent
notification.sent
```

Each entry records `organizationId`, `actorId`, `actorRole`, `action`, `entityType`,
`entityId`, `metadata` (including previous values for corrections), `ipAddress`, `userAgent`
and `timestamp`.

**Audit history is append-only.** The service layer exposes no delete. `organizationId` is a
prefix on every audit index so a tenant can never query another's trail.

---

## 12. Sensitive data minimisation

| Data | Collection | Exposure |
| --- | --- | --- |
| `passwordHash` | Never returned | `select: false` |
| Guard phone, email, employee number, `dateJoined` | Collected | **Stripped** from all client-portal responses |
| Client contact person, address | Collected | Own client record only |
| Duty roster of other clients | Collected | Never cross-tenant readable |
| IP address, user agent | Audit only | Audit-log readers only |

The client-facing serialiser is an explicit **allow-list**, not a deny-list — a new sensitive
field added to `Guard` is excluded from client responses by default, because the projection
must be amended deliberately.

No unnecessary PII is collected: no national ID, no tax number, no home address, no banking
details, no biometrics in MVP.

---

## 13. Headers & transport

Set in `next.config.ts` for every response:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Cross-Origin-Opener-Policy: same-origin
```

TLS enforced in transit and at rest. MongoDB Atlas uses TLS; the connection string enforces
`tls=true`.

---

## 14. Dependency & supply chain

- `npm audit` runs in CI; moderate+ findings fail the build.
- Lockfile is committed (`package-lock.json`).
- No postinstall scripts added without review.
- No external analytics, tag managers or error reporters in MVP — they would be a data-egress
  surface for operational data.
- Secrets only from environment variables; `.env*` is gitignored.

---

## 15. Open items (post-MVP hardening)

Documented honestly rather than silently claimed as done:

| Item | Status |
| --- | --- |
| Nonce-based CSP (no `unsafe-inline`) | Post-MVP |
| Redis-backed rate limiting for multi-region | Post-MVP |
| MFA for company admins | Post-MVP |
| Session revocation list | Post-MVP (currently `sessionsValidFrom`) |
| File upload scanning (logos, guard photos) | Deferred — no uploads in MVP |
| Penetration test | Before commercial launch |

---

## 16. Pre-launch checklist

- [ ] Cross-tenant regression suite green
- [ ] `npm audit` clean (moderate+)
- [ ] `AUTH_SECRET` generated, rotated, stored in Vercel env
- [ ] `MONGODB_URI` with least-privilege DB user; separate read/write users if possible
- [ ] Atlas IP allow-list / Vercel static egress IPs configured
- [ ] CSP, HSTS and the header set verified in production response headers
- [ ] Seed/demo data removed from production database
- [ ] Login rate limit verified under load
- [ ] Client portal verified to expose **no** HR fields
- [ ] Audit log verified to be append-only