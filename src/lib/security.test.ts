/**
 * The capability matrix and tenant scoping.
 *
 * These two modules are where a mistake becomes a cross-tenant data leak rather than a wrong
 * pixel, so the tests assert the *security properties* rather than re-stating the matrix. A test
 * that repeats the matrix catches a typo; a test that states the invariant catches a refactor
 * that quietly widens someone's access.
 */

import { describe, expect, it } from "vitest";

import {
  CLIENT_ROLES,
  ROLES,
  type Role,
  SELF_SCOPED_ROLES,
  SITE_SCOPED_ROLES,
} from "@/constants/domain";
import {
  can,
  canAny,
  canManageUsers,
  canWriteDeployment,
  hasOrgWideScope,
  isClientRole,
  isSiteScopedRole,
  ORGANIZATION_SCOPED_ROLES,
  PERMISSION_LABELS,
  PERMISSIONS,
  type Permission,
  ROLE_PERMISSIONS,
} from "@/lib/permissions";
import {
  type AuthContext,
  isClientInScope,
  isOrganizationWide,
  isSiteInScope,
  ORGANIZATION_SCOPE,
  resolveScope,
  type Scope,
  type ScopeTarget,
  SELF_SCOPE,
  scopeFilter,
  sitesScope,
} from "@/lib/tenant";

/**
 * The roles whose data is the whole organisation. Deliberately *not* the same list as
 * `ORGANIZATION_SCOPED_ROLES` in `permissions.ts`: repeating it here is what lets the two modules
 * drift apart, so the classifiers are tested against the shared constants while this list states
 * the expectation in plain terms. See the "composed guarantee" block for the property that pins
 * them together.
 */
const COMPANY_ROLES: Role[] = ["platform_admin", "security_company_admin"];

describe("can()", () => {
  it("denies everything when there is no role", () => {
    // A missing session must fail closed. This is the check most likely to be called before auth
    // is wired and it must never be permissive.
    for (const permission of PERMISSIONS) {
      expect(can(undefined, permission)).toBe(false);
    }
  });

  it("grants company admins every permission in the catalogue", () => {
    for (const permission of PERMISSIONS) {
      expect(can("security_company_admin", permission)).toBe(true);
    }
  });

  it("gives platform_admin the same grants as a company admin, not a superset", () => {
    // Explicitly asserted rather than assumed. A `if (isPlatformAdmin) return true` shortcut is
    // the classic way tenant isolation silently turns off, so the invariant is pinned here: the
    // matrix is the only source of truth and platform_admin is not a wildcard.
    expect(new Set(ROLE_PERMISSIONS.platform_admin)).toEqual(
      new Set(ROLE_PERMISSIONS.security_company_admin),
    );
  });

  it("never grants a guard any write capability on deployment", () => {
    const forbidden: Permission[] = [
      "assignments:create",
      "assignments:update",
      "assignments:cancel",
      "attendance:correct",
      "attendance:mark_absent",
      "guards:create",
      "guards:update",
      "users:create",
      "users:update",
      "users:deactivate",
      "sites:create",
      "sites:update",
      "clients:create",
      "clients:update",
    ];

    for (const permission of forbidden) {
      expect(can("guard", permission)).toBe(false);
    }
  });

  it("lets a guard check in and out, and nothing else in attendance", () => {
    expect(can("guard", "attendance:checkin")).toBe(true);
    expect(can("guard", "attendance:checkout")).toBe(true);
    // A guard correcting their own record would defeat the audit trail.
    expect(can("guard", "attendance:correct")).toBe(false);
  });

  it("keeps client_viewer strictly read-only", () => {
    // Read-ness is stated as verbs, not as an `endsWith(":read")` pattern. Two grants are
    // legitimately read-only but do not match that pattern — `reports:export` and
    // `guards:read_public` — and pattern-matching would have flagged them as bugs, burying the
    // real risk under a false failure.
    const MUTATING_ACTIONS = new Set([
      "create",
      "update",
      "cancel",
      "correct",
      "deactivate",
      "mark_absent",
      "checkin",
      "checkout",
    ]);

    // The invariant: no mutating capability, for any resource. Only the mutating half is asserted
    // here. Which read permissions a client holds is a separate, per-permission decision — it is
    // wrong to infer "read ⇒ granted", because `guards:read` is read and is correctly denied.
    for (const permission of PERMISSIONS) {
      const action = permission.split(":")[1] ?? "";
      if (MUTATING_ACTIONS.has(action)) {
        expect(
          can("client_viewer", permission),
          `client_viewer must not hold mutating permission "${permission}"`,
        ).toBe(false);
      }
    }
  });

  it("grants client_viewer exactly the read surface its portal needs", () => {
    // Stated positively, because "no mutating permission" alone would still pass if the whole
    // matrix were emptied.
    expect(can("client_viewer", "deployment:read")).toBe(true);
    expect(can("client_viewer", "reports:export")).toBe(true);
    expect(can("client_viewer", "guards:read_public")).toBe(true);
    expect(can("client_viewer", "notifications:read")).toBe(true);

    expect(can("client_viewer", "guards:read")).toBe(false);
    expect(can("client_viewer", "users:create")).toBe(false);
  });

  it("lets client_admin manage its own users but never deactivate anyone", () => {
    expect(can("client_admin", "users:create")).toBe(true);
    expect(can("client_admin", "users:update")).toBe(true);
    // Deactivating a user is an organisation-level action. A client must not be able to lock out
    // a company's staff account.
    expect(can("client_admin", "users:deactivate")).toBe(false);
  });

  it("gives client roles the name-only guard projection, not employment records", () => {
    for (const role of CLIENT_ROLES) {
      expect(can(role, "guards:read_public")).toBe(true);
      expect(can(role, "guards:read")).toBe(false);
      expect(can(role, "guards:create")).toBe(false);
      expect(can(role, "guards:update")).toBe(false);
    }
  });

  it("does not grant a guard the public projection of other guards", () => {
    expect(can("guard", "guards:read_public")).toBe(false);
  });

  it("grants a supervisor deployment writes but not organisation configuration", () => {
    expect(can("supervisor", "assignments:create")).toBe(true);
    expect(can("supervisor", "assignments:update")).toBe(true);
    expect(can("supervisor", "attendance:correct")).toBe(true);

    for (const permission of [
      "users:create",
      "users:update",
      "users:deactivate",
      "guards:create",
      "clients:create",
      "sites:create",
      "settings:update",
    ] as Permission[]) {
      expect(can("supervisor", permission)).toBe(false);
    }
  });

  it("grants a site_manager no deployment writes at all", () => {
    expect(can("site_manager", "assignments:create")).toBe(false);
    expect(can("site_manager", "assignments:update")).toBe(false);
    expect(can("site_manager", "attendance:mark_absent")).toBe(false);
    expect(can("site_manager", "deployment:read")).toBe(true);
  });

  it("never grants a client role any tenant-wide configuration", () => {
    for (const role of CLIENT_ROLES) {
      for (const permission of [
        "organizations:update",
        "organizations:read",
        "settings:update",
        "audit:read",
      ] as Permission[]) {
        expect(can(role, permission)).toBe(false);
      }
    }
  });
});

describe("canAny()", () => {
  it("is true when at least one permission is granted", () => {
    expect(canAny("guard", ["assignments:create", "attendance:checkin"])).toBe(
      true,
    );
    expect(canAny("guard", ["assignments:create", "attendance:correct"])).toBe(
      false,
    );
  });

  it("is false for an empty list and for no role", () => {
    expect(canAny("security_company_admin", [])).toBe(false);
    expect(canAny(undefined, ["users:read"])).toBe(false);
  });
});

describe("hasOrgWideScope()", () => {
  it("is false for roles whose data is a slice of the organisation", () => {
    // This is the check that stops a client — who legitimately holds `deployment:read` — being
    // served the company's unscoped deployment board.
    for (const role of [...CLIENT_ROLES, "guard"] as Role[]) {
      expect(hasOrgWideScope(role)).toBe(false);
    }
  });

  it("is true only for roles that hold every site in the organisation", () => {
    for (const role of COMPANY_ROLES) {
      expect(hasOrgWideScope(role)).toBe(true);
    }
  });

  it("is false for a site-scoped role, even though it holds deployment:read", () => {
    // The regression this whole file's hardest test exists for. A supervisor and a site manager are
    // scoped to their *assigned* sites (docs/rbac.md:82 — the live board is `assigned`, not `✔`),
    // so they must not be served the unscoped organisation-wide board. The old implementation
    // computed org-wide-ness from a chain of negations that never consulted SITE_SCOPED_ROLES, so
    // it answered `true` for both while `resolveScope` was simultaneously narrowing them to an
    // explicit site list — the two modules disagreed, and the page that gates on this predicate
    // (`dashboard/live`) followed the wrong one.
    expect(hasOrgWideScope("supervisor")).toBe(false);
    expect(hasOrgWideScope("site_manager")).toBe(false);
  });

  it("matches ORGANIZATION_SCOPED_ROLES exactly", () => {
    // The allowlist and the predicate are the same thing stated twice; if one is edited without
    // the other, this is where it shows.
    for (const role of ROLES) {
      expect(hasOrgWideScope(role)).toBe(
        ORGANIZATION_SCOPED_ROLES.includes(role),
      );
    }
  });

  it("fails closed for a role that is in no scope bucket", () => {
    // `Role` is a closed union, so an unclassified role cannot be constructed without a cast — and
    // that is the point. A role added to `ROLES` but not yet placed in any bucket must come back
    // org-wide `false`, so that the build fails here rather than a new hire silently inheriting
    // every client in the company.
    const unclassified = "new_role_not_yet_classified" as Role;

    expect(ORGANIZATION_SCOPED_ROLES.includes(unclassified)).toBe(false);
    expect(CLIENT_ROLES.includes(unclassified)).toBe(false);
    expect(SITE_SCOPED_ROLES.includes(unclassified)).toBe(false);
    expect(SELF_SCOPED_ROLES.includes(unclassified)).toBe(false);

    expect(hasOrgWideScope(unclassified)).toBe(false);
    expect(isClientRole(unclassified)).toBe(false);
    expect(isSiteScopedRole(unclassified)).toBe(false);
  });
});

describe("canManageUsers()", () => {
  it("lets company admins manage anyone", () => {
    expect(canManageUsers("security_company_admin", {}, null)).toBe(true);
    expect(
      canManageUsers("platform_admin", { clientId: "client-1" }, "client-2"),
    ).toBe(true);
  });

  it("lets a client admin manage only users inside its own client", () => {
    expect(
      canManageUsers("client_admin", { clientId: "client-1" }, "client-1"),
    ).toBe(true);
    expect(
      canManageUsers("client_admin", { clientId: "client-2" }, "client-1"),
    ).toBe(false);
  });

  it("does not let a client admin manage a company-scoped user", () => {
    // A target with no clientId belongs to the security company, not to any client. Falling back
    // to "allow" here would let a client edit the company's staff directory.
    expect(canManageUsers("client_admin", { clientId: null }, "client-1")).toBe(
      false,
    );
    expect(canManageUsers("client_admin", {}, "client-1")).toBe(false);
  });

  it("does not let a client admin manage users with no client admin context", () => {
    expect(canManageUsers("client_admin", { clientId: "client-1" }, null)).toBe(
      false,
    );
  });

  it("refuses every other role", () => {
    expect(
      canManageUsers("supervisor", { clientId: "client-1" }, "client-1"),
    ).toBe(false);
    expect(canManageUsers("guard", { clientId: "client-1" }, "client-1")).toBe(
      false,
    );
    expect(
      canManageUsers("client_viewer", { clientId: "client-1" }, "client-1"),
    ).toBe(false);
  });
});

describe("canWriteDeployment()", () => {
  it("answers the capability question only", () => {
    expect(canWriteDeployment("supervisor")).toBe(true);
    expect(canWriteDeployment("security_company_admin")).toBe(true);
    expect(canWriteDeployment("site_manager")).toBe(false);
    expect(canWriteDeployment("guard")).toBe(false);
    expect(canWriteDeployment("client_admin")).toBe(false);
  });
});

describe("role classifiers", () => {
  it("identifies client and site-scoped roles", () => {
    // Driven off the shared buckets rather than a private list of literals, so adding a role to
    // `domain.ts` cannot leave a classifier disagreeing with the bucket it claims to read.
    for (const role of CLIENT_ROLES) {
      expect(isClientRole(role)).toBe(true);
    }
    expect(isClientRole("guard")).toBe(false);

    for (const role of SITE_SCOPED_ROLES) {
      expect(isSiteScopedRole(role)).toBe(true);
    }
    expect(isSiteScopedRole("security_company_admin")).toBe(false);
  });

  it("partitions every role into exactly one scope bucket", () => {
    // `hasOrgWideScope` is an allowlist, so a role in no bucket is least-privilege rather than
    // org-wide — correct, but invisible until something reads it. This asserts the four buckets
    // cover `ROLES` exactly once each, so adding a role to `domain.ts` without classifying it
    // fails the build instead of quietly inheriting an access level nobody chose.
    const buckets: [name: string, roles: readonly Role[]][] = [
      ["ORGANIZATION_SCOPED_ROLES", ORGANIZATION_SCOPED_ROLES],
      ["CLIENT_ROLES", CLIENT_ROLES],
      ["SITE_SCOPED_ROLES", SITE_SCOPED_ROLES],
      ["SELF_SCOPED_ROLES", SELF_SCOPED_ROLES],
    ];

    for (const role of ROLES) {
      const containing = buckets
        .filter(([, roles]) => roles.includes(role))
        .map(([name]) => name);

      expect(
        containing,
        `${role} is in ${containing.length} scope buckets (${containing.join(", ") || "none"})`,
      ).toHaveLength(1);
    }

    // Belt and braces: the buckets must also partition `ROLES` in the other direction — no bucket
    // may name a role that does not exist.
    const classified = buckets.flatMap(([, roles]) => roles);
    expect([...classified].sort()).toEqual([...ROLES].sort());
  });
});

describe("matrix completeness", () => {
  it("has an entry for every role in the catalogue", () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it("has a UI label for every permission", () => {
    // Guards against a new permission shipping with a blank label in the roles screen.
    for (const permission of PERMISSIONS) {
      expect(PERMISSION_LABELS[permission]).toBeTruthy();
    }
  });

  it("grants no permission outside the catalogue", () => {
    const known = new Set<string>(PERMISSIONS);
    for (const [role, grants] of Object.entries(ROLE_PERMISSIONS)) {
      for (const grant of grants) {
        if (grant === "scoped") {
          continue;
        }
        expect(known, `${role} has unknown grant "${grant}"`).toContain(grant);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

describe("resolveScope()", () => {
  it("gives company admins organisation-wide scope", () => {
    expect(resolveScope("security_company_admin", {})).toEqual(
      ORGANIZATION_SCOPE,
    );
    expect(resolveScope("platform_admin", {})).toEqual(ORGANIZATION_SCOPE);
  });

  it("gives a supervisor exactly the sites it was given", () => {
    expect(
      resolveScope("supervisor", { siteIds: ["site-1", "site-2"] }),
    ).toEqual(sitesScope(["site-1", "site-2"]));
  });

  it("gives a client role a scope containing only its own client", () => {
    expect(resolveScope("client_admin", { clientId: "client-1" })).toEqual({
      kind: "client",
      clientIds: ["client-1"],
    });
  });

  it("falls back to SELF_SCOPE for a client role with no client", () => {
    // Fail closed. Widening to organisation scope here on the basis of a missing field would hand
    // every client user the whole company's data.
    for (const role of CLIENT_ROLES) {
      expect(resolveScope(role, { clientId: null })).toEqual(SELF_SCOPE);
      expect(resolveScope(role, {})).toEqual(SELF_SCOPE);
    }
  });

  it("falls back to an empty site scope for a supervisor with no sites", () => {
    const scope = resolveScope("supervisor", {});
    expect(scope).toEqual({ kind: "sites", siteIds: [] });
    expect(isSiteInScope(scope, "site-1")).toBe(false);
  });

  it("gives a guard self scope", () => {
    expect(resolveScope("guard", { siteIds: ["site-1"] })).toEqual(SELF_SCOPE);
  });
});

describe("scopeFilter()", () => {
  it("returns an empty filter ONLY for organisation-wide scope", () => {
    // `{}` matches every document in the collection. If a non-org-wide role ever resolves to it,
    // that is a full tenant leak, so this is asserted rather than left to review.
    expect(scopeFilter(ORGANIZATION_SCOPE, "child")).toEqual({});

    const nonOrgWide: Scope[] = [
      sitesScope(["site-1"]),
      { kind: "client", clientIds: ["client-1"] },
      SELF_SCOPE,
    ];

    for (const scope of nonOrgWide) {
      expect(scopeFilter(scope, "child")).not.toEqual({});
    }
  });

  it("matches nothing for self scope rather than matching everything", () => {
    // The single most important assertion in this file: the safe default for a scope that cannot
    // be expressed as a filter is "no data", never "all data". Pinned for *both* targets — self
    // scope is not a `Site` read that happens to be empty, it is empty everywhere.
    expect(scopeFilter(SELF_SCOPE, "child")).toEqual({ _id: null });
    expect(scopeFilter(SELF_SCOPE, "site")).toEqual({ _id: null });
  });

  it("produces an empty $in for an empty site scope, which matches nothing", () => {
    // An empty id list must narrow to zero rows rather than being treated as "no restriction".
    // `resolveScope` returns exactly this for a supervisor with no sites, so the supervisor site
    // board is empty rather than the whole company's.
    expect(scopeFilter(sitesScope([]), "child")).toEqual({
      siteId: { $in: [] },
    });
    expect(scopeFilter(sitesScope([]), "site")).toEqual({ _id: { $in: [] } });
  });

  it("filters sites and clients by membership on a child collection", () => {
    expect(scopeFilter(sitesScope(["site-1"]), "child")).toEqual({
      siteId: { $in: ["site-1"] },
    });
    expect(
      scopeFilter({ kind: "client", clientIds: ["client-2"] }, "child"),
    ).toEqual({
      clientId: { $in: ["client-2"] },
    });
  });
});

// ---------------------------------------------------------------------------
// Target-aware scoping
// ---------------------------------------------------------------------------

/**
 * Every scope kind against every target, as one table.
 *
 * Driven off the scope *constructors* and the target literals rather than restating either, so a
 * new `Scope` kind or a new `ScopeTarget` lands in a row that is asserted rather than skipped.
 */
const SCOPES_BY_KIND: { kind: Scope["kind"]; scope: Scope }[] = [
  { kind: "organization", scope: ORGANIZATION_SCOPE },
  { kind: "sites", scope: sitesScope(["site-1", "site-2"]) },
  { kind: "client", scope: { kind: "client", clientIds: ["client-1"] } },
  { kind: "self", scope: SELF_SCOPE },
];

const TARGETS: ScopeTarget[] = ["site", "child"];

describe("scopeFilter() against the Site collection", () => {
  it("narrows a site-scoped read of Site on _id, not on a field Site does not have", () => {
    // The defect this exists for. `Site` has no `siteId` field — a site document's own id *is* the
    // site — so the child-collection filter `{ siteId: { $in: [...] } }` matched zero sites and
    // rendered a silently empty site board for every supervisor and site manager.
    expect(scopeFilter(sitesScope(["site-1", "site-2"]), "site")).toEqual({
      _id: { $in: ["site-1", "site-2"] },
    });
  });

  it("keeps a client-scoped read of Site narrowed to that client", () => {
    // `Site.clientId` genuinely exists, so the client filter is already correct here. Stated
    // explicitly so a future "simplification" that reroutes client scope through the site path
    // cannot quietly turn a client-scoped site list into a whole-organisation one.
    expect(
      scopeFilter({ kind: "client", clientIds: ["client-1"] }, "site"),
    ).toEqual({
      clientId: { $in: ["client-1"] },
    });
  });

  it("gives an organisation-wide read of Site no predicate at all", () => {
    expect(scopeFilter(ORGANIZATION_SCOPE, "site")).toEqual({});
  });

  it("changes only the site field when the target changes", () => {
    // Every other (scope kind, target) pair must be byte-identical across targets. This is what
    // "every other collection is unaffected" means, stated as a property rather than by assertion.
    for (const { kind, scope } of SCOPES_BY_KIND) {
      if (kind === "sites") {
        continue;
      }
      expect(scopeFilter(scope, "site"), `scope "${kind}"`).toEqual(
        scopeFilter(scope, "child"),
      );
    }
  });
});

describe("scopeFilter() fail-closed properties", () => {
  it("produces {} for organisation scope and for no other scope, on any target", () => {
    // The cross-product form of "an empty filter means the whole tenant". Asserted over the
    // product rather than per-scope so a target that widens cannot be introduced alongside a
    // scope that already fails closed for the other target.
    for (const target of TARGETS) {
      for (const { kind, scope } of SCOPES_BY_KIND) {
        const isEmpty = Object.keys(scopeFilter(scope, target)).length === 0;
        expect(
          isEmpty,
          `${kind} × ${target} produced ${JSON.stringify(scopeFilter(scope, target))}`,
        ).toBe(kind === "organization");
      }
    }
  });

  it("matches nothing for an unrecognised target, never everything", () => {
    // The new axis of risk. A cast — a typo, a bad refactor, an untyped caller — must not fall
    // through to "no predicate", because a filter that composes into a query as nothing at all
    // is the worst possible outcome: it looks like a successful, correctly-scoped read.
    const bogus = "sites" as ScopeTarget;
    const narrowed = SCOPES_BY_KIND.filter(
      ({ kind }) => kind !== "organization",
    );

    for (const { kind, scope } of narrowed) {
      const filter = scopeFilter(scope, bogus);
      expect(filter, `${kind} × unrecognised target`).toEqual({ _id: null });
      expect(
        Object.keys(filter).length,
        `${kind} × unrecognised target must not be unscoped`,
      ).toBeGreaterThan(0);
    }

    // `organization` is deliberately the exception: it is resolved *before* the target is looked
    // at, because it is target-independent — the caller already holds the widest scope there is,
    // so there is nothing left to narrow by, and the tenant predicate comes from `OrgFilter`
    // (`organizationId` is required on every service read). Failing closed here would deny a
    // legitimate organisation-wide admin access to a collection over a misspelled literal, which
    // is an availability cost with no confidentiality benefit. This is the one place where `{}`
    // is correct, and it is correct *because* the scope is `organization` — the same condition
    // that governs every other target, which is what makes the guarantee composable.
    expect(scopeFilter(ORGANIZATION_SCOPE, bogus)).toEqual({});
  });

  it("matches nothing for an unrecognised scope kind, never everything", () => {
    // The symmetric guard on the other axis, and the reason `Scope` is a closed union: a kind the
    // membership table has never heard of cannot resolve to an empty predicate.
    const unknownKind = { kind: "organisation" } as unknown as Scope;

    for (const target of TARGETS) {
      expect(scopeFilter(unknownKind, target)).toEqual({ _id: null });
    }
  });

  it("never widens a narrowed scope to match more rows than before", () => {
    // A regression guard on the direction of every change: each filter below matches a strict
    // subset of what `organization` matches. `sitesScope([])` in particular must stay an empty
    // `$in` and not degrade to "all sites".
    const scoped = SCOPES_BY_KIND.filter(({ kind }) => kind !== "organization");

    for (const { kind, scope } of scoped) {
      for (const target of TARGETS) {
        const filter = scopeFilter(scope, target);
        expect(
          Object.keys(filter).length,
          `${kind} × ${target} lost its predicate`,
        ).toBe(1);
      }
    }

    // The specific regression: an empty id list is "none", not "all".
    for (const target of TARGETS) {
      const filter = scopeFilter(sitesScope([]), target);
      expect(filter).toEqual({
        [target === "site" ? "_id" : "siteId"]: { $in: [] },
      });
    }
  });
});

describe("scope membership checks", () => {
  it("lets organisation-wide scope see every site and client", () => {
    expect(isSiteInScope(ORGANIZATION_SCOPE, "anything")).toBe(true);
    expect(isClientInScope(ORGANIZATION_SCOPE, "anything")).toBe(true);
  });

  it("does not let a site-scoped caller treat the whole client as in scope", () => {
    // Site scope narrows by site. It grants no visibility of the client record itself, which
    // would otherwise leak every site belonging to that client.
    const scope = sitesScope(["site-1"]);
    expect(isSiteInScope(scope, "site-1")).toBe(true);
    expect(isSiteInScope(scope, "site-2")).toBe(false);
    expect(isClientInScope(scope, "client-1")).toBe(false);
  });

  it("does not let a client-scoped caller reach a site directly", () => {
    const scope: Scope = { kind: "client", clientIds: ["client-1"] };
    expect(isClientInScope(scope, "client-1")).toBe(true);
    expect(isClientInScope(scope, "client-2")).toBe(false);
    // A client scope is expressed on `clientId`; it must not be usable as a site grant.
    expect(isSiteInScope(scope, "site-1")).toBe(false);
  });

  it("confines self scope to nothing", () => {
    expect(isSiteInScope(SELF_SCOPE, "site-1")).toBe(false);
    expect(isClientInScope(SELF_SCOPE, "client-1")).toBe(false);
  });

  it("identifies organisation-wide scope", () => {
    expect(isOrganizationWide(ORGANIZATION_SCOPE)).toBe(true);
    expect(isOrganizationWide(SELF_SCOPE)).toBe(false);
    expect(isOrganizationWide(sitesScope([]))).toBe(false);
  });
});

describe("composed guarantee", () => {
  /**
   * The property that matters, stated once over every role: a role is organisation-wide if and
   * only if its resolved scope produces an unscoped filter.
   *
   * `hasOrgWideScope()` lives in `permissions.ts` and `resolveScope()` in `tenant.ts`. They
   * answer the same question in two modules, and nothing but this test stops them drifting into
   * disagreeing — which is how a client ends up holding a page's capability check but not its
   * data filter, or the reverse.
   */
  it("agrees between hasOrgWideScope() and the resolved scope filter", () => {
    const contexts: Record<Role, Parameters<typeof resolveScope>[1]> = {
      platform_admin: {},
      security_company_admin: {},
      supervisor: { siteIds: ["site-1"] },
      site_manager: { siteIds: ["site-1"] },
      guard: {},
      client_admin: { clientId: "client-1" },
      client_viewer: { clientId: "client-1" },
    };

    for (const role of ROLES) {
      // Asserted for every target, not just one. The premise of this invariant is that a filter
      // is empty iff the role's scope is the whole organisation — and `scopeFilter` takes a
      // target, so a version of it that widened for some collection would break the invariant
      // without changing what it says. `organization` is the only arm returning `{}` and it does
      // so for every target, which is what keeps the premise intact.
      for (const target of TARGETS) {
        const filter = scopeFilter(resolveScope(role, contexts[role]), target);
        const isUnscoped = Object.keys(filter).length === 0;
        expect(
          isUnscoped,
          `${role} (${target}): hasOrgWideScope=${hasOrgWideScope(role)} but filter ${JSON.stringify(filter)}`,
        ).toBe(hasOrgWideScope(role));
      }
    }
  });
});

describe("AuthContext", () => {
  it("accepts a fully-populated context", () => {
    // Compile-time coverage for the shape every service call receives.
    const context: AuthContext = {
      userId: "user-1",
      organizationId: "org-1",
      role: "supervisor",
      scope: sitesScope(["site-1"]),
      siteIds: ["site-1"],
    };
    expect(context.scope).toEqual(sitesScope(["site-1"]));
  });
});
