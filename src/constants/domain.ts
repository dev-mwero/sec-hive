/**
 * Domain constants.
 *
 * Every status in SecHive is a string enum, never a number: values must stay readable in the
 * Atlas UI, in an audit log entry and in a CSV export, and reordering a numeric enum must never
 * be able to silently reinterpret historical rows.
 *
 * Each status carries a `*_LABEL` constant here because status must always be communicated as
 * text (WCAG 1.4.1 — never colour alone). Labels are defined once, server-side, so the API
 * sends display text and the UI never re-derives it.
 */

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const ROLES = [
  "platform_admin",
  "security_company_admin",
  "supervisor",
  "guard",
  "site_manager",
  "client_admin",
  "client_viewer",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  platform_admin: "Platform Admin",
  security_company_admin: "Company Admin",
  supervisor: "Supervisor",
  guard: "Guard",
  site_manager: "Site Manager",
  client_admin: "Client Admin",
  client_viewer: "Client Viewer",
};

/** Roles that belong to a client account and are scoped to `User.clientId`. */
export const CLIENT_ROLES: readonly Role[] = ["client_admin", "client_viewer"];

/** Roles scoped to an explicit list of sites (`Site.supervisorIds`). */
export const SITE_SCOPED_ROLES: readonly Role[] = [
  "supervisor",
  "site_manager",
];

/** Roles scoped to their own records only. */
export const SELF_SCOPED_ROLES: readonly Role[] = ["guard"];

// ---------------------------------------------------------------------------
// Record status
// ---------------------------------------------------------------------------

export const USER_STATUSES = ["active", "inactive", "invited"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ORG_STATUSES = ["active", "suspended"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const EMPLOYMENT_STATUSES = [
  "active",
  "suspended",
  "terminated",
] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const RESOURCE_STATUSES = ["active", "inactive"] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const CLIENT_STATUSES = ["active", "inactive"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

// ---------------------------------------------------------------------------
// Client types
// ---------------------------------------------------------------------------

export const CLIENT_TYPES = [
  "residential",
  "commercial",
  "school",
  "hospital",
  "factory",
  "warehouse",
  "apartment",
  "hotel",
  "construction",
  "other",
] as const;

export type ClientType = (typeof CLIENT_TYPES)[number];

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  residential: "Residential",
  commercial: "Commercial",
  school: "School",
  hospital: "Hospital",
  factory: "Factory",
  warehouse: "Warehouse",
  apartment: "Apartment",
  hotel: "Hotel",
  construction: "Construction",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Duty assignment status — the state machine that drives every operational screen
// ---------------------------------------------------------------------------

export const ASSIGNMENT_STATUSES = [
  "scheduled",
  "on_duty",
  "late",
  "absent",
  "checked_out",
  "completed",
  "cancelled",
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  scheduled: "SCHEDULED",
  on_duty: "ON DUTY",
  late: "LATE",
  absent: "ABSENT",
  checked_out: "CHECKED OUT",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};

/** Assignments that still hold a guard to a station for coverage purposes. */
export const COVERING_STATUSES: readonly AssignmentStatus[] = [
  "scheduled",
  "on_duty",
  "late",
  "absent",
  "checked_out",
  "completed",
];

/** Excluded from overlap detection — a cancelled duty is information, not a booking. */
export const NON_BOOKING_STATUSES: readonly AssignmentStatus[] = ["cancelled"];

export const OPEN_STATUSES: readonly AssignmentStatus[] = [
  "scheduled",
  "on_duty",
  "late",
];

/** Statuses that mean "physically at the post right now". */
export const PRESENT_STATUSES: readonly AssignmentStatus[] = [
  "on_duty",
  "late",
  "checked_out",
];

// ---------------------------------------------------------------------------
// Attendance status
// ---------------------------------------------------------------------------

export const ATTENDANCE_STATUSES = [
  "present",
  "late",
  "absent",
  "checked_out",
  "early_departure",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "PRESENT",
  late: "LATE",
  absent: "ABSENT",
  checked_out: "CHECKED OUT",
  early_departure: "EARLY DEPARTURE",
};

// ---------------------------------------------------------------------------
// Coverage status
// ---------------------------------------------------------------------------

export const COVERAGE_STATUSES = [
  "covered",
  "partially_covered",
  "uncovered",
] as const;

export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

export const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = {
  covered: "COVERED",
  partially_covered: "PARTIALLY COVERED",
  uncovered: "UNCOVERED",
};

// ---------------------------------------------------------------------------
// Audit actions
// ---------------------------------------------------------------------------

export const AUDIT_ACTIONS = [
  "user.created",
  "user.updated",
  "user.deactivated",
  "user.role_changed",
  "user.password_reset",
  "guard.created",
  "guard.updated",
  "client.created",
  "client.updated",
  "site.created",
  "site.updated",
  "site.supervisors_changed",
  "station.created",
  "station.updated",
  "shift.created",
  "shift.updated",
  "assignment.created",
  "assignment.updated",
  "assignment.cancelled",
  "assignment.conflict_blocked",
  "attendance.checked_in",
  "attendance.checked_out",
  "attendance.corrected",
  "attendance.marked_absent",
  "notification.sent",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  "user.created": "User created",
  "user.updated": "User updated",
  "user.deactivated": "User deactivated",
  "user.role_changed": "Permissions changed",
  "user.password_reset": "Password reset",
  "guard.created": "Guard created",
  "guard.updated": "Guard updated",
  "client.created": "Client created",
  "client.updated": "Client updated",
  "site.created": "Site created",
  "site.updated": "Site updated",
  "site.supervisors_changed": "Site supervisors changed",
  "station.created": "Station created",
  "station.updated": "Station updated",
  "shift.created": "Shift created",
  "shift.updated": "Shift updated",
  "assignment.created": "Assignment created",
  "assignment.updated": "Assignment updated",
  "assignment.cancelled": "Assignment cancelled",
  "assignment.conflict_blocked": "Conflicting assignment blocked",
  "attendance.checked_in": "Guard checked in",
  "attendance.checked_out": "Guard checked out",
  "attendance.corrected": "Attendance modified",
  "attendance.marked_absent": "Guard marked absent",
  "notification.sent": "Notification sent",
};

// ---------------------------------------------------------------------------
// Notification types — envelope is channel-agnostic so email/SMS is a Phase 2 delivery change
// ---------------------------------------------------------------------------

export const NOTIFICATION_TYPES = [
  "assignment.created",
  "assignment.changed",
  "assignment.upcoming",
  "attendance.late",
  "attendance.absent",
  "station.uncovered",
  "attendance.corrected",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  "assignment.created": "New duty assignment",
  "assignment.changed": "Assignment changed",
  "assignment.upcoming": "Upcoming shift",
  "attendance.late": "Guard reported late",
  "attendance.absent": "Guard absent",
  "station.uncovered": "Station uncovered",
  "attendance.corrected": "Attendance corrected",
};

// ---------------------------------------------------------------------------
// Policy defaults
// ---------------------------------------------------------------------------

/**
 * Lateness tolerance in minutes. Per-organisation, because tolerance is company policy —
 * some firms allow 5, some 15, some none. Stored on `Organization.gracePeriodMinutes`.
 */
export const DEFAULT_GRACE_PERIOD_MINUTES = 5;

export const MIN_PASSWORD_LENGTH = 12;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Live Deployment refresh cadence. Honest about being a poll — see docs/api.md. */
export const DEPLOYMENT_POLL_INTERVAL_MS = 30_000;
export const DASHBOARD_POLL_INTERVAL_MS = 60_000;
