import { redirect } from "next/navigation";
import { DeploymentList } from "@/components/deployment/deployment-board";
import { PageHeader, SectionHeading } from "@/components/layout/page-header";
import { LivePoll } from "@/components/shared/live-poll";
import { RefreshIndicator } from "@/components/shared/refresh-indicator";
import { CoverageBar } from "@/components/status/post-occupancy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Metric, MetricRow } from "@/components/ui/metric";
import { DEPLOYMENT_POLL_INTERVAL_MS } from "@/constants/domain";
import { NO_ACCESS_ROUTE, safeHomeForRole } from "@/constants/navigation";
import { DUMMY, dummyCoverage, dummyDeployment } from "@/data/dummy";
import { can, isClientRole } from "@/lib/permissions";
import { getSession } from "@/server/auth/session";

/**
 * Client portal overview.
 *
 * A client is not an operator. They do not want a deployment console — they want one question
 * answered: **is my building covered right now?** Everything else is subordinate to that.
 *
 * Two deliberate restrictions:
 *
 * - **Only this client's rows.** Every filter below is on `session.user.clientId`. A client must
 *   never see another client's names, sites or guard headcount, and the filter is applied to the
 *   array before anything is rendered rather than being trusted to a component.
 * - **No staffing data.** Guard counts by site are commercially sensitive and operationally
 *   pointless for the client, so station-level required counts are reduced to covered / not
 *   covered here. Full detail lives in the company's own views.
 */
export default async function PortalOverviewPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { user } = session;

  // Class boundary: `/portal` is a client surface, not a general capability surface.
  //
  // A capability grant is not an invitation to a particular screen. The presence of `coverage:read`
  // on supervisor and site_manager roles is intentional — those roles legitimately need it for the
  // company's own surface (`/dashboard/coverage`), not for the client's personal coverage view.
  // Resolving those site-scoped roles yields `sitesScope(siteIds)`, not `clientScope`, and site
  // membership itself is sourced from `Site.supervisorIds` rather than `user.clientId`. Treating a
  // nullable `user.clientId` as proof of "being a client" conflates a data-modelling quirk with an
  // authorization boundary. A `clientId` on a non-client user does not make them a client, and
  // widening this page to such a role would blur the separation between company surfaces and the
  // client's own view.
  //
  // Gate in this order to enforce that boundary while keeping redirects safe:
  //
  // 1. **Role class first.** Only client roles may access the client portal. If the user is not a
  //    client, they are sent to their own home via `safeHomeForRole` (not this page). This prevents
  //    site-scoped operators from entering a client view even if they also hold `coverage:read` and
  //    happen to have a `clientId`.
  // 2. **Capability second.** Even client roles must be able to read coverage; if not, send them to
  //    their home for their role (using `safeHomeForRole` to avoid self-redirect loops).
  // 3. **Identity last.** With only client roles remaining, a missing `clientId` means the account
  //    is not attached to any client. Since the client portal cannot render scoped rows without that
  //    key (and every row below is filtered on `session.user.clientId`), there is no safe target on
  //    this surface — redirect to `NO_ACCESS_ROUTE`. This collapses the previous ternary because
  //    non-client roles were already excluded in step 1.
  if (!isClientRole(user.role)) {
    redirect(safeHomeForRole(user.role, "/portal"));
  }
  if (!can(user.role, "coverage:read")) {
    redirect(safeHomeForRole(user.role, "/portal"));
  }
  if (!user.clientId) {
    redirect(NO_ACCESS_ROUTE);
  }

  // Tenant scoping. One filter, applied first, so no later branch can forget it.
  const clientId = user.clientId;
  const rows = dummyDeployment.filter((row) => row.clientId === clientId);
  const stations = dummyCoverage.filter((c) => c.clientId === clientId);

  const onDuty = rows.filter(
    (r) => r.status === "on_duty" || r.status === "late",
  ).length;
  const incidents = rows.filter(
    (r) => r.status === "late" || r.status === "absent",
  ).length;
  const uncovered = stations.filter((c) => c.coverageStatus !== "covered");
  const sites = new Set(rows.map((r) => r.siteId)).size;

  const client = DUMMY.clients.find((c) => c.id === clientId);

  return (
    <>
      <LivePoll intervalMs={DEPLOYMENT_POLL_INTERVAL_MS} />

      <PageHeader
        eyebrow={client?.name ?? "Your account"}
        title="Your security coverage"
        description={`Provided by ${user.organizationName}.`}
        actions={
          <>
            <RefreshIndicator
              generatedAt={new Date()}
              intervalMs={DEPLOYMENT_POLL_INTERVAL_MS}
            />
            {can(user.role, "reports:export") ? (
              <Button asChild size="sm" variant="ghost">
                <a href="/portal/reports">Reports</a>
              </Button>
            ) : null}
          </>
        }
      />

      <MetricRow className="mb-5">
        <Metric label="Guards on duty" value={onDuty} tone="covered" />
        <Metric label="Sites covered" value={sites} tone="neutral" />
        <Metric
          label="Posts uncovered"
          value={uncovered.length}
          tone={uncovered.length > 0 ? "critical" : "covered"}
          emphasis={uncovered.length > 0}
        />
        <Metric
          label="Attention items"
          value={incidents}
          tone={incidents > 0 ? "attention" : "covered"}
          emphasis={incidents > 0}
          hint="lateness or absence today"
        />
      </MetricRow>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <SectionHeading title="On duty now" count={rows.length} />
          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <CardContent className="py-8 text-center text-sm text-foreground-muted">
                No guards are rostered for your sites right now.
              </CardContent>
            ) : (
              <DeploymentList rows={rows} />
            )}
          </Card>
        </div>

        <div>
          <SectionHeading title="Posts at your sites" count={stations.length} />
          <Card>
            <ul className="divide-y divide-border-base">
              {stations.map((station) => (
                <li
                  key={station.stationId}
                  className="flex items-center gap-3 px-3.5 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {station.station}
                    </p>
                    <p className="truncate text-2xs text-foreground-subtle">
                      {station.site}
                    </p>
                  </div>
                  <div className="w-28 shrink-0">
                    {/* Required counts are deliberately not surfaced to the client; the bar shows
                        presence against requirement without publishing the headcount itself. */}
                    <CoverageBar
                      required={station.required}
                      assigned={station.present}
                      present={station.present}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right font-mono text-2xs text-foreground-muted">
                    {station.coverageStatus === "covered" ? "covered" : "gap"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="mt-4">
            <CardHeader className="border-b border-border-base py-2.5">
              <CardTitle className="label-block">About this view</CardTitle>
            </CardHeader>
            <CardContent className="p-3.5">
              <p className="text-xs leading-relaxed text-foreground-muted">
                Figures refresh every 30 seconds while this page is open and in
                view. They reflect guard check-ins, not confirmed physical
                presence. If a guard is marked on duty but has left their post,
                report it through your usual channel.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
