/**
 * Tenant scoping primitives.
 *
 * A granted permission is necessary but not sufficient. Every request also carries a **scope**,
 * and a scope can only ever narrow — a service never widens a caller's scope to make a query
 * work. If the target record falls outside scope the answer is 404, not 403, so existence
 * cannot be probed (see docs/rbac.md#why-404-not-403).
 */

import type { Role } from "@/constants/domain";

export type Scope =
  | { kind: "organization" }
  | { kind: "sites"; siteIds: string[] }
  | { kind: "client"; clientIds: string[] }
  | { kind: "self" };

export const ORGANIZATION_SCOPE: Scope = { kind: "organization" };
export const SELF_SCOPE: Scope = { kind: "self" };

export function sitesScope(siteIds: string[]): Scope {
  return { kind: "sites", siteIds };
}

export function clientScope(clientIds: string[]): Scope {
  return { kind: "client", clientIds };
}

/** The authorisation context produced once per request and passed into every service call. */
export type AuthContext = {
  userId: string;
  organizationId: string;
  role: Role;
  scope: Scope;
  /** Present for `client_admin` / `client_viewer`. */
  clientId?: string;
  /** Present for `guard`. */
  guardId?: string;
  /** Sites this caller may act within. Empty array means "none". */
  siteIds: string[];
};

export function isOrganizationWide(scope: Scope): boolean {
  return scope.kind === "organization";
}

export function isSiteInScope(scope: Scope, siteId: string): boolean {
  switch (scope.kind) {
    case "organization":
      return true;
    case "sites":
      return scope.siteIds.includes(siteId);
    case "client":
    case "self":
      return false;
  }
}

export function isClientInScope(scope: Scope, clientId: string): boolean {
  switch (scope.kind) {
    case "organization":
      return true;
    case "client":
      return scope.clientIds.includes(clientId);
    case "sites":
    case "self":
      return false;
  }
}

/**
 * Builds the Mongo filter fragment a scope contributes.
 *
 * Returned as a plain object so it composes with the rest of a query. A scope that cannot be
 * expressed as a filter returns `{ _id: null }` — matching nothing — rather than returning
 * `{}`, which would match everything. That asymmetry is the point: the safe default for an
 * unhandled scope kind is "no data", never "all data".
 */
export function scopeFilter(scope: Scope): Record<string, unknown> {
  switch (scope.kind) {
    case "organization":
      return {};
    case "sites":
      return { siteId: { $in: scope.siteIds } };
    case "client":
      return { clientId: { $in: scope.clientIds } };
    case "self":
      return { _id: null };
  }
}

/**
 * Resolves the scope for a role.
 *
 * `siteIds` must be supplied by the caller from the database, never from the request body.
 */
export function resolveScope(
  role: Role,
  input: { siteIds?: string[]; clientId?: string | null },
): Scope {
  switch (role) {
    case "platform_admin":
    case "security_company_admin":
      return ORGANIZATION_SCOPE;
    case "supervisor":
    case "site_manager":
      return sitesScope(input.siteIds ?? []);
    case "client_admin":
    case "client_viewer":
      return input.clientId ? clientScope([input.clientId]) : SELF_SCOPE;
    case "guard":
      return SELF_SCOPE;
  }
}

/** Human-readable scope for the UI and audit metadata. */
export function describeScope(scope: Scope): string {
  switch (scope.kind) {
    case "organization":
      return "organisation";
    case "sites":
      return `${scope.siteIds.length} site${scope.siteIds.length === 1 ? "" : "s"}`;
    case "client":
      return "client account";
    case "self":
      return "own records";
  }
}
