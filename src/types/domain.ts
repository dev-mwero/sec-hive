/**
 * Domain types shared by the UI, the dummy data and the server layer.
 *
 * Deliberately plain and serialisable: these are the shapes that cross the server/client
 * boundary, so they must not carry Mongoose `Types.ObjectId` or `Document`. Server documents are
 * projected into these types before they leave a Server Component or a Route Handler.
 *
 * Ids are `string` here even though Mongo stores `ObjectId`, because JSON has no ObjectId and a
 * string id works identically in RSC props, form state and route params.
 */

import type {
  AssignmentStatus,
  AttendanceStatus,
  AuditAction,
  ClientType,
  CoverageStatus,
  EmploymentStatus,
  NotificationType,
  Role,
} from "@/constants/domain";

export type Id = string;

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------

export type Organization = {
  id: Id;
  name: string;
  slug: string;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: "active" | "suspended";
  /** Lateness tolerance in minutes. Company policy — defaults to 5. */
  gracePeriodMinutes: number;
};

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export type User = {
  id: Id;
  organizationId: Id;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  status: "active" | "inactive" | "invited";
  clientId: Id | null;
  lastLoginAt: Date | null;
};

export type Guard = {
  id: Id;
  organizationId: Id;
  userId: Id | null;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  phone: string;
  email: string | null;
  profilePhotoUrl: string | null;
  employmentStatus: EmploymentStatus;
  dateJoined: string;
  /** Derived, not stored. `true` when the guard has an open assignment right now. */
  onDuty?: boolean;
};

/**
 * What a client is allowed to know about a guard.
 *
 * A separate type, not an `Omit<Guard, ...>` union, so adding a new field to `Guard` cannot
 * silently widen client exposure. The projection must be amended deliberately — see
 * docs/security.md section 12.
 */
export type PublicGuard = {
  id: Id;
  firstName: string;
  lastName: string;
  /** Present only where operationally necessary (e.g. a shift handover). */
  organizationName: string | null;
  stationName: string | null;
  statusLabel: string | null;
};

export type GuardFullName = {
  firstName: string;
  middleName: string | null;
  lastName: string;
};

// ---------------------------------------------------------------------------
// Deployment chain
// ---------------------------------------------------------------------------

export type Client = {
  id: Id;
  organizationId: Id;
  name: string;
  clientType: ClientType;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: "active" | "inactive";
};

export type Site = {
  id: Id;
  organizationId: Id;
  clientId: Id;
  name: string;
  code: string | null;
  address: string | null;
  description: string | null;
  supervisorIds: Id[];
  status: "active" | "inactive";
};

export type Station = {
  id: Id;
  organizationId: Id;
  siteId: Id;
  name: string;
  code: string | null;
  description: string | null;
  requiredGuardCount: number;
  status: "active" | "inactive";
};

export type Shift = {
  id: Id;
  organizationId: Id;
  name: string;
  /** Wall-clock time as a Date pinned to 1970-01-01. Read via `timeToMinutes`. */
  startTime: Date;
  endTime: Date;
  crossesMidnight: boolean;
  status: "active" | "inactive";
};

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

export type DutyAssignment = {
  id: Id;
  organizationId: Id;
  guardId: Id;
  clientId: Id;
  siteId: Id;
  stationId: Id;
  shiftId: Id | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  status: AssignmentStatus;
  assignedBy: Id;
  supervisorId: Id | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AttendanceRecord = {
  id: Id;
  organizationId: Id;
  assignmentId: Id;
  guardId: Id;
  clientId: Id;
  siteId: Id;
  stationId: Id;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualCheckIn: Date | null;
  actualCheckOut: Date | null;
  status: AttendanceStatus;
  notes: string | null;
  recordedBy: Id;
};

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

/**
 * One row of the Live Deployment board — the screen that answers
 * "who is guarding what right now".
 *
 * `statusLabel` is produced server-side so display text is consistent across the product and
 * the UI never re-derives semantics from a raw status.
 */
export type DeploymentRow = {
  assignmentId: Id;
  clientId: Id;
  client: string;
  siteId: Id;
  site: string;
  stationId: Id;
  station: string;
  guardId: Id;
  guard: string;
  employeeNumber: string;
  shiftId: Id | null;
  shift: string | null;
  /** `06:00 – 18:00`, already formatted for display. */
  shiftWindow: string | null;
  supervisorId: Id | null;
  supervisor: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualCheckIn: Date | null;
  actualCheckOut: Date | null;
  status: AssignmentStatus;
  statusLabel: string;
  stationRequiredCount: number;
  stationPresentCount: number;
};

export type StationCoverage = {
  stationId: Id;
  station: string;
  siteId: Id;
  site: string;
  clientId: Id;
  client: string;
  required: number;
  assigned: number;
  present: number;
  coverageStatus: CoverageStatus;
  coverageLabel: string;
  guards: {
    id: Id;
    name: string;
    status: AssignmentStatus;
    statusLabel: string;
  }[];
};

export type DashboardSummary = {
  date: string;
  totalGuards: number;
  activeGuards: number;
  clients: number;
  sites: number;
  stations: number;
  todaysAssignments: number;
  onDuty: number;
  late: number;
  absent: number;
  uncoveredStations: number;
  /** ISO timestamp the figures were computed, so the UI can say "updated Ns ago". */
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Audit & notifications
// ---------------------------------------------------------------------------

export type AuditLogEntry = {
  id: Id;
  organizationId: Id;
  actorId: Id | null;
  actorName: string | null;
  actorRole: Role | null;
  action: AuditAction;
  entityType: string;
  entityId: Id | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  timestamp: Date;
};

export type Notification = {
  id: Id;
  recipientId: Id;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export type Paginated<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export type ListFilters = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
};
