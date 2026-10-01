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
 * The filter that matches no document, in any collection.
 *
 * `_id` is an ObjectId everywhere — including on `Site` — and is never `null`, so this predicate
 * is false for every row. Frozen rather than frozen-and-copied because it is returned by
 * reference from several arms below: an in-place mutation by a caller would otherwise rewrite the
 * fail-closed default for every subsequent query in the process, and ES modules are strict mode,
 * so the mistake throws instead of silently corrupting tenant isolation.
 */
const NO_MATCH: Record<string, unknown> = Object.freeze({ _id: null });

/**
 * Which collection *shape* a scope filter is being built for.
 *
 * The scope→field mapping is a property of the collection, not of the scope. A site-scoped read of
 * `Station` narrows on `siteId`, but the same scope read against `Site` narrows on `_id`, because
 * a site document's own id *is* the thing the scope names — `Site` has no `siteId` field. Reading
 * `Site` through the child-collection filter therefore matches zero rows: fail-closed rather than
 * a leak, but a silently empty site board, which is exactly the sort of result that later gets
 * "fixed" by loosening the filter.
 *
 * Each member exists for one concrete collection that the `"child"` shape reads wrongly. A target is
 * not a category to grow on speculation — it is the answer to "which document's own identity is
 * this scope naming?", and a collection whose identity field the scope cannot name belongs under
 * `"child"` with the honest `null` in the table below rather than in a new member here.
 */
export type ScopeTarget =
  /** The `Site` collection itself: a site is its own scope member, so membership lives in `_id`. */
  | "site"
  /** The `Client` collection itself — the same shape one link up the chain, and the same defect. */
  | "client"
  /** A collection that carries `siteId` / `clientId` as a foreign key (`Station`, `DutyAssignment`, `AttendanceRecord`, …). */
  | "child";

/** Scope kinds that narrow by membership in an id list. `organization` and `self` do not. */
type MembershipScopedKind = Extract<Scope["kind"], "sites" | "client">;

/**
 * The field a scope's membership list is stored in, per target.
 *
 * A `client` scope narrows on `clientId` for the `site` and `child` targets alike, because
 * `Site.clientId` genuinely exists, so a client-scoped read of `Site` stays client-narrowed. A
 * `null` value means "this collection cannot express that scope at all" — an unrepresentable scope
 * matches nothing, it is never silently unscoped. The `satisfies` clause makes adding a
 * `ScopeTarget` or a membership scope kind without deciding its field a compile error rather than a
 * silently-empty query.
 *
 * The `client` row is `"site"`'s twin, and it exists because `Client` carries the same defect
 * `Site` had: it has an `id`, not a `clientId`. A client document's own id *is* the client the
 * scope names, so a client-scoped read narrows on `_id` — exactly as a site-scoped read of `Site`
 * does. Left under `"child"` it would have narrowed on a `clientId` field `Client` does not have,
 * matched zero rows, and rendered a silently empty client list on the client portal, which reads
 * this collection.
 *
 * Its `sites` cell is `null`, and that is a real answer rather than an omission. The
 * site→client relation is stored on `Site` (`Site.clientId`), not on `Client`, so a client document
 * carries no site membership to narrow by — a supervisor's site list cannot be resolved against
 * the `Client` collection at all. The alternative would be a cross-collection lookup, which
 * `scopeFilter` is a single-predicate translator and must not become (docs/rbac.md,
 * "`supervisorIds` is resolution, not filtering"). Unrepresentable therefore means *no rows*, so
 * the answer fails closed rather than quietly widening to every client the company serves.
 */
const SCOPE_MEMBERSHIP_FIELD = {
  site: { sites: "_id", client: "clientId" },
  client: { sites: null, client: "_id" },
  child: { sites: "siteId", client: "clientId" },
} as const satisfies Record<
  ScopeTarget,
  Record<MembershipScopedKind, string | null>
>;

/**
 * Resolves the field carrying this scope's membership, or `undefined`/`null` when the scope
 * cannot be expressed against this target.
 *
 * The table lookup is widened to `Partial` and read optionally on purpose. A `ScopeTarget` or
 * `Scope["kind"]` that reached here through a cast is simply absent from the table, and the miss
 * has to resolve to "match nothing" — not throw, and above all not fall through to no predicate at
 * all, which would compose into the query as "match everything".
 */
function membershipField(
  target: ScopeTarget,
  kind: MembershipScopedKind,
): string | null | undefined {
  const row = SCOPE_MEMBERSHIP_FIELD[target] as
    | Partial<Record<MembershipScopedKind, string | null>>
    | undefined;
  return row?.[kind];
}

/**
 * Builds the Mongo filter fragment a scope contributes to a read of `target`.
 *
 * Returned as a plain object so it composes with the rest of a query. A scope that cannot be
 * expressed against the target returns `{ _id: null }` — matching nothing — rather than returning
 * `{}`, which would match everything. That asymmetry is the point: the safe default for an
 * unhandled scope kind or an unrepresentable target is "no data", never "all data".
 *
 * `target` is **required**, with no default. A defaulted target would preserve today's defect
 * rather than fix it: any future `Site` query written as `scopeFilter(ctx.scope)` would compile,
 * silently return zero rows, and be "corrected" later by loosening the filter. Requiring it makes
 * every call site state which collection shape it is reading, and a wrong literal is a compile
 * error at that call site — see `src/lib/security.test.ts`.
 *
 * `organization` is the only arm that returns `{}`, and it is target-independent: every other kind
 * either narrows or matches nothing, in every collection. That is what keeps the composed
 * guarantee `hasOrgWideScope(role)` ⟺ `scopeFilter(resolveScope(role, …), target)` is empty true
 * for every target rather than true by coincidence for one of them.
 */
export function scopeFilter(
  scope: Scope,
  target: ScopeTarget,
): Record<string, unknown> {
  switch (scope.kind) {
    case "organization":
      return {};
    case "self":
      return NO_MATCH;
    default: {
      // Narrowed to the membership kinds here. Passing `scope.kind` straight through is what
      // makes a new `Scope` kind a compile error until its filter field is chosen above.
      const field = membershipField(target, scope.kind);
      if (!field) {
        // Unrepresentable on this target, or an unrecognised target reached by cast.
        return NO_MATCH;
      }

      const ids = scope.kind === "sites" ? scope.siteIds : scope.clientIds;
      return { [field]: { $in: ids } };
    }
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
