# SecHive — API Design

Base path: **`/api/v1`**

All routes are Next.js **Route Handlers** (`app/api/v1/**/route.ts`).

## Conventions

### Response envelope

Success:

```json
{ "success": true, "data": {}, "message": "Operation successful" }
```

Error:

```json
{
  "success": false,
  "error": { "code": "FORBIDDEN", "message": "You do not have permission to perform this action", "details": [] },
  "message": "Request failed"
}
```

`details` is present only for validation failures, as a list of `{ path, message }`.

**Internal errors never leak.** A thrown `Error` becomes
`{ code: "INTERNAL_ERROR", message: "An unexpected error occurred" }`. Stack traces,
MongoDB driver messages and Mongoose validation output are logged server-side only —
`src/server/log.ts` — never returned.

### Status codes

| Code | Meaning |
| :-: | --- |
| 200 | Read / update success |
| 201 | Resource created |
| 400 | Malformed request, invalid ObjectId |
| 401 | Not authenticated |
| 403 | Authenticated but not permitted (record visible to them) |
| 404 | Not found **or** outside tenant scope |
| 409 | Conflict (duplicate email, overlapping assignment) |
| 422 | Zod validation failed |
| 429 | Rate limit exceeded |
| 500 | Unexpected — logged, never detailed |

### Pagination

List endpoints accept `?page` (1-based) and `?limit` (default 25, max 100) and return:

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 25, "total": 118, "totalPages": 5 }
}
```

### Sorting

`?sort=createdAt` / `?order=asc|desc`. Sort keys are allow-listed per endpoint — a
caller-supplied sort key is never interpolated into a Mongo sort object.

### Cross-tenant rules

- `organizationId` is **never** accepted as a request parameter. It is derived from the session.
- Client users' `clientId` comes from their user record.
- `:id` params are validated as ObjectId, then re-fetched with `organizationId` in the filter.
  No match → 404.
- Sorting/filtering on foreign keys is validated to belong to the caller's scope **before** use.

---

## Auth

Auth.js owns `/api/auth/*`. SecHive's own auth endpoints are thin wrappers where needed.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Create organisation + first `security_company_admin` |
| `POST` | `/api/v1/auth/login` | Credentials sign-in (delegates to Auth.js callback) |
| `POST` | `/api/v1/auth/logout` | End session |
| `GET` | `/api/v1/auth/session` | Current session projection |

> **Next 16 constraint.** Auth.js's `signIn` **server action** is broken on Next.js 16
> (synthesised request URL + missing `x-forwarded-proto` → protocol mismatch; upstream
> `nextauthjs/next-auth#13387`). SecHive therefore authenticates through the **HTTP handler
> path** (`/api/auth/callback/credentials`) via a client-side `signIn()`. Server Actions must
> not call `signIn`.

### Session shape

```ts
{
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
    organizationId: string;
    organizationName: string;
    clientId?: string;          // client roles only
    clientName?: string;
    guardId?: string;           // guard role only
  };
  expiresAt: string;
}
```

### Register

```http
POST /api/v1/auth/register
{
  "organizationName": "SecureGuard Kenya Ltd",
  "adminFirstName": "Amina",
  "adminLastName": "Otieno",
  "adminEmail": "amina@secureguard.co.ke",
  "adminPassword": "<min 12 chars>",
  "organizationPhone": "+254700000000",
  "organizationAddress": "Kenyatta Avenue, Nairobi"
}
```

Creates the `Organization` and the first `security_company_admin` in one transaction. Slug is
derived from the organisation name and de-duplicated with a numeric suffix.

---

## Resources

### `/api/v1/users`

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/users` | `users:read` |
| `POST` | `/users` | `users:create` |
| `GET` | `/users/:id` | `users:read` |
| `PATCH` | `/users/:id` | `users:update` |
| `POST` | `/users/:id/deactivate` | `users:deactivate` |

Query: `?role=&status=&clientId=&siteId=&search=&page=&limit=&sort=&order=`

### `/api/v1/guards`

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/guards` | `guards:read` |
| `POST` | `/guards` | `guards:create` |
| `GET` | `/guards/:id` | `guards:read` |
| `PATCH` | `/guards/:id` | `guards:update` |
| `GET` | `/guards/:id/assignments` | `assignments:read` |
| `GET` | `/guards/:id/attendance` | `attendance:read` |

Query: `?search=&employmentStatus=&siteId=&onDuty=true&page=&limit=`

`GET /guards/:id` returns the **full** company projection. The client portal uses
`/api/v1/portal/guards` (§Client portal), which returns the stripped projection.

### `/api/v1/clients`, `/sites`, `/stations`, `/shifts`

Standard CRUD. Additional reads:

| Path | Description |
| --- | --- |
| `GET /sites?clientId=` | Sites for a client |
| `GET /stations?siteId=` | Stations for a site |
| `GET /sites/:id/coverage` | Per-station coverage rollup |
| `GET /clients/:id/sites` | Nested navigation |

Mutating a `station`'s `requiredGuardCount` affects future coverage calculations only —
historical assignments and attendance are untouched.

### `/api/v1/assignments`

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/assignments` | `assignments:read` |
| `POST` | `/assignments` | `assignments:create` |
| `GET` | `/assignments/:id` | `assignments:read` |
| `PATCH` | `/assignments/:id` | `assignments:update` |
| `POST` | `/assignments/:id/cancel` | `assignments:cancel` |
| `POST` | `/assignments/conflicts` | `assignments:create` — dry-run overlap check |

Query: `?date=&from=&to=&guardId=&siteId=&stationId=&clientId=&shiftId=&supervisorId=&status=`

#### Creating an assignment

```http
POST /api/v1/assignments
{
  "guardId": "6…",
  "stationId": "9…",
  "shiftId": "4…",
  "date": "2026-10-05",
  "notes": "Relief for Kamau"
}
```

The service resolves `stationId → siteId → clientId`, materialises `scheduledStart` /
`scheduledEnd` from the shift, applies `crossesMidnight`, then runs conflict detection.

Response 201:

```json
{
  "success": true,
  "data": { "id": "…", "guardId": "…", "client": {…}, "site": {…}, "station": {…},
            "shift": {…}, "scheduledStart": "2026-10-05T06:00:00.000Z",
            "scheduledEnd": "2026-10-05T18:00:00.000Z", "status": "scheduled" },
  "message": "Duty assignment created"
}
```

#### Conflict detection — `409`

Two assignments conflict when they are for the same `guardId`, neither is `cancelled`, and
their time windows overlap (`aStart < bEnd && bStart < aEnd`).

```json
{
  "success": false,
  "error": {
    "code": "ASSIGNMENT_CONFLICT",
    "message": "Guard already has an overlapping duty assignment",
    "details": [
      {
        "path": "guardId",
        "message": "Overlaps ABC Headquarters · Main Gate · 06:00–18:00 (2026-10-05)"
      }
    ]
  },
  "message": "Request failed"
}
```

Conflicts are **blocked, never warned about**. A silently double-booked guard is worse than a
failed form submission.

`POST /assignments/conflicts` with the same body returns `200` and a conflict list without
creating anything, so the UI can show the warning live.

### `/api/v1/attendance`

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/attendance` | `attendance:read` |
| `GET` | `/attendance/:id` | `attendance:read` |
| `POST` | `/attendance/:id/checkin` | `attendance:checkin` |
| `POST` | `/attendance/:id/checkout` | `attendance:checkout` |
| `POST` | `/attendance/:id/correct` | `attendance:correct` |
| `POST` | `/attendance/:id/mark-absent` | `attendance:mark_absent` |

**The guard is derived from the session, never the request body.** A guard cannot record
attendance for anyone else, and cannot check in to a cancelled assignment.

- Duplicate check-in → `409 ALREADY_CHECKED_IN`.
- Check-out without check-in → `409 NOT_CHECKED_IN`.
- Check-in after `scheduledEnd + grace` → `409 ASSIGNMENT_ENDED`.

```http
POST /api/v1/attendance/:id/checkin
{ "notes": "Reported at post; handover pending" }
```

```json
{
  "success": true,
  "data": {
    "id": "…", "status": "late",
    "scheduledStart": "2026-10-05T06:00:00.000Z",
    "actualCheckIn": "2026-10-05T06:11:00.000Z",
    "lateByMinutes": 11, "gracePeriodMinutes": 5
  },
  "message": "Checked in"
}
```

Corrections require `notes` (a reason) and produce an `attendance.corrected` audit entry
carrying the previous values.

### `/api/v1/dashboard`

Aggregate reads for the operational screens. Composed, not stored.

| Path | Returns |
| --- | --- |
| `GET /dashboard/summary?date=` | `totalGuards`, `activeGuards`, `clients`, `sites`, `stations`, `todaysAssignments`, `onDuty`, `late`, `absent`, `uncoveredStations` |
| `GET /dashboard/deployment?date=&clientId=&siteId=&stationId=&guardId=&shiftId=&supervisorId=&status=&search=` | Live Deployment rows |
| `GET /dashboard/coverage?date=&siteId=` | Per-station `required`, `assigned`, `present`, `coverageStatus` |

```json
{
  "data": [
    { "assignmentId": "…", "client": "ABC Manufacturing", "site": "ABC Headquarters",
      "station": "Main Gate", "guard": "John Mwangi", "employeeNumber": "SG-014",
      "shift": "Day Shift", "shiftWindow": "06:00–18:00",
      "scheduledStart": "…", "scheduledEnd": "…", "actualCheckIn": "…", "actualCheckOut": null,
      "status": "on_duty", "statusLabel": "ON DUTY" }
  ]
}
```

`statusLabel` is sent by the server so the UI never re-derives display text and status
semantics stay consistent across the product.

```json
{ "station": "Rear Gate", "required": 1, "assigned": 1, "present": 0,
  "coverageStatus": "uncovered", "coverageLabel": "UNCOVERED" }
```

### `/api/v1/notifications`

| Method | Path |
| --- | --- |
| `GET` | `/notifications?unread=true&page=&limit=` |
| `POST` | `/notifications/:id/read` |
| `POST` | `/notifications/read-all` |
| `GET` | `/notifications/unread-count` |

### `/api/v1/audit-logs`

`GET` only. `security_company_admin` reads the tenant's logs;
`supervisor` reads entries for their assigned sites.

Query: `?action=&entityType=&entityId=&actorId=&from=&to=&search=&page=&limit=`

### `/api/v1/reports`

| Path | Description |
| --- | --- |
| `GET /reports/deployment?date=` | Date, client, site, station, guard, shift, status |
| `GET /reports/attendance?from=&to=&guardId=&siteId=&status=` | Guard, scheduled, actual in/out, status |
| `GET /reports/coverage?date=` | Site, station, required, assigned, present, coverage status |
| `GET /reports/:report/export?format=csv` | CSV export |

CSV output sets `Content-Type: text/csv` with a `Content-Disposition` filename. Fields are
escaped (RFC 4180): values starting with `=`, `+`, `-`, `@`, tab or CR are prefixed with a
single quote to prevent **CSV formula injection**.

### `/api/v1/portal`

Client-portal reads. Separate namespace so client projections can never be served by an
accident, and every query includes `clientId` from the session.

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/portal/overview` | Provider, sites, coverage summary |
| `GET` | `/portal/sites` | Their sites |
| `GET` | `/portal/sites/:id/stations` | Stations + current guard + status |
| `GET` | `/portal/guards` | **Stripped** guard projection |
| `GET` | `/portal/duty-history` | Their attendance history |

---

## Security middleware

| Concern | Implementation |
| --- | --- |
| Authentication | Auth.js session, verified server-side on every route |
| Authorisation | `requirePermission(permission)` → `{ organizationId, scope }` |
| Tenant isolation | `organizationId` in every query; service layer requires it |
| Input validation | Zod schema per endpoint; unknown keys stripped |
| NoSQL injection | Zod coerces ids to string → ObjectId; no raw object passthrough |
| Rate limiting | Login/register 5 / 15 min per IP+email; check-in/out 20 / min per user |
| Security headers | `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` |
| Audit | Every mutation writes an AuditLog entry |
| Error leakage | Unknown errors → generic message; details logged only |

### Rate limiting

A fixed-window counter in a Mongoose-backed collection, keyed by
`sha256(identifier)`. Chosen over an external store to keep MVP deployment-free, and
upgraded to Redis if the deployment needs it. Keyed by **hashed** identifier so emails and IPs
are not stored in plaintext.

---

## Route → Permission map

| Route group | Required permission |
| --- | --- |
| `/api/v1/users` | `users:*` |
| `/api/v1/guards` | `guards:*` |
| `/api/v1/clients` | `clients:*` |
| `/api/v1/sites` | `sites:*` |
| `/api/v1/stations` | `stations:*` |
| `/api/v1/shifts` | `shifts:*` |
| `/api/v1/assignments` | `assignments:*` |
| `/api/v1/attendance` | `attendance:*` |
| `/api/v1/dashboard` | `deployment:read` |
| `/api/v1/reports` | `reports:*` |
| `/api/v1/notifications` | `notifications:read` |
| `/api/v1/audit-logs` | `audit:read` |
| `/api/v1/portal` | `deployment:read` (client-scoped) |

No endpoint is unauthenticated except `POST /auth/register`, `POST /auth/login` and the
Auth.js handlers themselves.