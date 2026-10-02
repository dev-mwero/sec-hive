/**
 * The tenant control behind the site-scoped board.
 *
 * The board is the first page that renders a `supervisor`'s or `site_manager`'s *own* rows rather
 * than refusing them, so the thing under test is not the board — it is whether the rows it renders
 * are the caller's and nobody else's. These tests state the security properties in the shape they
 * would fail in:
 *
 * - a caller with assignments gets exactly those, and nothing else;
 * - a caller with none gets none, and the filter says so in a form that matches nothing;
 * - a site-scoped caller can never be served a site outside their assignment, by any path;
 * - the site-scoped filter is composed by `scopeFilter`, never re-spelled by this module;
 * - the rollup reports a site's exceptions and sorts them first.
 *
 * Fixtures are built here rather than imported from `src/data/dummy` on purpose. The demo dataset
 * has one supervisor assigned to every site in it, so it cannot express a caller who is assigned
 * *some* of them — the exact case this page has to get right — and the assertions that matter would
 * be vacuous against it. The fixtures are typed against the real domain types, so they describe the
 * same shape the service will.
 */

import { describe, expect, expectTypeOf, it } from "vitest";

import { type Role, SITE_SCOPED_ROLES } from "@/constants/domain";
import {
  assignedSiteIds,
  buildSiteRows,
  readScopedSiteBoard,
  readSitesByFilter,
  resolveSiteBoardScope,
  type SitePostCoverage,
} from "@/lib/site-board";
import {
  ORGANIZATION_SCOPE,
  scopeFilter,
  sitesScope,
} from "@/lib/tenant";
import type { Client, DeploymentRow, Site, Station } from "@/types/domain";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUPERVISOR = "user-supervisor";
const SITE_MANAGER = "user-site-manager";
/** Owns site-3, and so is as entitled to it as any other supervisor — which is why he is not a
 * candidate for "assigned to nobody". Using one id for both roles is the mistake this comment is
 * here to prevent: it makes "unassigned" quietly mean "assigned somewhere else". */
const OTHER_SUPERVISOR = "user-other-supervisor";
/** Assigned to no site at all. The caller the empty state exists for. */
const STRANGER = "user-no-sites";

/**
 * Five sites across two clients.
 *
 * Only three are assigned to the supervisor and only two to the site manager, and the two sets
 * overlap in exactly one site. So "my sites" and "the company's sites" differ, a filter that widened
 * to the client would be visible, and a filter that returned the caller's whole *role's* remit would
 * be visible too.
 */
const CLIENT_A: Client = {
  id: "client-a",
  organizationId: "org-1",
  name: "ABC Manufacturing",
  clientType: "factory",
  contactPerson: null,
  phone: null,
  email: null,
  address: null,
  status: "active",
};

const CLIENT_B: Client = { ...CLIENT_A, id: "client-b", name: "Coastal Mills" };

const CLIENTS = [CLIENT_A, CLIENT_B];

function site(
  id: string,
  clientId: string,
  supervisorIds: string[],
  overrides: Partial<Site> = {},
): Site {
  return {
    id,
    organizationId: "org-1",
    clientId,
    name: `Site ${id}`,
    code: id.toUpperCase(),
    address: null,
    description: null,
    // The assignment of record. It is per site, which is why `site-5` can belong to two people.
    supervisorIds,
    status: "active",
    ...overrides,
  };
}

const SITES: Site[] = [
  site("site-1", "client-a", [SUPERVISOR]),
  site("site-2", "client-a", [SUPERVISOR]),
  site("site-3", "client-b", [OTHER_SUPERVISOR]),
  site("site-4", "client-b", [SITE_MANAGER]),
  site("site-5", "client-a", [SUPERVISOR, SITE_MANAGER]),
];

/**
 * A post's coverage row. `required` is the post's required guard count and is the dataset's
 * statement, not a derivation — the rollup reads `coverageStatus` and never recomputes it.
 */
function post(
  stationId: string,
  siteId: string,
  coverageStatus: SitePostCoverage["coverageStatus"],
  required: number,
  present: number,
): SitePostCoverage {
  const at = SITES.find((s) => s.id === siteId);
  return {
    stationId,
    siteId,
    clientId: at?.clientId ?? "client-a",
    required,
    assigned: present,
    present,
    coverageStatus,
  };
}

const POSTS: SitePostCoverage[] = [
  // site-1: two posts, one of them with nobody at it. Both posts need two guards, so the site's
  // aggregate reads `present 2 / required 4` — a figure that hides the dark post entirely.
  post("station-1", "site-1", "covered", 2, 2),
  post("station-2", "site-1", "uncovered", 2, 0),
  // site-2: one healthy post.
  post("station-3", "site-2", "covered", 1, 1),
  // site-3: healthy, and not either caller's.
  post("station-4", "site-3", "covered", 1, 1),
  // site-4: short-staffed and a late guard.
  post("station-5", "site-4", "partially_covered", 2, 1),
  // site-5: healthy, and shared by both site-scoped callers.
  post("station-6", "site-5", "covered", 1, 1),
];

/** A deployment row that exists to be counted. The fields the rollup never reads are still filled. */
function deployment(
  assignmentId: string,
  siteId: string,
  status: DeploymentRow["status"],
): DeploymentRow {
  const at = SITES.find((s) => s.id === siteId);
  const start = new Date("1970-01-01T06:00:00Z");
  return {
    assignmentId,
    clientId: at?.clientId ?? "client-a",
    client: CLIENTS.find((c) => c.id === at?.clientId)?.name ?? "Unknown client",
    siteId,
    site: at?.name ?? "Unknown site",
    stationId: `station-for-${assignmentId}`,
    station: "Post A",
    guardId: `guard-for-${assignmentId}`,
    guard: "A. Guard",
    employeeNumber: `E-${assignmentId}`,
    shiftId: null,
    shift: null,
    shiftWindow: "06:00 – 18:00",
    supervisorId: SUPERVISOR,
    supervisor: "S. Upervisor",
    scheduledStart: start,
    scheduledEnd: new Date("1970-01-01T18:00:00Z"),
    actualCheckIn: null,
    actualCheckOut: null,
    status,
    statusLabel: status,
    stationRequiredCount: 1,
    stationPresentCount: 0,
  };
}

const DEPLOYMENTS: DeploymentRow[] = [
  deployment("assign-1", "site-1", "on_duty"),
  deployment("assign-2", "site-1", "absent"),
  deployment("assign-3", "site-1", "late"),
  deployment("assign-4", "site-2", "on_duty"),
  deployment("assign-5", "site-3", "absent"),
  deployment("assign-6", "site-4", "late"),
  deployment("assign-7", "site-5", "on_duty"),
];

const CATALOG = {
  sites: SITES,
  posts: POSTS,
  deployments: DEPLOYMENTS,
};

/** The whole path the page takes, in the page's order. */
function readBoardFor(role: Role, userId: string) {
  const scope = resolveSiteBoardScope(role, userId, SITES);
  return { scope, ...readScopedSiteBoard(scope, CATALOG) };
}

function ids(rows: { site: Site }[]): string[] {
  return rows.map((row) => row.site.id);
}

function kinds(row: { findings: { kind: string }[] }): string[] {
  return row.findings.map((finding) => finding.kind);
}

// ---------------------------------------------------------------------------

describe("assignedSiteIds()", () => {
  it("returns the sites whose supervisorIds contain the caller's own id", () => {
    expect(assignedSiteIds(SUPERVISOR, SITES)).toEqual([
      "site-1",
      "site-2",
      "site-5",
    ]);
  });

  it("returns nothing for a user assigned to no site", () => {
    // Not the whole company, and not an error. This is the case the board's empty state exists for,
    // and the difference between "no sites" and "all sites" is the whole point of the test below.
    expect(assignedSiteIds(STRANGER, SITES)).toEqual([]);
  });

  it("is keyed on the caller's id, so one caller's sites are never another's", () => {
    const supervisor = assignedSiteIds(SUPERVISOR, SITES);
    const manager = assignedSiteIds(SITE_MANAGER, SITES);

    expect(manager).toEqual(["site-4", "site-5"]);
    // `site-4` is the site manager's alone; serving it to the supervisor is the leak this guards.
    expect(supervisor).not.toContain("site-4");
    expect(manager).not.toContain("site-1");
    expect(manager).not.toContain("site-2");
    expect(manager).not.toContain("site-3");
  });

  it("deduplicates a supervisorIds array that holds the same id twice", () => {
    // `supervisorIds` is a denormalised array, and a service editing it without an `$addToSet`
    // leaves a repeat behind. The answer must be the same, and the `$in` should not carry the waste.
    const duplicated = [site("site-9", "client-a", [SUPERVISOR, SUPERVISOR])];
    expect(assignedSiteIds(SUPERVISOR, duplicated)).toEqual(["site-9"]);
  });

  it("does not match on a partial id", () => {
    // A substring match here would be a cross-tenant read wearing a one-character costume.
    const sites = [site("site-1", "client-a", ["user-supervisor-2"])];
    expect(assignedSiteIds(SUPERVISOR, sites)).toEqual([]);
  });

  it("returns nothing when there are no sites at all", () => {
    expect(assignedSiteIds(SUPERVISOR, [])).toEqual([]);
  });
});

describe("resolveSiteBoardScope()", () => {
  it("gives a site-scoped role exactly its assigned sites", () => {
    for (const role of SITE_SCOPED_ROLES) {
      expect(resolveSiteBoardScope(role, SUPERVISOR, SITES)).toEqual(
        sitesScope(["site-1", "site-2", "site-5"]),
      );
    }
  });

  it("gives a site-scoped role with no assignments an empty site scope", () => {
    for (const role of SITE_SCOPED_ROLES) {
      expect(resolveSiteBoardScope(role, STRANGER, SITES)).toEqual(
        sitesScope([]),
      );
    }
  });

  it("gives the organisation-wide roles organisation scope, not their assignment", () => {
    // Both org-wide roles pass this page's gate, and `resolveScope` is what keeps them entitled to
    // the whole board. If this answered `sitesScope([])` for them, the company would see an empty
    // directory; if it resolved their scope from `supervisorIds`, a company admin would silently
    // inherit whichever supervisor's remit the session happened to carry.
    for (const role of ["platform_admin", "security_company_admin"] as Role[]) {
      expect(resolveSiteBoardScope(role, SUPERVISOR, SITES)).toEqual(
        ORGANIZATION_SCOPE,
      );
    }
  });

  it("gives a guard a self scope rather than a site scope", () => {
    // A guard's site membership is not a scope. Resolving one anyway would invent an access level
    // nobody granted.
    expect(resolveSiteBoardScope("guard", SUPERVISOR, SITES)).toEqual({
      kind: "self",
    });
  });

  it("cannot resolve a client scope, because it is never given a client id", () => {
    // Stated because it is a property of this function rather than of the roles: it passes only
    // `siteIds`, so `resolveScope`'s client branches can only answer `SELF_SCOPE`. If a client role
    // ever reached this page it would be served nothing — fail closed, not fail open — which is the
    // behaviour that makes the page's `isClientRole` gate a convenience rather than the control.
    for (const role of ["client_admin", "client_viewer"] as Role[]) {
      const scope = resolveSiteBoardScope(role, SUPERVISOR, SITES);

      expect(scope).toEqual({ kind: "self" });
      expect(scopeFilter(scope, "site")).toEqual({ _id: null });
    }
  });
});

describe("the filters the board is built from", () => {
  it("narrows a site-scoped read of Site on _id, straight from scopeFilter", () => {
    // The value the primitive produces, asserted rather than re-derived: the page composes
    // `scopeFilter(scope, "site")` and never writes this object by hand, so this is also the
    // statement that nothing downstream may re-spell it.
    const { siteFilter } = readBoardFor("supervisor", SUPERVISOR);

    expect(siteFilter).toEqual({ _id: { $in: ["site-1", "site-2", "site-5"] } });
    expect(Object.keys(siteFilter)).toEqual(["_id"]);
  });

  it("narrows the post and deployment reads on siteId, because they carry it", () => {
    const { childFilter } = readBoardFor("supervisor", SUPERVISOR);

    expect(childFilter).toEqual({
      siteId: { $in: ["site-1", "site-2", "site-5"] },
    });
  });

  it("produces an empty $in for a caller with no assignments, and no other predicate", () => {
    // The exact filter behind the empty state. `$in: []` matches nothing; a filter that had lost
    // its key entirely would be `{}` and would match everything, which is the failure this whole
    // module exists to prevent.
    const { siteFilter, childFilter } = readBoardFor("supervisor", STRANGER);

    expect(siteFilter).toEqual({ _id: { $in: [] } });
    expect(childFilter).toEqual({ siteId: { $in: [] } });
    expect(Object.keys(siteFilter)).toHaveLength(1);
    expect(Object.keys(childFilter)).toHaveLength(1);
  });

  it("equals the primitive's own answer for the resolved scope, on both targets", () => {
    // Belt and braces on the composition: `readScopedSiteBoard` is the only place the target is
    // chosen, so this pins the choice. A `"child"` read of `Site` would match zero sites and
    // render a silently empty board for every supervisor — the exact defect the `ScopeTarget`
    // argument in `tenant.ts` was introduced to stop.
    for (const role of [...SITE_SCOPED_ROLES, "guard"] as Role[]) {
      const scope = resolveSiteBoardScope(role, SUPERVISOR, SITES);
      const { siteFilter, childFilter } = readScopedSiteBoard(scope, CATALOG);

      expect(siteFilter).toEqual(scopeFilter(scope, "site"));
      expect(childFilter).toEqual(scopeFilter(scope, "child"));
    }
  });

  it("is empty for the organisation-wide roles, which is what their entitlement means", () => {
    const { siteFilter, childFilter } = readBoardFor("security_company_admin", SUPERVISOR);

    expect(siteFilter).toEqual({});
    expect(childFilter).toEqual({});
  });
});

describe("readScopedSiteBoard()", () => {
  it("gives a supervisor exactly the sites assigned to them, and no others", () => {
    const board = readBoardFor("supervisor", SUPERVISOR);

    expect(board.sites.map((s) => s.id)).toEqual(["site-1", "site-2", "site-5"]);
    // Not the whole company, and not the whole client: `site-3` belongs to another client and
    // `site-4` to another supervisor.
    expect(board.sites.map((s) => s.id)).not.toContain("site-3");
    expect(board.sites.map((s) => s.id)).not.toContain("site-4");
  });

  it("narrows the post and deployment rows to the same sites, so the figures cannot describe another", () => {
    // A site list that is scoped while its counters are not is a leak with a chart on it: "3 posts
    // uncovered" across the company is a staffing figure for clients this caller does not serve,
    // and a guard's name is on the row that produces it.
    const board = readBoardFor("supervisor", SUPERVISOR);

    expect(new Set(board.posts.map((p) => p.siteId))).toEqual(
      new Set(["site-1", "site-2", "site-5"]),
    );
    expect(new Set(board.deployments.map((d) => d.siteId))).toEqual(
      new Set(["site-1", "site-2", "site-5"]),
    );
    // The counts also show that the other two sites' rows are the ones that had to be dropped:
    // seven deployment rows exist, five survive.
    expect(board.deployments).toHaveLength(5);
    expect(board.posts).toHaveLength(4);
  });

  it("gives a site manager their own sites and not the supervisor's", () => {
    // The two roles share one code path and one filter, so the difference between them is entirely
    // the assignment resolved from `supervisorIds` — which is the reason that resolution is keyed on
    // the caller's own id and not on the role.
    const board = readBoardFor("site_manager", SITE_MANAGER);

    expect(board.sites.map((s) => s.id)).toEqual(["site-4", "site-5"]);
    expect(board.sites.map((s) => s.id)).not.toContain("site-1");
    expect(board.sites.map((s) => s.id)).not.toContain("site-2");
    expect(board.sites.map((s) => s.id)).not.toContain("site-3");
  });

  it("gives a site manager only their own post and deployment rows too", () => {
    const board = readBoardFor("site_manager", SITE_MANAGER);

    expect(new Set(board.posts.map((p) => p.siteId))).toEqual(
      new Set(["site-4", "site-5"]),
    );
    expect(new Set(board.deployments.map((d) => d.siteId))).toEqual(
      new Set(["site-4", "site-5"]),
    );
  });

  it("gives a caller with no assignments nothing at all", () => {
    const board = readBoardFor("supervisor", STRANGER);

    expect(board.sites).toEqual([]);
    expect(board.posts).toEqual([]);
    expect(board.deployments).toEqual([]);
  });

  it("gives a guard nothing, because a guard is not on this board", () => {
    // `resolveScope` answers `self` for a guard, and the `"site"` filter for a self scope is the
    // match-nothing predicate. The page's gate refuses guards first, so this is the second of two
    // checks — and the one that holds if the gate is ever loosened.
    const board = readBoardFor("guard", SUPERVISOR);

    expect(board.siteFilter).toEqual({ _id: null });
    expect(board.sites).toEqual([]);
  });

  it("gives the organisation-wide roles the whole company, which is their scope", () => {
    // Stated positively, because the negative tests above are equally satisfied by a filter that
    // matches nothing at all. An empty filter here is correct, and it is the composed guarantee in
    // `permissions.ts` holding: `hasOrgWideScope(role)` iff the filter is empty.
    for (const role of ["platform_admin", "security_company_admin"] as Role[]) {
      const board = readBoardFor(role, SUPERVISOR);

      expect(board.siteFilter).toEqual({});
      expect(board.sites.map((s) => s.id)).toEqual(SITES.map((s) => s.id));
    }
  });

  it("never serves a site or a post row the caller's scope excludes, for any role and assignment", () => {
    // The property, swept across every role and every caller in the fixture. For a site-scoped role
    // the returned set is checked against the resolved assignment; for an org-wide role against the
    // company. A filter that quietly stopped narrowing fails here even when the resolved ids happen
    // to be right, which is the whole reason this sweep exists.
    const roles: Role[] = [
      "platform_admin",
      "security_company_admin",
      ...SITE_SCOPED_ROLES,
      "guard",
      "client_admin",
      "client_viewer",
    ];

    for (const role of roles) {
      for (const userId of [SUPERVISOR, SITE_MANAGER, STRANGER]) {
        const scope = resolveSiteBoardScope(role, userId, SITES);
        const board = readScopedSiteBoard(scope, CATALOG);
        const permitted =
          scope.kind === "sites"
            ? new Set(scope.siteIds)
            : scope.kind === "organization"
              ? new Set(SITES.map((s) => s.id))
              : new Set<string>();

        for (const served of board.sites) {
          expect(
            permitted.has(served.id),
            `${role}/${userId} was served ${served.id}, which their scope excludes`,
          ).toBe(true);
        }

        // The child rows answer to the same scope, and a row for a site the caller cannot see would
        // put that site's guard names on their board.
        for (const row of [...board.posts, ...board.deployments]) {
          expect(
            permitted.has(row.siteId),
            `${role}/${userId} was served a row for ${row.siteId}, which their scope excludes`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("the site reader's fail-closed arm", () => {
  it("matches nothing for a filter it does not understand, rather than everything", () => {
    // A reader that skips a clause it cannot evaluate is a reader that has stopped narrowing, and
    // it would look like a correct, well-scoped, entirely unscoped read. Each filter here is one a
    // careless edit could produce.
    for (const filter of [
      { siteId: { $in: ["site-1"] } }, // the child filter applied to Site
      { name: /^Site/ }, // a regex: Mongo has it, this reader does not
      { _id: { $nin: ["site-3"] } }, // an operator it does not implement
      { _id: { $in: ["site-1"], $exists: true } }, // an extra operator alongside a known one
      { _id: "site-1" }, // a bare equality
      { _id: null }, // the match-nothing predicate `scopeFilter` uses for unsupported cells
    ]) {
      expect(
        readSitesByFilter(SITES, filter),
        `${JSON.stringify(filter)} leaked`,
      ).toEqual([]);
    }
  });

  it("returns nothing for a filter of the wrong shape", () => {
    // A bare array of ids is the plausible mistake here: it looks like a filter, it is an object, and
    // `Object.entries` walks it as zero clauses — which would hand back the entire collection.
    for (const filter of [null, undefined, "site-1", 42, [], ["site-1"]]) {
      expect(readSitesByFilter(SITES, filter as never)).toEqual([]);
    }
  });

  it("still narrows correctly on a filter it does understand", () => {
    // The fail-closed arm is only trustworthy if it is not simply an arm that always fires.
    expect(
      readSitesByFilter(SITES, { _id: { $in: ["site-1", "site-4"] } }).map(
        (s) => s.id,
      ),
    ).toEqual(["site-1", "site-4"]);
    expect(readSitesByFilter(SITES, {})).toHaveLength(SITES.length);
  });

  it("returns a copy of the rows, not the caller's array", () => {
    // `filter` already allocates, but the point is that a caller cannot reach back through the
    // result to mutate what the next read will see.
    const source = [...SITES];
    const rows = readSitesByFilter(source, { _id: { $in: ["site-1"] } });

    rows.length = 0;
    expect(source).toHaveLength(SITES.length);
  });
});

describe("buildSiteRows()", () => {
  function rowsFor(role: Role, userId: string) {
    const board = readBoardFor(role, userId);
    return buildSiteRows({
      sites: board.sites,
      clients: CLIENTS,
      posts: board.posts,
      deployments: board.deployments,
    });
  }

  it("builds one row per scoped site, with the client name joined on", () => {
    const rows = rowsFor("supervisor", SUPERVISOR);

    expect(rows.map((row) => row.site.id)).toEqual([
      "site-1",
      "site-2",
      "site-5",
    ]);
    expect(rows[0].client?.name).toBe("ABC Manufacturing");
  });

  it("sorts the site with an uncovered post to the top", () => {
    // The live board's rule: an operator opening this screen is looking for exceptions, and making
    // them read past healthy sites to find one defeats the screen.
    const rows = rowsFor("supervisor", SUPERVISOR);

    expect(rows[0].site.id).toBe("site-1");
    expect(kinds(rows[0])).toEqual(["uncovered", "absent", "late"]);
  });

  it("orders findings by severity, so the first one is the worst", () => {
    const rows = rowsFor("site_manager", SITE_MANAGER);

    expect(rows[0].site.id).toBe("site-4");
    // `partial` outranks `late` even though the numbers are equal, because a post short of its
    // required count is what a supervisor dispatches against, while a late guard is already on site.
    expect(rows[0].findings).toEqual([
      { kind: "partial", count: 1 },
      { kind: "late", count: 1 },
    ]);
  });

  it("reports a site with nothing wrong as having no findings, while still showing its counts", () => {
    const rows = rowsFor("supervisor", SUPERVISOR);
    const healthy = rows.find((row) => row.site.id === "site-2");

    // "No findings" is a statement about exceptions, not about data: the counts are the reason the
    // row is on the board at all.
    expect(healthy?.findings).toEqual([]);
    expect(healthy?.postsTotal).toBe(1);
    expect(healthy?.postsCovered).toBe(1);
    expect(healthy?.required).toBe(1);
    expect(healthy?.present).toBe(1);
    expect(healthy?.assigned).toBe(1);
  });

  it("reads coverage from each post rather than re-deriving it from the totals", () => {
    // site-1 is `present 2 / required 4`. An aggregate ratio calls that a 50% shortfall — the same
    // figure it would report for two two-guard posts with one guard in each. Only the per-post status
    // separates a thinly-held site from a site with a post nobody is standing at, and the second is
    // the one that gets a badge.
    const rows = rowsFor("supervisor", SUPERVISOR);
    const first = rows.find((row) => row.site.id === "site-1");

    expect(first?.postsTotal).toBe(2);
    expect(first?.postsCovered).toBe(1);
    expect(first?.required).toBe(4);
    expect(first?.present).toBe(2);
    expect(first?.findings).toContainEqual({ kind: "uncovered", count: 1 });
  });

  it("does not call a post that requires nobody uncovered", () => {
    // The dataset's rule, not this test's: a post with `required: 0` is `covered`, so it never
    // reaches the board as a finding. Stated here so a future change that starts deriving coverage
    // from summed counts has to notice it.
    const rows = buildSiteRows({
      sites: [site("site-8", "client-a", [SUPERVISOR])],
      clients: CLIENTS,
      posts: [post("station-8", "site-8", "covered", 0, 0)],
      deployments: [],
    });

    expect(rows[0].postsTotal).toBe(1);
    expect(rows[0].postsCovered).toBe(1);
    expect(rows[0].findings).toEqual([]);
  });

  it("keeps a site whose client record is missing, rather than dropping it", () => {
    // The site is still this caller's responsibility. Omitting it would shrink the board to fit the
    // data that happens to exist, and the caller would read that as "not my sites".
    const rows = buildSiteRows({
      sites: [site("site-7", "client-missing", [SUPERVISOR])],
      clients: CLIENTS,
      posts: [],
      deployments: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].client).toBeNull();
  });

  it("returns no rows for a caller with no assignments, without throwing", () => {
    expect(rowsFor("supervisor", STRANGER)).toEqual([]);
  });

  it("survives a site with no posts at all, inventing no finding and no number", () => {
    const rows = buildSiteRows({
      sites: [site("site-8", "client-a", [SUPERVISOR])],
      clients: CLIENTS,
      posts: [],
      deployments: [],
    });

    // Not covered and not uncovered: there is nothing there to cover.
    expect(rows[0].postsTotal).toBe(0);
    expect(rows[0].postsCovered).toBe(0);
    expect(rows[0].required).toBe(0);
    expect(rows[0].findings).toEqual([]);
  });

  it("flags a deactivated site, but never above a real problem at another site", () => {
    const rows = buildSiteRows({
      sites: [
        site("site-1", "client-a", [SUPERVISOR], { status: "inactive" }),
        site("site-2", "client-a", [SUPERVISOR]),
      ],
      clients: CLIENTS,
      posts: [post("station-1", "site-2", "uncovered", 1, 0)],
      deployments: [],
    });

    expect(rows[0].site.id).toBe("site-2");
    expect(kinds(rows[0])).toEqual(["uncovered"]);
    expect(kinds(rows[1])).toEqual(["inactive"]);
    expect(rows[1].findings[0]).toEqual({ kind: "inactive", count: 1 });
  });

  it("sorts stably, so the order does not shuffle between two reads of the same data", () => {
    const input = {
      sites: SITES,
      clients: CLIENTS,
      posts: POSTS,
      deployments: DEPLOYMENTS,
    };

    expect(ids(buildSiteRows(input))).toEqual(ids(buildSiteRows(input)));
  });

  it("does not mutate the collection it was given", () => {
    // The sort copies before ordering. Sorting the caller's array in place would reorder
    // `DUMMY.sites` for every later read in the process — including a read whose narrowing depends
    // on the order the service returned.
    const input = [...SITES];
    const before = input.map((s) => s.id);

    buildSiteRows({
      sites: input,
      clients: CLIENTS,
      posts: POSTS,
      deployments: DEPLOYMENTS,
    });

    expect(input.map((s) => s.id)).toEqual(before);
  });
});

/**
 * What the board renders, for the two roles this page is the home of.
 *
 * Named apart from the tests above because this is the claim the report makes: the supervisor with
 * sites, the supervisor without, and the site manager.
 */
describe("the rendered board", () => {
  it("renders a supervisor's three assigned sites, problem first, and nothing else", () => {
    const board = readBoardFor("supervisor", SUPERVISOR);
    const rows = buildSiteRows({
      sites: board.sites,
      clients: CLIENTS,
      posts: board.posts,
      deployments: board.deployments,
    });

    expect(
      rows.map((row) => ({
        site: row.site.name,
        client: row.client?.name,
        findings: kinds(row),
      })),
    ).toEqual([
      {
        site: "Site site-1",
        client: "ABC Manufacturing",
        findings: ["uncovered", "absent", "late"],
      },
      { site: "Site site-2", client: "ABC Manufacturing", findings: [] },
      { site: "Site site-5", client: "ABC Manufacturing", findings: [] },
    ]);
  });

  it("renders nothing for a supervisor with no assignments, and the empty board has a cause", () => {
    const board = readBoardFor("supervisor", STRANGER);
    const rows = buildSiteRows({
      sites: board.sites,
      clients: CLIENTS,
      posts: board.posts,
      deployments: board.deployments,
    });

    expect(rows).toEqual([]);
    // And the filter behind it is one that matches nothing, so the empty board is a consequence of
    // the scope rather than of a lookup that found nothing.
    expect(board.siteFilter).toEqual({ _id: { $in: [] } });
  });

  it("renders a site manager only their own two sites", () => {
    const board = readBoardFor("site_manager", SITE_MANAGER);
    const rows = buildSiteRows({
      sites: board.sites,
      clients: CLIENTS,
      posts: board.posts,
      deployments: board.deployments,
    });

    expect(ids(rows)).toEqual(["site-4", "site-5"]);
    expect(kinds(rows[0])).toEqual(["partial", "late"]);
  });

  it("renders a company-wide board of every site, for the roles entitled to one", () => {
    const board = readBoardFor("security_company_admin", SUPERVISOR);
    const rows = buildSiteRows({
      sites: board.sites,
      clients: CLIENTS,
      posts: board.posts,
      deployments: board.deployments,
    });

    // Five sites, and `site-3`'s absent guard — the row the supervisor was not entitled to — is on
    // this board, because for this role it is not another tenant's.
    expect(ids(rows)).toHaveLength(5);
    expect(
      rows.some((row) => row.site.id === "site-3" && kinds(row).includes("absent")),
    ).toBe(true);
  });
});

/**
 * The premise the two filter targets rest on: `Site` is the document whose own id is the site, so
 * it carries no foreign key to itself, while a post's row carries `siteId`. This page is the reason
 * that distinction has to be exact — see the `ScopeTarget` argument in `tenant.ts`.
 */
describe("the collection shapes the two filters are built for", () => {
  it("narrows Site on _id and the post rows on siteId, because only the latter carries siteId", () => {
    expectTypeOf<Site>().toHaveProperty("id");
    expectTypeOf<Site>().not.toHaveProperty("siteId");
    expectTypeOf<Station>().toHaveProperty("siteId");
    expectTypeOf<SitePostCoverage>().toHaveProperty("siteId");

    // Stated at runtime too, because a type assertion says nothing about the documents the service
    // actually returns.
    expect("siteId" in SITES[0]).toBe(false);
    expect("siteId" in POSTS[0]).toBe(true);

    const scope = resolveSiteBoardScope("supervisor", SUPERVISOR, SITES);
    expect(scopeFilter(scope, "site")).toHaveProperty("_id");
    expect(scopeFilter(scope, "child")).toHaveProperty("siteId");
  });
});