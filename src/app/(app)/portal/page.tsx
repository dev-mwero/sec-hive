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

  // Two failures, and they do not have the same answer.
  //
  // Failing `coverage:read` means this role simply belongs on another surface — the duty card, the
  // site board — so it is sent to its own home. `safeHomeForRole` rather than `homeForRole`, because
  // a client's home *is* `/portal`, and a redirect from a page to itself is a loop: that is what
  // `/portal` → `/dashboard` → `homeForRole()` → `/portal` was for every client who ever landed
  // here without `coverage:read`.
  if (!can(user.role, "coverage:read")) {
    redirect(safeHomeForRole(user.role, "/portal"));
  }

  // Holding `coverage:read` with nothing to narrow by is the case `resolveScope` already fails closed
  // for — a client user record that has not been attached to a client account — and every row below
  // is filtered on `session.user.clientId`. The honest result would therefore be an empty portal,
  // which to a client is indistinguishable from SecHive being broken.
  if (!user.clientId) {
    // A client role owns no surface but this one, so with no client there is nothing left to send
    // them to and `NO_ACCESS_ROUTE` is the only terminal answer. Any other role is not in the wrong
    // place, it is simply somewhere it does not belong, and its own home is still open to it.
    redirect(
      isClientRole(user.role)
        ? NO_ACCESS_ROUTE
        : safeHomeForRole(user.role, "/portal"),
    );
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
