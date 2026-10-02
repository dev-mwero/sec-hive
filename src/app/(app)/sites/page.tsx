import { Database } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader, SectionHeading } from "@/components/layout/page-header";
import { SiteBoard } from "@/components/sites/site-board";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Metric, MetricRow } from "@/components/ui/metric";
import { safeHomeForRole } from "@/constants/navigation";
import { DUMMY, dummyCoverage, dummyDeployment } from "@/data/dummy";
import { can, isClientRole } from "@/lib/permissions";
import {
  buildSiteRows,
  readScopedSiteBoard,
  resolveSiteBoardScope,
} from "@/lib/site-board";
import { isOrganizationWide } from "@/lib/tenant";
import { getSession } from "@/server/auth/session";

/**
 * **Your sites** — the home surface for site-scoped staff, and a *company* surface.
 *
 * A `supervisor` and a `site_manager` are sent here by `homeForRole()`. Both operations pages
 * assert `hasOrgWideScope()` and would bounce them straight back onto this one, so redirecting them
 * without a destination to land on is a loop; this route is the other half of that promise.
 *
 * **Company, not client.** `sites:read` is granted to the client roles too, and a grant is a
 * capability rather than an invitation to a particular screen — so this page refuses them by class
 * (`isClientRole`) rather than by permission. Their own locations are a portal read, narrowed by
 * `clientId`; this board is the company's, narrowed by site assignment.
 *
 * ## What makes it scoped
 *
 * The three steps below are the whole authorisation path, and they are worth reading as one
 * expression because that is what makes it auditable:
 *
 * ```ts
 * const scope = resolveSiteBoardScope(user.role, user.id, DUMMY.sites); // 1 + 2
 * const board = readScopedSiteBoard(scope, { … });                     // 3
 * ```
 *
 * 1. **Resolution, on the server, from the session user's own id.** `Site.supervisorIds` says who
 *    is responsible for which site; that list is read here and nowhere else. Not from the request,
 *    not from a query parameter, and deliberately not from the session payload — `SessionUser` has
 *    no `siteIds` field, and adding one would carry a derived, staling list of site ids into the one
 *    object that crosses into the client bundle.
 * 2. **`resolveScope`** folds that list and the role into a `Scope`. A supervisor or site manager
 *    gets `sitesScope(theirIds)`, so a caller with no assignments gets `sitesScope([])`.
 * 3. **`scopeFilter(scope, target)`** builds the predicate, and the read applies it. `Site` is read
 *    through the `"site"` target, which narrows on `_id`; the post-coverage and deployment rows are
 *    read through `"child"`, which narrows on `siteId`.
 *
 * A supervisor with no assigned sites therefore gets `{ _id: { $in: [] } }` — a filter that matches
 * nothing — and renders the empty state below, which explains that there is nothing assigned. Not
 * the company's list, and not a crash.
 *
 * **The organisation-wide roles reach this page too**, and correctly so: they pass the gate, they
 * hold `sites:read`, and `resolveScope` gives them `organization`, whose filter is `{}` — the whole
 * company. That is not the narrowing failing to apply; it is the composed guarantee in
 * `permissions.ts` being true. One board, one code path, and the scope decides what is in it.
 *
 * `hasOrgWideScope()` is deliberately absent. A page that reads *scoped* rows narrows in its query
 * and does not assert org-wide access; the two checks belong to unscoped pages only
 * (docs/rbac.md, "Unscoped reads").
 *
 * ## Why there is no poll on this page
 *
 * The live board and the dashboard poll because their figures come off the roster and change every
 * minute. This board reads the same module-level demo dataset, so a `router.refresh()` would
 * re-render byte-identical output while a `RefreshIndicator` beside it claimed "auto-refresh every
 * 30s" — a false statement about data that cannot change, printed by the exact component this
 * product built to be honest about staleness. The screen says what it is instead, in the header and
 * in the note at the foot. When this page reads a service, `LivePoll` and `RefreshIndicator` come
 * with it.
 *
 * ## Notifications are not on this board
 *
 * `dummyNotifications` is scoped by `recipientId`, not by site, so a site-scoped caller reading it
 * here would need a recipient filter that has nothing to do with the scope above. They are not part
 * of this page; `/notifications` is where a supervisor's own alerts are.
 */
export default async function SitesPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { user } = session;

  // Two rejections, and they fail for different reasons.
  //
  // `sites:read` answers "may this role see site records at all"; scope answers how many, and the
  // narrowing happens in the query rather than here. A guard holds neither and belongs on the duty
  // card, so that is a redirect and not a 403.
  //
  // A client role holds `sites:read` and still does not belong here. `CLIENT_NAV_SECTIONS` points
  // them at `/portal/sites`, and the difference between the two routes is not cosmetic: this is the
  // company's directory of client locations, scoped by the caller's own site assignment, while a
  // client's own buildings are read through their `clientId` from the portal. The nav item was
  // hidden for a client while the route stayed reachable by URL — a gate that only convenience
  // enforces. That was safe while this page rendered no records; it is not safe now, and this is
  // the check that keeps it from becoming a leak.
  //
  // Not `homeForRole`: this page *is* `homeForRole` for `supervisor` and `site_manager` (see the
  // note on `homeForRole` above), so the bare mapping could redirect them straight back here. It
  // cannot today — both hold `sites:read` — but `safeHomeForRole` is what makes that true of every
  // role rather than of the two that happen to pass the check above.
  if (isClientRole(user.role) || !can(user.role, "sites:read")) {
    redirect(safeHomeForRole(user.role, "/sites"));
  }

  // ── The tenant control. Everything below reads `rows`, and `rows` is already scoped. ──────────
  const scope = resolveSiteBoardScope(user.role, user.id, DUMMY.sites);
  const board = readScopedSiteBoard(scope, {
    sites: DUMMY.sites,
    posts: dummyCoverage,
    deployments: dummyDeployment,
  });
  const rows = buildSiteRows({
    sites: board.sites,
    clients: DUMMY.clients,
    posts: board.posts,
    deployments: board.deployments,
  });

  // The counters are the read as much as the table below them: a post count is a staffing figure
  // for another client, so they are counted from the scoped rows and from nothing else.
  const uncovered = countFindings(rows, "uncovered");
  const partial = countFindings(rows, "partial");
  const late = countFindings(rows, "late");
  const absent = countFindings(rows, "absent");

  // An empty board means two different things, and the difference is the caller's own scope rather
  // than anything about the data. A site-scoped caller with no assignments is told so, with the
  // reason it is not a bug; an org-wide caller looking at an empty company directory is told that.
  // Reading it off the scope rather than the role keeps that a scope question.
  const companyWide = isOrganizationWide(scope);
  const emptyState = companyWide
    ? {
        title: "No sites on file",
        description:
          "The company directory is empty. Sites appear here once a company admin creates them and assigns their supervisors.",
      }
    : {
        title: "No sites are assigned to you",
        description:
          "This board lists only the sites you are responsible for, and none are assigned to you yet. A company admin assigns them from each site's supervisor list.",
      };

  return (
    <>
      <PageHeader
        eyebrow="Directory"
        title="Your sites"
        description={
          companyWide
            ? "Every site the company serves, and what is uncovered at each. Problems first."
            : "The sites you are responsible for, and what is uncovered at each. Problems first."
        }
        actions={
          <p className="flex items-center gap-1.5 text-2xs text-foreground-subtle">
            <Database aria-hidden className="size-3.5 shrink-0" />
            Static snapshot{" · "}
            <span className="font-mono">refreshes only on reload</span>
          </p>
        }
      />

      <MetricRow className="mb-5">
        <Metric
          label={companyWide ? "Sites" : "Your sites"}
          value={rows.length}
          tone="neutral"
        />
        <Metric
          label="Uncovered posts"
          value={uncovered}
          tone={uncovered > 0 ? "critical" : "covered"}
          emphasis={uncovered > 0}
          hint="no guard present"
        />
        <Metric
          label="Below requirement"
          value={partial}
          tone={partial > 0 ? "attention" : "covered"}
          emphasis={partial > 0}
          hint="partially covered"
        />
        <Metric
          label="Late"
          value={late}
          tone={late > 0 ? "attention" : "covered"}
          emphasis={late > 0}
          hint="past grace period"
        />
        <Metric
          label="Absent"
          value={absent}
          tone={absent > 0 ? "critical" : "covered"}
          emphasis={absent > 0}
          hint="no check-in"
        />
      </MetricRow>

      <SectionHeading
        title={companyWide ? "Company sites" : "Assigned sites"}
        count={rows.length}
      />
      <SiteBoard rows={rows} emptyState={emptyState} />

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="label-block">About this view</CardTitle>
        </CardHeader>
        <CardContent className="p-3.5">
          <p className="text-xs leading-relaxed text-foreground-muted">
            Coverage is counted per post from guard check-ins, not from
            confirmed physical presence, and this screen does not refresh while
            it is open — reload it for a new reading. A post with no guards
            required to staff it is not counted as uncovered. Everything shown
            is narrowed to the sites assigned to you.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

/** Sums a finding's `count` across the scoped rows. */
function countFindings(
  rows: ReturnType<typeof buildSiteRows>,
  kind: "uncovered" | "partial" | "late" | "absent",
): number {
  return rows.reduce(
    (total, row) =>
      total +
      row.findings
        .filter((finding) => finding.kind === kind)
        .reduce((sum, finding) => sum + finding.count, 0),
    0,
  );
}
