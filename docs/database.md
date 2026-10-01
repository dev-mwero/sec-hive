# SecHive — Database Design

MongoDB + Mongoose 9. Every tenant-owned collection has a **required** `organizationId`.

## Conventions

- All ids are MongoDB `ObjectId`, referenced with `Types.ObjectId` + `ref`.
- `timestamps: true` gives `createdAt` / `updatedAt` on every collection.
- Enums are stored as **strings** with `enum` validation. Never `Number` — readable in Atlas,
  readable in the audit log, and reordering an enum can't corrupt data.
- Lists are Mongoose `DocumentArray` (`[{ _id: false, ... }]`) **only** for bounded,
  truly-owned child data (e.g. supervisor site access). Otherwise a real collection + index.
- Soft delete is not used. Operational history must be accurate; records are cancelled or
  deactivated, never removed.

---

## Entity relationship

```
Organization ─┬─< User ──< Guard (via userId, optional)
              ├─< Shift
              ├─< AuditLog
              ├─< Notification
              ├─< DutyAssignment >── AttendanceRecord (1:1)
              └─< Client ──< Site ──< Station
                                     ↑
                              DutyAssignment.stationId
```

`DutyAssignment` carries **denormalised** `clientId` and `siteId` in addition to `stationId`.
Rationale: the Live Deployment query must group by client and site. Walking
`stationId → siteId → clientId` per row costs two extra lookups and breaks if a station is
later moved. The redundant ids are write-time-copied and enforced by a service-level
invariant (an assignment's `siteId` must equal its station's `siteId`).

---

## Models

### Organization

```ts
{
  name:      string   // "SecureGuard Kenya Ltd"   required
  slug:      string   // "secureguard-ke"          required, unique
  logoUrl:   string?
  phone:     string?
  email:     string?  unique (sparse)
  address:   string?
  status:    'active' | 'suspended'
  gracePeriodMinutes: number  default 5   // lateness tolerance, per company
  createdAt, updatedAt
}
```

> `gracePeriodMinutes` is per-organisation because lateness tolerance is a company policy —
> 5 minutes for some, 15 for others. Default 5. `0` means strictly on time.

**Indexes:** `{ slug: 1 }` unique; `{ email: 1 }` unique sparse.

---

### User

Authentication + authorisation subject. One record per login.

```ts
{
  organizationId: ObjectId   // required
  email:          string     // required, unique
  passwordHash:   string     // bcrypt cost 12, never selected by default
  firstName:      string
  lastName:       string
  phone:          string?
  role:           Role
  status:         'active' | 'inactive' | 'invited'
  clientId:       ObjectId?  // required when role is CLIENT_ADMIN / CLIENT_VIEWER
  lastLoginAt:    Date?
  createdAt, updatedAt
}
```

**Indexes:** `{ email: 1 }` unique; `{ organizationId: 1, role: 1 }`;
`{ organizationId: 1, clientId: 1 }`.

> A client user belongs to the security company's organisation (so it is tenant-isolated with
> the rest) **and** is scoped to one `clientId`. This is what lets a single RBAC matrix serve
> both the company and the client portal — one auth system, two scope checks.

---

### Guard

A person employed by the security company. May or may not have a login.

```ts
{
  organizationId: ObjectId   // required
  userId:         ObjectId?  // ref User — present when the guard can log in
  employeeNumber: string     // required
  firstName, middleName?, lastName
  phone:          string
  email:          string?
  profilePhotoUrl: string?
  employmentStatus: 'active' | 'suspended' | 'terminated'
  dateJoined:     Date
  createdAt, updatedAt
}
```

**Indexes:** `{ organizationId: 1, employeeNumber: 1 }` unique;
`{ organizationId: 1, lastName: 1, firstName: 1 }` for name-sorted lists;
text index on `{ firstName, middleName, lastName, employeeNumber }`.

> `employeeNumber`, `phone`, `email` and `dateJoined` are **internal HR data**. The
> client-facing serialiser (§Privacy projection) omits all of them.

---

### Client

A customer of the security company.

```ts
{
  organizationId: ObjectId   // required
  name:           string     // required
  clientType:     'residential' | 'commercial' | 'school' | 'hospital'
                | 'factory' | 'warehouse' | 'apartment' | 'hotel'
                | 'construction' | 'other'
  contactPerson:  string?
  phone:          string?
  email:          string?
  address:        string?
  status:         'active' | 'inactive'
  createdAt, updatedAt
}
```

**Indexes:** `{ organizationId: 1, status: 1 }`; `{ organizationId: 1, name: 1 }`;
text index on `name` for search.

---

### Site

A physical location belonging to one client.

```ts
{
  organizationId: ObjectId   // required
  clientId:       ObjectId   // required, ref Client
  name:           string     // required
  code:           string?    // short ops code, e.g. "HQ"
  address:        string?
  description:    string?
  supervisorIds:  [{ _id: false, userId: ObjectId }]   // scope for SUPERVISOR / SITE_MANAGER
  status:         'active' | 'inactive'
  createdAt, updatedAt
}
```

**Indexes:** `{ organizationId: 1, clientId: 1 }`; `{ organizationId: 1, status: 1 }`;
`{ "supervisorIds.userId": 1 }`; text index on `name`.

> Supervisor scope lives on the Site, not on a join collection. MVP has exactly one
> supervisor role; a `SupervisorSite` collection only becomes necessary when supervisor
> hierarchies or per-role site grants arrive.

---

### Station

A security post at a site. `requiredGuardCount` drives coverage monitoring.

```ts
{
  organizationId:   ObjectId   // required
  siteId:           ObjectId   // required, ref Site
  name:             string     // required
  code:             string?
  description:      string?
  requiredGuardCount: number   // required, >= 0
  status:           'active' | 'inactive'
  createdAt, updatedAt
}
```

**Indexes:** `{ organizationId: 1, siteId: 1 }`; `{ organizationId: 1, siteId: 1, name: 1 }`;
text index on `name`.

> No `lat` / `lng` / `radiusM`. Geofencing is Phase 2. The station is a *place*, and the
> assignment is a *time*; adding coordinates later to this same document needs no migration.

---

### Shift

A reusable time template.

```ts
{
  organizationId: ObjectId   // required
  name:           string     // "Day Shift"
  startTime:      Date       // time-of-day, stored as a Date, read via getHours/Minutes
  endTime:        Date       // same
  crossesMidnight: boolean   // derived, persisted for indexing
  status:         'active' | 'inactive'
  createdAt, updatedAt
}
```

**Indexes:** `{ organizationId: 1, status: 1 }`; `{ organizationId: 1, name: 1 }`.

#### Why a `Date` for a time-of-day

A "time of day" is not a timestamp — storing `"06:00"` as a string invites string comparison
bugs; storing a full `Date` brings a meaningless year/month/day that people will misread.

SecHive stores the wall-clock time as a `Date` pinned to a fixed reference day
(**1970-01-01**). All reads go through helpers that take only hours/minutes:

```ts
timeToMinutes(date)   // -> 360 for 06:00
minutesToTime(360)    // -> Date at 1970-01-01T06:00Z
```

This gives correct numeric arithmetic, correct sorting, correct `lt`/`gt` range queries, and
no string parsing — while never exposing 1970 to the UI (formatters take `HH:mm` directly).

#### Day and night shifts

A shift is *whatever the company defines*. The reference implementation seeds **Day Shift**
06:00–18:00 and **Night Shift** 18:00–06:00, but nothing in the model assumes it: 06:00–14:00,
22:00–02:00 and 08:00–16:00 are equally valid. Overnight shifts set `crossesMidnight: true`
and their materialised `scheduledEnd` lands on the **next calendar day**.

---

### DutyAssignment

**The central entity.** The record of truth for who is scheduled where and when.

```ts
{
  organizationId: ObjectId   // required
  guardId:         ObjectId   // required, ref Guard
  clientId:        ObjectId   // required, denormalised from station
  siteId:          ObjectId   // required, denormalised from station
  stationId:       ObjectId   // required, ref Station
  shiftId:         ObjectId?  // ref Shift — template reference only
  scheduledStart:  Date       // required, materialised from the shift
  scheduledEnd:    Date       // required, materialised from the shift
  actualStart:     Date?      // set on check-in
  actualEnd:       Date?      // set on check-out
  status:          AssignmentStatus
  assignedBy:      ObjectId   // ref User
  supervisorId:    ObjectId?  // ref User
  notes:           string?
  createdAt, updatedAt
}
```

**Indexes** (each matches a real screen):

| Index | Serves |
| --- | --- |
| `{ organizationId: 1, scheduledStart: 1, scheduledEnd: 1 }` | Live Deployment by date window; daily deployment report |
| `{ organizationId: 1, guardId: 1, scheduledStart: -1 }` | Guard's duty list; **conflict detection** |
| `{ organizationId: 1, siteId: 1, scheduledStart: 1 }` | Supervisor site view; coverage report |
| `{ organizationId: 1, status: 1, scheduledStart: 1 }` | "Late / Absent / Uncovered" filters and counters |
| `{ organizationId: 1, clientId: 1, scheduledStart: 1 }` | Client portal (adds the `clientId` scope check) |
| `{ organizationId: 1, stationId: 1, scheduledStart: 1 }` | Per-station coverage rollup |

> `scheduledStart`/`scheduledEnd` are **materialised copies**. Editing a Shift template never
> rewrites history — §Historical integrity.

#### AssignmentStatus

```
scheduled | on_duty | late | absent | checked_out | completed | cancelled
```

| Status | Meaning | Set by |
| --- | --- | --- |
| `scheduled` | Booked, guard not yet arrived | On create |
| `on_duty` | Checked in and inside the shift window | Check-in |
| `late` | Checked in, but after `scheduledStart + gracePeriodMinutes` | Check-in |
| `checked_out` | Checked out, before `scheduledEnd + grace` | Check-out |
| `completed` | Checked out at or after `scheduledEnd + grace` | Check-out |
| `absent` | Never checked in, shift start passed | Absent sweep / manual |
| `cancelled` | Assignment withdrawn | Admin/supervisor |

`cancelled` assignments are excluded from conflict detection and coverage rollups. All other
terminal states remain visible — a cancelled duty is information, not noise.

---

### AttendanceRecord

Proof of presence for exactly one assignment. Created lazily on check-in.

```ts
{
  organizationId:   ObjectId   // required
  assignmentId:     ObjectId   // required, unique — one per assignment
  guardId:          ObjectId   // required
  clientId:         ObjectId   // required (denormalised — client portal reads attendance)
  siteId:           ObjectId   // required
  stationId:        ObjectId   // required
  scheduledStart:   Date       // copy from the assignment
  scheduledEnd:     Date       // copy from the assignment
  actualCheckIn:    Date?      // null = not yet checked in
  actualCheckOut:   Date?      // null = still on duty
  status:           'present' | 'late' | 'absent' | 'checked_out' | 'early_departure'
  notes:            string?
  recordedBy:       ObjectId   // ref User — the guard, or the correcting supervisor/admin
  createdAt, updatedAt
}
```

**Indexes:** `{ assignmentId: 1 }` unique; `{ organizationId: 1, guardId: 1, scheduledStart: -1 }`
(guard history, attendance report); `{ organizationId: 1, siteId: 1, scheduledStart: 1 }`;
`{ organizationId: 1, status: 1, scheduledStart: 1 }`.

#### Late detection

```
lateIf actualCheckIn > scheduledStart + organization.gracePeriodMinutes
```

Default grace **5 minutes**, configurable per company (a company may set 15). Evaluated once,
at check-in, and the result is stored — the UI never recomputes it, so history cannot shift
when a company's policy is later edited.

#### Corrections

A supervisor or admin may correct `actualCheckIn` / `actualCheckOut`. The write goes through
`server/services/attendance.ts`, which:

1. snapshots the previous values into `audit.metadata.previous`,
2. records `recordedBy` as the correcting user (not the guard),
3. writes an `attendance.corrected` AuditLog entry.

The record itself is never deleted. See [security.md](./security.md#audit).

---

### AuditLog

Append-only. There is no delete path in the service layer.

```ts
{
  organizationId: ObjectId   // required
  actorId:        ObjectId?  // null for system actions (e.g. absent sweep)
  actorRole:      Role?
  action:         string     // "guard.checked_in"
  entityType:     string     // "DutyAssignment"
  entityId:       ObjectId?
  metadata:       Mixed      // diffs, reason, previous values
  ipAddress:      string?
  userAgent:      string?
  timestamp:      Date
  createdAt
}
```

**Indexes:** `{ organizationId: 1, timestamp: -1 }` (audit log screen);
`{ organizationId: 1, entityType: 1, entityId: 1, timestamp: -1 }` (per-record history);
`{ organizationId: 1, actorId: 1, timestamp: -1 }` (who did what).

---

### Notification

In-app only for MVP.

```ts
{
  organizationId: ObjectId   // required
  recipientId:    ObjectId   // required, ref User
  type:           'assignment.created' | 'assignment.changed' | 'assignment.upcoming'
                | 'attendance.late' | 'attendance.absent' | 'station.uncovered'
                | 'attendance.corrected'
  title:          string
  body:           string
  data:           Mixed      // { assignmentId?, siteId?, stationId? }
  readAt:         Date?
  createdAt
}
```

**Indexes:** `{ recipientId: 1, readAt: 1, createdAt: -1 }` (bell menu);
`{ organizationId: 1, recipientId: 1, createdAt: -1 }`.

> The envelope (`type`, `recipientId`, `data`) is already channel-agnostic. Email / SMS /
> WhatsApp is a Phase 2 addition of a delivery worker, not a schema change.

---

## Historical integrity

**Invariant: editing a Shift never rewrites a DutyAssignment.**

`scheduledStart` / `scheduledEnd` / `clientId` / `siteId` are copied onto the assignment at
creation. Later edits to a Shift affect only *future* assignments created from it. An
assignment that was corrected keeps its correction visible via AuditLog rather than being
overwritten silently.

Guard history therefore reads correctly:

```
John Mwangi
  Jan 1–15   ABC Headquarters · Main Gate
  Jan 16–30  ABC Headquarters · Rear Gate
```

Both rows survive, each with its own attendance.

---

## Privacy projection

Client-facing responses never pass raw documents to the UI. `server/queries/portal.ts` maps
through an explicit allow-list:

| Field | Company users | Client users |
| --- | --- | --- |
| Guard first/last name | ✅ | ✅ |
| Station, shift times, status | ✅ | ✅ |
| `employeeNumber` | ✅ | ❌ |
| Guard `phone` / `email` | ✅ | ❌ |
| `dateJoined`, `employmentStatus` | ✅ | ❌ |
| Client contact person / billing fields | ✅ | own record only |

A guard therefore renders for a client as:

```
John Mwangi
Guard · SecureGuard Kenya
Main Gate
ON DUTY
```

and nothing more.

---

## Environment

```bash
MONGODB_URI=mongodb+srv://...        # Atlas, Vercel-friendly
AUTH_SECRET=<32+ byte random string> # Auth.js JWT signing
AUTH_TRUST_HOST=true                  # required behind Vercel's proxy
AUTH_URL=https://sechive.vercel.app   # production only; omit locally
```

`MONGODB_URI` is validated at connection time in `src/lib/db/connect.ts` and the process fails
loudly with an actionable message rather than surfacing a stack trace to a user.