/**
 * RBAC matrix.
 *
 * Permissions are `resource:action` **capabilities**, not job titles. Roles are named bundles.
 * This separation is what lets the product grow finer-grained roles later without redesigning
 * the authorisation layer: a new role is a new row here, a new capability is a new string plus
 * a matrix entry. No `if (role === ...)` branching is introduced anywhere else in the codebase.
 *
 * See docs/rbac.md.
 */

import {
  CLIENT_ROLES,
  type Role,
  SELF_SCOPED_ROLES,
  SITE_SCOPED_ROLES,
} from "@/constants/domain";

export const PERMISSIONS = [
  "users:read",
  "users:create",
  "users:update",
  "users:deactivate",
  "guards:read",
  /**
   * Name-only guard projection: name, employee number and current assignment status at the
   * caller's own sites. Deliberately separate from `guards:read` so a client can see *who is
   * guarding my building* without ever reaching employment records, phone numbers, national ID or
   * documents. A client has no operational reason to hold `guards:read`, and granting it would
   * mean over-exposing personal data to make a UI convenience cheaper.
   */
  "guards:read_public",
  "guards:create",
  "guards:update",
  "clients:read",
  "clients:create",
  "clients:update",
  "sites:read",
  "sites:create",
  "sites:update",
  "stations:read",
  "stations:create",
  "stations:update",
  "shifts:read",
  "shifts:create",
  "shifts:update",
  "assignments:read",
  "assignments:create",
  "assignments:update",
  "assignments:cancel",
  "attendance:read",
  "attendance:checkin",
  "attendance:checkout",
  "attendance:correct",
  "attendance:mark_absent",
  "coverage:read",
  "deployment:read",
  "reports:read",
  "reports:export",
  "notifications:read",
  "audit:read",
  "audit:read_site",
  "settings:read",
  "settings:update",
  "organizations:read",
  "organizations:create",
  "organizations:update",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Sentinel for "this role is restricted to a subset of sites" (`supervisorIds` on `Site`).
 * Kept in the permission set so a scoped role can still be compared against a matrix row.
 */
export const SCOPED = "scoped" as const;
export type ScopedGrant = Permission | typeof SCOPED;

/** Unrestricted within the organisation. */
const ALL: readonly Permission[] = PERMISSIONS;

/** Client portal: read-only view of their own deployment. */
const CLIENT_READ: readonly Permission[] = [
  "users:read",
  "clients:read",
  "sites:read",
  "stations:read",
  "shifts:read",
  "assignments:read",
  "attendance:read",
  "coverage:read",
  "deployment:read",
  "guards:read_public",
  "reports:read",
  "reports:export",
  "notifications:read",
];

/** Guard: own duty and own attendance, nothing else. */
const GUARD_GRANTS: readonly Permission[] = [
  "assignments:read",
  "attendance:read",
  "attendance:checkin",
  "attendance:checkout",
  "shifts:read",
  "notifications:read",
];

/**
 * The matrix. Keyed by role; the value is the granted set.
 *
 * `platform_admin` is deliberately **not** given a blanket override. It holds the same
 * organisation-level grants as a company admin, but every action it takes requires an explicit
 * organisation selection that is recorded in the audit log. A `if (isPlatformAdmin) return all`
 * shortcut is exactly the kind of branch that silently disables tenant isolation.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly ScopedGrant[]> = {
  platform_admin: ALL,
  security_company_admin: ALL,
  supervisor: [
    SCOPED,
    "users:read",
    "guards:read",
    "clients:read",
    "sites:read",
    "stations:read",
    "shifts:read",
    "assignments:read",
    "assignments:create",
    "assignments:update",
    "assignments:cancel",
    "attendance:read",
    "attendance:correct",
    "attendance:mark_absent",
    "coverage:read",
    "deployment:read",
    "reports:read",
    "reports:export",
    "notifications:read",
    "audit:read_site",
  ],
  site_manager: [
    SCOPED,
    "guards:read",
    "clients:read",
    "sites:read",
    "stations:read",
    "shifts:read",
    "assignments:read",
    "attendance:read",
    "coverage:read",
    "deployment:read",
    "notifications:read",
  ],
  guard: GUARD_GRANTS,
  client_admin: [...CLIENT_READ, "users:create", "users:update"],
  client_viewer: CLIENT_READ,
};

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/**
 * The only roles whose scope is the whole organisation. Allowlist, not a chain of negations:
 * a role added to ROLES without being classified here must NOT inherit the whole company.
 *
 * `resolveScope` in `tenant.ts` independently decides scope per role, so these two can drift
 * apart. They must stay in agreement — see `hasOrgWideScope` and `src/lib/security.test.ts`.
 * The allowlist is the half that is enforced, so it is written as an allowlist: the previous
 * `!CLIENT_ROLES.includes(role) && !SELF_SCOPED_ROLES.includes(role)` form never consulted
 * `SITE_SCOPED_ROLES`, and so classified every non-client, non-guard role — `supervisor` and
 * `site_manager` included — as organisation-wide.
 */
export const ORGANIZATION_SCOPED_ROLES: readonly Role[] = [
  "platform_admin",
  "security_company_admin",
];

/**
 * True when a role's *scope* covers the whole organisation rather than a slice of it.
 *
 * **Invariant:** `hasOrgWideScope(role)` is true **iff** `scopeFilter(resolveScope(role, …))`
 * is empty. `resolveScope` and `scopeFilter` live in `tenant.ts` and are referenced here rather
 * than imported — `tenant.ts` already pulls `Role` from `constants/domain`, so importing back
 * would close an import cycle. `src/lib/security.test.ts` is what actually holds the two modules
 * to this invariant.
 *
 * Separate from `can()` on purpose, because permission and scope answer different questions and a
 * capability check cannot tell them apart. Client roles are granted `deployment:read` — a client
 * legitimately needs to see guards at their own buildings — but that grant is scoped to their own
 * `clientId`. Rendering the company's unscoped deployment board to them would be a tenant leak even
 * though `can(role, "deployment:read")` returned true. The same argument applies to `supervisor`
 * and `site_manager`, who hold `deployment:read` against their *assigned* sites only.
 *
 * So any page that reads *unscoped* rows must assert both: the capability **and** org-wide scope.
 * Pages that read scoped rows should not call this at all, and instead narrow by `clientId` in the
 * query.
 */
export function hasOrgWideScope(role: Role): boolean {
  return ORGANIZATION_SCOPED_ROLES.includes(role);
}

/**
 * Pure capability check.
 *
 * Navigation and buttons call this to *hide* what a user cannot do. That is a convenience
 * layer only — it is never trusted, because a hidden button is not a control. The server-side
 * `requirePermission` in `server/auth/guards.ts` is the actual boundary.
 */
export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) {
    return false;
  }
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAny(
  role: Role | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => can(role, permission));
}

export function isClientRole(role: Role): boolean {
  return CLIENT_ROLES.includes(role);
}

export function isSiteScopedRole(role: Role): boolean {
  return SITE_SCOPED_ROLES.includes(role);
}

/**
 * True when a role's scope is its own records and nothing else — `guard`, currently.
 *
 * This exists because "is this caller a guard" is a question `can()` cannot answer. `attendance:checkin`
 * is the capability that makes `/my-duty` renderable, and `platform_admin` and `security_company_admin`
 * hold it the moment they hold `ALL`, so a capability check on that page admits the two roles with
 * the widest scope in the product onto a screen shaped as *my* duty — one specific guard's post,
 * shift and check-in button.
 *
 * The grant is not the defect; the gate is. An org-wide admin is entitled to every row the duty card
 * would show, so this is not a leak, and it is not a reason to remove `attendance:checkin` from
 * `ALL` — that permission answers "may this role record a check-in", which is a different question
 * from "is this page somebody's own duty". It is here so a page that renders the *caller's* records
 * can ask in the shape that answers it: scope, not capability. `SELF_SCOPED_ROLES` is read rather
 * than a role literal re-spelled, so a role classified as self-scoped in `constants/domain.ts`
 * inherits the answer and an unclassified one is not silently granted it.
 */
export function isSelfScopedRole(role: Role): boolean {
  return SELF_SCOPED_ROLES.includes(role);
}

/**
 * Client users may manage users, but only within their own client. The matrix grants the
 * capability; this narrows *who* it applies to.
 */
export function canManageUsers(
  role: Role,
  target: { clientId?: string | null },
  actorClientId?: string | null,
): boolean {
  if (role === "security_company_admin" || role === "platform_admin") {
    return true;
  }

  if (role === "client_admin") {
    // No target clientId means a company-scoped user, which a client admin may not manage.
    return Boolean(target.clientId) && target.clientId === actorClientId;
  }

  return false;
}

/**
 * Write operations a supervisor may perform. Site scope is enforced separately and can only
 * narrow — this answers "is the capability granted at all".
 */
export function canWriteDeployment(role: Role): boolean {
  return can(role, "assignments:create");
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  "users:read": "View users",
  "users:create": "Create users",
  "users:update": "Edit users",
  "users:deactivate": "Deactivate users",
  "guards:read": "View guards",
  "guards:read_public": "View guard names and duty status (own sites)",
  "guards:create": "Create guards",
  "guards:update": "Edit guards",
  "clients:read": "View clients",
  "clients:create": "Create clients",
  "clients:update": "Edit clients",
  "sites:read": "View sites",
  "sites:create": "Create sites",
  "sites:update": "Edit sites",
  "stations:read": "View stations",
  "stations:create": "Create stations",
  "stations:update": "Edit stations",
  "shifts:read": "View shifts",
  "shifts:create": "Create shifts",
  "shifts:update": "Edit shifts",
  "assignments:read": "View assignments",
  "assignments:create": "Create assignments",
  "assignments:update": "Edit assignments",
  "assignments:cancel": "Cancel assignments",
  "attendance:read": "View attendance",
  "attendance:checkin": "Check in",
  "attendance:checkout": "Check out",
  "attendance:correct": "Correct attendance",
  "attendance:mark_absent": "Mark absent",
  "coverage:read": "View coverage",
  "deployment:read": "View live deployment",
  "reports:read": "View reports",
  "reports:export": "Export reports",
  "notifications:read": "View notifications",
  "audit:read": "View audit log",
  "audit:read_site": "View audit log for assigned sites",
  "settings:read": "View settings",
  "settings:update": "Edit settings",
  "organizations:read": "View organisations",
  "organizations:create": "Create organisations",
  "organizations:update": "Edit organisations",
};
