import { ArrowRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeploymentList } from "@/components/deployment/deployment-board";
import { PageHeader, SectionHeading } from "@/components/layout/page-header";
import { LivePoll } from "@/components/shared/live-poll";
import { RefreshIndicator } from "@/components/shared/refresh-indicator";
import { CoverageBar } from "@/components/status/post-occupancy";
import { StatusText } from "@/components/status/status-badge";
import { assignmentStatusStyle } from "@/components/status/status-styles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Metric, MetricRow } from "@/components/ui/metric";
import { DASHBOARD_POLL_INTERVAL_MS } from "@/constants/domain";
import { homeForRole } from "@/constants/navigation";
import {
  dummyCoverage,
  dummyDeployment,
  dummyNotifications,
} from "@/data/dummy";
import { getSession } from "@/server/auth/session";

/**
 * Dashboard — the company's daily reading.
 *
 * Answers one question before anything else: *is every post covered right now?* Four counters, a
 * coverage ledger, then the exceptions list. Deployment detail lives on `/dashboard/live`; this
 * page is the summary an owner or admin reads in ten seconds.
 */
export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Guards and client users have their own surfaces. Redirecting beats rendering a screen of
  // zeroes for a role that has no data on this page.
  const home = homeForRole(session.user.role);
  if (home !== "/dashboard") {
    redirect(home);
  }

  const generatedAt = new Date();

  const rows = dummyDeployment;
  const onDuty = rows.filter((r) => r.status === "on_duty").length;
  const late = rows.filter((r) => r.status === "late").length;
  const absent = rows.filter((r) => r.status === "absent").length;
  const uncovered = dummyCoverage.filter((c) => c.coverageStatus !== "covered");

  const exceptions = rows.filter(
    (r) => r.status === "absent" || r.status === "late",
  );

  const unread = dummyNotifications.filter((n) => n.readAt === null);

  return (
    <>
      <LivePoll intervalMs={DASHBOARD_POLL_INTERVAL_MS} />

      <PageHeader
        eyebrow="Operations"
        title="Deployment overview"
        description="Every post across every client at one reading. Problems first."
        actions={
          <>
            <RefreshIndicator
              generatedAt={generatedAt}
              intervalMs={DASHBOARD_POLL_INTERVAL_MS}
            />
            <Link href="/dashboard/live" className="btn btn-ghost btn-sm">
              Live board
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </>
        }
      />

      <MetricRow className="mb-5">
        <Metric
          label="On duty"
          value={onDuty}
          tone="covered"
          hint={`of ${rows.length} rostered`}
        />
        <Metric
          label="Late"
          value={late}
          tone={late > 0 ? "attention" : "neutral"}
          emphasis={late > 0}
          hint="past grace period"
        />
        <Metric
          label="Absent"
          value={absent}
          tone={absent > 0 ? "critical" : "neutral"}
          emphasis={absent > 0}
          hint="no check-in"
        />
        <Metric
          label="Uncovered posts"
          value={uncovered.length}
          tone={uncovered.length > 0 ? "critical" : "covered"}
          emphasis={uncovered.length > 0}
          hint="below required guard count"
        />
      </MetricRow>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div>
          <SectionHeading
            title="Coverage by station"
            count={dummyCoverage.length}
            action={
              <Link
                href="/dashboard/coverage"
                className="text-2xs text-foreground-subtle transition-colors hover:text-foreground"
              >
                Full report →
              </Link>
            }
          />
          <Card>
            <ul className="divide-y divide-border-base">
              {uncovered.length === 0 ? (
                <li className="px-3.5 py-6 text-center text-sm text-foreground-muted">
                  Every station is covered at its required guard count.
                </li>
              ) : (
                uncovered.map((station) => (
                  <li
                    key={station.stationId}
                    className="flex flex-wrap items-center gap-3 px-3.5 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {station.station}
                      </p>
                      <p className="truncate text-2xs text-foreground-subtle">
                        {station.client} · {station.site}
                      </p>
                    </div>
                    <div className="w-36">
                      <CoverageBar
                        required={station.required}
                        assigned={station.assigned}
                        present={station.present}
                      />
                    </div>
                    <Badge
                      variant={
                        station.coverageStatus === "uncovered"
                          ? "critical"
                          : "attention"
                      }
                      size="sm"
                    >
                      {station.present}/{station.required}
                    </Badge>
                  </li>
                ))
              )}
            </ul>
          </Card>

          <SectionHeading
            title="Needs attention"
            count={exceptions.length}
            className="mt-6"
          />
          <Card>
            {exceptions.length === 0 ? (
              <CardContent className="py-6 text-center text-sm text-foreground-muted">
                No late or absent guards right now.
              </CardContent>
            ) : (
              <ul className="divide-y divide-border-base">
                {exceptions.map((row) => (
                  <li
                    key={row.assignmentId}
                    className="flex flex-wrap items-center gap-3 px-3.5 py-2.5"
                  >
                    <TriangleAlert
                      aria-hidden
                      className="size-4 shrink-0 text-attention"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {row.guard}
                      </p>
                      <p className="truncate text-2xs text-foreground-subtle">
                        {row.station} · {row.client}
                      </p>
                    </div>
                    <StatusText style={assignmentStatusStyle(row.status)} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          <SectionHeading
            title="Current deployment"
            count={rows.length}
            action={
              <Link
                href="/dashboard/live"
                className="text-2xs text-foreground-subtle transition-colors hover:text-foreground"
              >
                Full board →
              </Link>
            }
          />
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border-base py-2.5">
              <CardTitle className="label-block">By client and site</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DeploymentList rows={rows} />
            </CardContent>
          </Card>

          <SectionHeading
            title="Recent notifications"
            count={unread.length}
            className="mt-6"
          />
          <Card>
            <ul className="divide-y divide-border-base">
              {dummyNotifications.slice(0, 4).map((note) => (
                <li key={note.id} className="px-3.5 py-2.5">
                  <div className="flex items-start gap-2">
                    {note.readAt === null ? (
                      <span
                        aria-hidden
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                      />
                    ) : (
                      <span aria-hidden className="mt-1.5 w-1.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">
                        {note.title}
                      </p>
                      <p className="truncate text-2xs text-foreground-subtle">
                        {note.body}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
