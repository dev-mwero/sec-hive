/**
 * The tenant control behind the site-scoped board.
 *
 * Everything that decides **which** rows a caller sees lives here, and nothing that decides how
 * they look does. The split is deliberate: this module answers "which sites is this caller entitled
 * to", and that answer has to be provable without rendering anything. `src/components` imports
 * this; this imports no component, no tone and no display label — a scope decision that depended
 * on a badge would be a scope decision the security tests could not audit.
 *
 * The read is narrowed **in the query, not around it**. `readScopedSiteBoard` composes the filter
 * `scopeFilter` produces and then applies it to the collections, rather than handing a whole
 * collection to a component and filtering in the view. A page that filters after it has read has
 * already read the rows it was not entitled to read, and every later branch becomes a chance to
 * forget.
 *
 * ## The resolution path, in three steps
 *
 * 1. `resolveSiteBoardScope` turns "this user is a supervisor" into "these site ids" by reading
 *    `Site.supervisorIds`, keyed on the **session user's own id**. Not a request parameter, not a
 *    query string, not a claim in the session payload.
 * 2. `resolveScope` folds that list and the role into a `Scope`. The site-scoped roles get
 *    `sitesScope(siteIds)`; the organisation-wide roles get `organization`, which is correct —
 *    their scope genuinely is the whole company, so they are entitled to the whole board when they
 *    open this page. That is the composed guarantee in `permissions.ts` made visible: an empty
 *    filter here means org-wide, and only org-wide.
 * 3. `scopeFilter(scope, target)` translates the scope into the Mongo predicate for the collection
 *    being read — `"site"` for `Site`, which narrows on `_id` because a site document's own id
 *    *is* the site, and `"child"` for the post-coverage and deployment rows, which carry `siteId`.
 *
 * Steps 1 and 2 are both required, and neither is sufficient alone. `resolveScope` cannot invent
 * site ids — its own contract says they "must be supplied by the caller from the database, never
 * from the request body" — while step 1 narrows nothing by itself. A page that ran step 1 and
 * forgot step 2 would render the company's sites to a supervisor; one that ran step 2 from a
 * hardcoded list would render nothing and look like a permissions bug rather than a data bug.
 */

import type { CoverageStatus, Role } from "@/constants/domain";
import { resolveScope, type Scope, scopeFilter } from "@/lib/tenant";
import type { Client, DeploymentRow, Id, Site } from "@/types/domain";

// ---------------------------------------------------------------------------
// Step 1 + 2: assignment resolution, then scope
// ---------------------------------------------------------------------------

/**
 * The site ids this user is assigned to, read from `Site.supervisorIds`.
 *
 * Assignment is the authority. It is deliberately **not** read from the session's `siteIds`:
 * `SessionUser` has no such field today, and adding one would widen the session — the one object
 * that crosses into the client bundle, and the one every future route would be tempted to trust —
 * to carry a list of site ids that is a derived value, goes stale the moment an assignment
 * changes, and is only meaningful once the server has checked the caller is entitled to it at all.
 * Resolving from `supervisorIds` costs one indexed read and cannot be widened by a client.
 *
 * Empty is a real answer, not a fallback: a supervisor with no assignments resolves to `[]`, which
 * `resolveScope` turns into `sitesScope([])`, which `scopeFilter` turns into `{ _id: { $in: [] } }`
 * — a filter that matches no site. It is the whole reason the board can be empty for a caller
 * without being empty for everyone.
 *
 * Deduplicated, because `supervisorIds` is a denormalised array that a service editing it without
 * an `$addToSet` can leave holding a repeat, and a repeated id in a `$in` is a wasted slot in the
 * query's index scan rather than a different answer.
 *
 * @param userId The session user's own id. Never a request-supplied value.
 * @param sites The site's collection, as the service layer holds it. In production this is the
 *   result of a read, not the whole table — see the note on the unbounded `$in` below.
 */
export function assignedSiteIds(userId: Id, sites: readonly Site[]): Id[] {
  const ids: Id[] = [];
  const seen = new Set<Id>();

  for (const site of sites) {
    if (site.supervisorIds.includes(userId) && !seen.has(site.id)) {
      seen.add(site.id);
      ids.push(site.id);
    }
  }

  return ids;
}

/**
 * The scope a caller holds on this board, resolved from their own id.
 *
 * **KNOWN HAZARD, deliberately not solved here.** `AuthContext.siteIds` is unbounded and this
 * materialises the caller's full assignment into a `Scope`, so a supervisor across 5,000 sites
 * produces a 5,000-element `$in` on the hot path of the page a supervisor opens most often. The
 * dummy dataset has three sites, so the board looks correct and the problem is invisible; it is
 * recorded here rather than left to be discovered at 5,000.
 *
 * It is not fixed by chunking the array, padding the filter, or capping it — every one of those
 * either still sends the whole list or silently drops assignments, and "the board shows some of my
 * sites" is a worse failure than a slow one. The fix is the one `docs/rbac.md` already names: a
 * `Scope` variant that carries no id list and is resolved from `Site.supervisorIds` at query time,
 * so the assignment is a sub-query instead of a literal. That is a change to `tenant.ts` and
 * `AuthContext`, which this module does not make — `scopeFilter` is a single-predicate translator
 * and must not become a collection query (docs/rbac.md, "`supervisorIds` is resolution, not
 * filtering"). Until then, treat `siteIds` as a list that is assumed to fit in a query plan.
 */
export function resolveSiteBoardScope(
  role: Role,
  userId: Id,
  sites: readonly Site[],
): Scope {
  return resolveScope(
    role,
    { siteIds: assignedSiteIds(userId, sites), clientId: null },
  );
}

// ---------------------------------------------------------------------------
// Step 3: the filter, and applying it
// ---------------------------------------------------------------------------

/**
 * The predicate `scopeFilter` produces. Its shape is decided in `tenant.ts`; this module consumes
 * it and does not get a vote.
 */
export type ScopeFilter = Record<string, unknown>;

/**
 * Applies a scope filter to an in-memory collection.
 *
 * **This is the demo stand-in for the Mongo query**, and it is deliberately not a query engine: it
 * understands exactly the shapes `scopeFilter` emits, and nothing else. Its value is that the
 * filter remains the *enforcement point* — the page composes the predicate, this narrows by it, and
 * a reviewer can read the whole authorisation path in three lines instead of trusting a component.
 * When the service lands, this is replaced by `Model.find({ organizationId, ...filter })` and the
 * filter argument does not change.
 *
 * It ANDs multiple keys rather than requiring exactly one, so the tenant's `organizationId`
 * predicate can be composed alongside the scope's when the real read arrives. Today there is only
 * ever one key.
 *
 * Every unrecognised clause collapses the **whole read** to zero rows. Dropping the clause it does
 * not understand would leave a filter that looks narrowed and is not, which is the one outcome
 * worse than a leak in usefulness and worse than a leak in how long it survives review: a silently
 * empty board reads as a permissions bug and gets "fixed" by loosening something. Returning nothing
 * is the same answer `scopeFilter` gives a scope it cannot express, and for the same reason.
 */
function applyScopeFilter<T>(
  rows: readonly T[],
  filter: ScopeFilter,
  fields: Readonly<Record<string, (row: T) => unknown>>,
): T[] {
  // A filter is only honoured when it is a plain object of clauses. Anything else — a dropped
  // variable, a service that returned a string, `undefined` from a failed lookup, or a bare array of
  // ids passed where a filter was expected — matches nothing. Throwing here would be a denial of
  // service on a security control, and passing `rows` through unfiltered would be a data leak, so
  // `[]` is the only answer that is neither. An empty object `{}` is the exception and stays
  // meaningful: that is the org-wide filter, which genuinely does not narrow.
  if (typeof filter !== "object" || filter === null || Array.isArray(filter)) {
    return [];
  }

  const clauses: ((row: T) => boolean)[] = [];

  for (const [field, condition] of Object.entries(filter)) {
    const read = Object.hasOwn(fields, field) ? fields[field] : undefined;

    if (!read) {
      // The collection has no such field, so the clause cannot be evaluated against it. A filter
      // built for a different collection shape, or a field removed from the schema, lands here.
      return [];
    }

    if (condition === null) {
      // `{ field: null }` is the fail-closed predicate `scopeFilter` returns for a scope it cannot
      // express. The fields read below are non-nullable, so no row can satisfy it — which is what
      // makes this safe to honour rather than reject: rejecting would mean guessing, and guessing
      // "allow" is the leak.
      clauses.push(() => false);
      continue;
    }

    if (isInCondition(condition)) {
      const values = condition.$in;
      clauses.push((row) => values.includes(read(row)));
      continue;
    }

    return [];
  }

  return rows.filter((row) => clauses.every((clause) => clause(row)));
}

/**
 * Recognises `{ $in: [...] }` and nothing else.
 *
 * The key count is part of the recognition, not an oversight. A condition carrying an extra
 * operator — `{ $in: [...], $exists: true }` — is a conjunction in Mongo, and honouring the `$in`
 * while ignoring the rest is precisely the dropped-clause failure this function exists to refuse. An
 * unrecognised condition therefore narrows to nothing rather than to "as far as I understood".
 */
function isInCondition(condition: unknown): condition is { $in: unknown[] } {
  if (typeof condition !== "object" || condition === null) {
    return false;
  }

  const keys = Object.keys(condition);
  return (
    keys.length === 1 &&
    keys[0] === "$in" &&
    Array.isArray((condition as Record<string, unknown>).$in)
  );
}

/**
 * How a `Site` document's own fields are read, mirroring `SCOPE_MEMBERSHIP_FIELD["site"]` in
 * `tenant.ts`: membership lives in `_id` (the site's own id) and a client scope narrows on the
 * `clientId` that `Site` genuinely carries. A field absent from this table cannot be narrowed on,
 * which is the local expression of the same fail-closed rule the table upstream documents with
 * `null`.
 */
const SITE_FIELDS = {
  _id: (site: Site) => site.id,
  clientId: (site: Site) => site.clientId,
} as const;

/**
 * Reads `Site` through a scope filter of any provenance.
 *
 * Exported as the seam the security tests use to reach the reader's fail-closed arm.
 * `readScopedSiteBoard` can only ever be handed a filter `scopeFilter` produced, and that
 * primitive is exhaustively tested to produce one of three shapes — so without this the arm that
 * refuses an unrecognised clause would be untested code guarding a tenant boundary, which is worse
 * than no arm at all, because the next reader to touch it will believe it is covered.
 *
 * Callers building a read should use `readScopedSiteBoard`, which chooses the filter for them.
 */
export function readSitesByFilter(
  sites: readonly Site[],
  filter: ScopeFilter,
): Site[] {
  return applyScopeFilter(sites, filter, SITE_FIELDS);
}

/** A post's coverage row — the `"child"` collection this board rolls up per site. */
export type SitePostCoverage = {
  stationId: Id;
  siteId: Id;
  clientId: Id;
  required: number;
  assigned: number;
  present: number;
  coverageStatus: CoverageStatus;
};

const POST_FIELDS = {
  _id: (post: SitePostCoverage) => post.stationId,
  siteId: (post: SitePostCoverage) => post.siteId,
  clientId: (post: SitePostCoverage) => post.clientId,
} as const;

const DEPLOYMENT_FIELDS = {
  _id: (row: DeploymentRow) => row.assignmentId,
  siteId: (row: DeploymentRow) => row.siteId,
  clientId: (row: DeploymentRow) => row.clientId,
} as const;

/**
 * The scoped read behind the board: three collections, one scope, three narrowing filters.
 *
 * The filters are returned alongside the rows so the security tests can assert the predicate the
 * page actually applied rather than re-deriving it. That is the difference between proving the
 * board is scoped and hoping it is.
 */
export type ScopedSiteBoard = {
  /** `scopeFilter(scope, "site")` — narrows `Site` on `_id`. */
  siteFilter: ScopeFilter;
  /** `scopeFilter(scope, "child")` — narrows the post and deployment reads on `siteId`. */
  childFilter: ScopeFilter;
  sites: Site[];
  posts: SitePostCoverage[];
  deployments: DeploymentRow[];
};

export function readScopedSiteBoard(
  scope: Scope,
  catalog: {
    sites: readonly Site[];
    posts: readonly SitePostCoverage[];
    deployments: readonly DeploymentRow[];
  },
): ScopedSiteBoard {
  // Two targets, because two collection shapes are being read. `"site"` is the one that matters
  // for the leak this page exists to prevent: `Site` has no `siteId` field, so the `"child"` filter
  // against it would match zero sites and render a silently empty board.
  const siteFilter = scopeFilter(scope, "site");
  const childFilter = scopeFilter(scope, "child");

  return {
    siteFilter,
    childFilter,
    sites: readSitesByFilter(catalog.sites, siteFilter),
    posts: applyScopeFilter(catalog.posts, childFilter, POST_FIELDS),
    deployments: applyScopeFilter(
      catalog.deployments,
      childFilter,
      DEPLOYMENT_FIELDS,
    ),
  };
}

// ---------------------------------------------------------------------------
// The rollup: which sites, and what is wrong with each
// ---------------------------------------------------------------------------

/**
 * One thing wrong at a site, ordered most severe first.
 *
 * A `kind` and a `count` rather than a tone, because this module has no opinion about colour. The
 * severity *order* is real information and lives here; how a `partial` finding looks is the design
 * system's business.
 */
export type SiteFinding =
  /** Posts where nobody at all is present, and the post requires someone. */
  | { kind: "uncovered"; count: number }
  /** Posts with guards present but below their required guard count (`partially_covered`). */
  | { kind: "partial"; count: number }
  /** Guards rostered to the site who never reported. */
  | { kind: "absent"; count: number }
  /** Guards who reported after the shift started plus the grace period. */
  | { kind: "late"; count: number }
  /** The site record itself is deactivated, so nothing here is being staffed. */
  | { kind: "inactive"; count: 1 };

/**
 * Severity order. Lower is worse, and the array `findings` is built in is this order, so
 * `findings[0]` is the most severe finding and the sort below needs no separate score.
 */
const FINDING_RANK: Record<SiteFinding["kind"], number> = {
  uncovered: 0,
  partial: 1,
  absent: 2,
  late: 3,
  inactive: 4,
};

/** One past the last rank, so a site with no findings sorts after every site that has one. */
const RANK_CLEAN = 5;

export type SiteBoardRow = {
  site: Site;
  /**
   * The site record itself does not carry a client name, so this is a join on `Site.clientId`.
   *
   * It is a join, not a scope widening: the rows arrive already scoped, so the set of client ids
   * that can be looked up here is bounded by the caller's own assignments. `scopeFilter` cannot do
   * this join and deliberately refuses to — its `sites × client` cell is `{ _id: null }`, because
   * the site→client relation lives on `Site` and resolving it against `Client` would be a
   * cross-collection lookup (docs/rbac.md). A supervisor already reads the client name beside every
   * site on the live board, so a name for a site they are responsible for is inside what they are
   * entitled to; a *miss* is rendered as unknown rather than dropping the site, because silently
   * omitting a site they are assigned to is a board that lies about their own remit.
   */
  client: Client | null;
  postsTotal: number;
  postsCovered: number;
  required: number;
  assigned: number;
  present: number;
  /** Empty means everything at this site is covered and nobody is late. */
  findings: SiteFinding[];
};

/**
 * Builds one row per site: the site, its client's name, and what is wrong with it right now.
 *
 * The counts are aggregated from the **scoped** post and deployment rows, so they inherit the
 * narrowing and cannot describe a site the caller cannot see. Callers pass already-scoped
 * collections; this function does not filter, and must not be given anything else.
 *
 * `coverageStatus` is read from each post rather than re-derived from summed counts, and that is
 * not a shortcut. A site with two two-guard posts — one full, one dark — has `present 2 / required
 * 4`, which an aggregate ratio reports as a 50% shortfall, the same figure it would report for two
 * two-guard posts with one guard in each. Only the per-post status distinguishes a site that is
 * thinly held from a site with a post nobody is standing at, and the second is the one a supervisor
 * is dispatched for. `CoverageBar` still shows the aggregate in the view; the findings do not
 * depend on it.
 */
export function buildSiteRows(input: {
  sites: readonly Site[];
  clients: readonly Client[];
  posts: readonly SitePostCoverage[];
  deployments: readonly DeploymentRow[];
}): SiteBoardRow[] {
  const postsBySite = groupBy(input.posts, (post) => post.siteId);
  const deploymentsBySite = groupBy(input.deployments, (row) => row.siteId);
  const clientsById = new Map(
    input.clients.map((client) => [client.id, client]),
  );

  const rows = input.sites.map((site): SiteBoardRow => {
    const posts = postsBySite.get(site.id) ?? [];
    const deployments = deploymentsBySite.get(site.id) ?? [];

    return {
      site,
      client: clientsById.get(site.clientId) ?? null,
      postsTotal: posts.length,
      postsCovered: posts.filter((p) => p.coverageStatus === "covered").length,
      required: sum(posts, (p) => p.required),
      assigned: sum(posts, (p) => p.assigned),
      present: sum(posts, (p) => p.present),
      findings: findingsFor(site, posts, deployments),
    };
  });

  return sortExceptionsFirst(rows);
}

/** Built in `FINDING_RANK` order, so index 0 is the worst thing about the site. */
function findingsFor(
  site: Site,
  posts: readonly SitePostCoverage[],
  deployments: readonly DeploymentRow[],
): SiteFinding[] {
  const findings: SiteFinding[] = [];

  const uncovered = posts.filter(
    (p) => p.coverageStatus === "uncovered",
  ).length;
  const partial = posts.filter(
    (p) => p.coverageStatus === "partially_covered",
  ).length;
  const absent = deployments.filter((d) => d.status === "absent").length;
  const late = deployments.filter((d) => d.status === "late").length;

  if (uncovered > 0) {
    findings.push({ kind: "uncovered", count: uncovered });
  }
  if (partial > 0) {
    findings.push({ kind: "partial", count: partial });
  }
  if (absent > 0) {
    findings.push({ kind: "absent", count: absent });
  }
  if (late > 0) {
    findings.push({ kind: "late", count: late });
  }
  if (site.status === "inactive") {
    findings.push({ kind: "inactive", count: 1 });
  }

  return findings;
}

/**
 * Problems first, exactly as the live board sorts its rows.
 *
 * An operator opening this screen is looking for what is wrong. A board that buries a dark post
 * under healthy sites has made them read the whole thing to find the one line that matters, which
 * makes the board slower than useless at the moment it is needed. Clean sites are kept, because a
 * board that hides healthy sites is not a board — they simply sink.
 *
 * Worst finding, then number of findings, then client and site name so the order is stable and
 * does not shuffle between reads.
 */
function sortExceptionsFirst(rows: SiteBoardRow[]): SiteBoardRow[] {
  return [...rows].sort(
    (a, b) =>
      worstRank(a) - worstRank(b) ||
      a.findings.length - b.findings.length ||
      (a.client?.name ?? "").localeCompare(b.client?.name ?? "") ||
      a.site.name.localeCompare(b.site.name),
  );
}

function worstRank(row: SiteBoardRow): number {
  const worst = row.findings[0];
  return worst ? FINDING_RANK[worst.kind] : RANK_CLEAN;
}

// ---------------------------------------------------------------------------

function groupBy<T>(
  rows: readonly T[],
  key: (row: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const id = key(row);
    const bucket = groups.get(id);
    if (bucket) {
      bucket.push(row);
    } else {
      groups.set(id, [row]);
    }
  }

  return groups;
}

function sum<T>(rows: readonly T[], read: (row: T) => number): number {
  let total = 0;
  for (const row of rows) {
    total += read(row);
  }
  return total;
}
