import { PostOccupancy } from "@/components/status/post-occupancy";
import { StatusText } from "@/components/status/status-badge";
import {
  assignmentStatusStyle,
  TONE_EDGE_CLASSES,
} from "@/components/status/status-styles";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatHHMM, timeToMinutes } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { DeploymentRow } from "@/types/domain";

/**
 * **Live Deployment** — SecHive's primary operational screen.
 *
 * Its single job is to answer, in seconds: *who is guarding what, right now?*
 *
 * Design decisions driven by that job:
 *
 * - **Grouped by client, then site.** An operator thinks "what's happening at ABC", not "what is
 *   assignment 47 doing". Flat alphabetical grouping by guard would make them scan every row.
 * - **Status is the dominant column**, carried by a left row rule, an icon and an uppercase
 *   label. The row can be triaged from the edge of the screen without reading any text.
 * - **Post occupancy is inline with each row**, so "the Rear Gate is uncovered" is visible in the
 *   same glance as "Peter Kamau is late". Those two facts are what a supervisor acts on together.
 * - **Problems sort first.** Within a site, `absent` and `late` rise above `on_duty`. An operator
 *   opening this screen is looking for exceptions; making them hunt through healthy rows would
 *   defeat the screen.
 * - **Shift times are pre-formatted server-side**, so the column is pure mono and the times align.
 */
export function DeploymentBoard({
  rows,
  emptyState,
}: {
  rows: DeploymentRow[];
  emptyState?: { title: string; description: string };
}) {
  if (rows.length === 0) {
    return (
      <div className="panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Station</TableHead>
              <TableHead>Guard</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableEmpty
              colSpan={6}
              title={emptyState?.title ?? "No deployments for this date"}
              description={
                emptyState?.description ??
                "Nothing is rostered for the selected date. Create a duty assignment to start covering a post."
              }
            />
          </TableBody>
        </Table>
      </div>
    );
  }

  const groups = groupByClientAndSite(rows);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key} className="panel overflow-hidden">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-base px-3.5 py-2.5">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {group.client}
                <span className="mx-2 text-foreground-subtle" aria-hidden>
                  /
                </span>
                <span className="text-foreground-muted">{group.site}</span>
              </h3>
            </div>
            <div className="flex items-center gap-3">
              <p className="font-mono text-2xs text-foreground-subtle">
                {group.rows.length} {group.rows.length === 1 ? "post" : "posts"}
              </p>
              <SiteFlags group={group} />
            </div>
          </header>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[16%]">Station</TableHead>
                <TableHead className="w-[20%]">Guard</TableHead>
                <TableHead className="w-[14%]">Shift</TableHead>
                <TableHead className="w-[15%]">Post</TableHead>
                <TableHead className="w-[12%]">Status</TableHead>
                <TableHead className="w-[12%]">Reported</TableHead>
                <TableHead className="w-[11%]">Ends</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.rows.map((row) => (
                <DeploymentRowView key={row.assignmentId} row={row} />
              ))}
            </TableBody>
          </Table>
        </section>
      ))}
    </div>
  );
}

function DeploymentRowView({ row }: { row: DeploymentRow }) {
  const style = assignmentStatusStyle(row.status);

  return (
    <TableRow statusRule={TONE_EDGE_CLASSES[style.tone]}>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{row.station}</span>
          {/* Uncovered posts are hatched in the cell as well as on the left rule, so the
              condition survives being read in isolation or in a screenshot. */}
          {row.stationPresentCount === 0 && row.stationRequiredCount > 0 ? (
            <Badge variant="critical" size="sm">
              Uncovered
            </Badge>
          ) : null}
        </div>
      </TableCell>

      <TableCell>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.guard}</p>
          <p className="font-mono text-2xs text-foreground-subtle">
            {row.employeeNumber}
          </p>
        </div>
      </TableCell>

      <TableCell>
        <p className="truncate text-xs text-foreground-muted">{row.shift}</p>
        <p className="font-mono text-2xs text-foreground-subtle">
          {row.shiftWindow}
        </p>
      </TableCell>

      <TableCell>
        <PostOccupancy
          required={row.stationRequiredCount}
          present={row.stationPresentCount}
          size="sm"
        />
      </TableCell>

      <TableCell>
        <StatusText style={style} />
      </TableCell>

      <TableCell>
        <span className="font-mono text-xs">
          {row.actualCheckIn
            ? formatHHMM(timeToMinutes(row.actualCheckIn))
            : "—"}
        </span>
        {row.actualCheckIn && style.value === "late" ? (
          <LatenessNote row={row} />
        ) : null}
      </TableCell>

      <TableCell>
        <span className="font-mono text-xs">
          {formatHHMM(timeToMinutes(row.scheduledEnd))}
        </span>
      </TableCell>
    </TableRow>
  );
}

/**
 * How late, in minutes past the grace period.
 *
 * Shown because "LATE" alone does not tell a supervisor whether to send a relief guard now or
 * wait — eleven minutes late is a different operational decision from fifty.
 */
function LatenessNote({ row }: { row: DeploymentRow }) {
  if (!row.actualCheckIn) {
    return null;
  }
  const grace = 5;
  const lateBy = Math.round(
    (row.actualCheckIn.getTime() - row.scheduledStart.getTime()) / 60_000 -
      grace,
  );

  if (lateBy <= 0) {
    return null;
  }

  return <p className="font-mono text-2xs text-attention">+{lateBy}m late</p>;
}

/**
 * Site-level flags. A site header can say "2 uncovered" once, instead of the operator
 * reconstructing it from the rows.
 */
function SiteFlags({ group }: { group: DeploymentGroup }) {
  const uncovered = group.rows.filter(
    (r) => r.stationRequiredCount > 0 && r.stationPresentCount === 0,
  ).length;
  const late = group.rows.filter((r) => r.status === "late").length;
  const absent = group.rows.filter((r) => r.status === "absent").length;

  if (uncovered === 0 && late === 0 && absent === 0) {
    return <span className="label-block text-covered">All posts covered</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {uncovered > 0 ? (
        <Badge variant="critical" size="sm">
          {uncovered} uncovered
        </Badge>
      ) : null}
      {late > 0 ? (
        <Badge variant="attention" size="sm">
          {late} late
        </Badge>
      ) : null}
      {absent > 0 ? (
        <Badge variant="critical" size="sm">
          {absent} absent
        </Badge>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

type DeploymentGroup = {
  key: string;
  client: string;
  site: string;
  rows: DeploymentRow[];
};

/** Severity order for problem-first sorting. Lower sorts first. */
const STATUS_PRIORITY: Record<string, number> = {
  absent: 0,
  late: 1,
  on_duty: 2,
  checked_out: 3,
  scheduled: 4,
  completed: 5,
  cancelled: 6,
};

export function groupByClientAndSite(rows: DeploymentRow[]): DeploymentGroup[] {
  const groups = new Map<string, DeploymentGroup>();

  for (const row of rows) {
    const key = `${row.clientId}:${row.siteId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(key, {
        key,
        client: row.client,
        site: row.site,
        rows: [row],
      });
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    rows: [...group.rows].sort(
      (a, b) =>
        (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9) ||
        a.station.localeCompare(b.station),
    ),
  }));
}

/** Used by the client portal, which shows a flatter, narrower version of the same data. */
export function DeploymentList({ rows }: { rows: DeploymentRow[] }) {
  return (
    <ul className="divide-y divide-border-base">
      {rows.map((row) => {
        const style = assignmentStatusStyle(row.status);
        return (
          <li
            key={row.assignmentId}
            className="flex items-center gap-3 px-3.5 py-2.5"
          >
            <span
              aria-hidden
              className={cn(
                "h-8 w-[3px] shrink-0 rounded-full",
                TONE_EDGE_CLASSES[style.tone],
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {row.guard}
              </p>
              <p className="truncate text-2xs text-foreground-subtle">
                {row.station} · {row.shiftWindow ?? row.shift}
              </p>
            </div>
            <StatusText style={style} />
          </li>
        );
      })}
    </ul>
  );
}
