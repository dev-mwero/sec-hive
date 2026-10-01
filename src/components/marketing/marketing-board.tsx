import { DeploymentBoard } from "@/components/deployment/deployment-board";
import { RefreshIndicator } from "@/components/shared/refresh-indicator";
import { Badge } from "@/components/ui/badge";
import { formatShiftWindow, materialiseShiftWindow } from "@/lib/time";
import type { DeploymentRow } from "@/types/domain";

/**
 * Hero proof: the real Live Deployment board, not a mock-up of it.
 *
 * Marketing copy claims a product exists. Rendering the actual `DeploymentBoard` component is the
 * only way that claim stays true as the board changes — a screenshot or a hand-built imitation
 * drifts the moment someone edits the table.
 *
 * Two deliberate constraints:
 *
 * - **Its own dataset.** It does not import `src/data/dummy.ts`. That module is development-only by
 *   documented policy, and a public marketing route has no business reaching it. The rows below are
 *   written out here and are plainly illustrative.
 * - **Plainly labelled.** The caption says these are sample rows. A demo that looks live but is not
 *   would be the exact dishonesty the rest of this product is careful to avoid — the refresh
 *   indicator on the app's own board states its cadence for the same reason.
 */
export function MarketingBoard() {
  return (
    <figure className="panel overflow-hidden">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-border-base px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <p className="label-block">Live deployment</p>
          <Badge variant="outline" size="sm">
            Sample data
          </Badge>
        </div>
        <RefreshIndicator generatedAt={new Date()} intervalMs={30_000} />
      </figcaption>

      <DeploymentBoard rows={illustrativeRows()} />
    </figure>
  );
}

/**
 * Six rows chosen to show the board doing its job: a fully staffed gate, a late guard, a healthy
 * single post, and a station nobody turned up for. A demo showing only the happy path would hide
 * the reason the product exists.
 */
function illustrativeRows(): DeploymentRow[] {
  const specs: Spec[] = [
    // Main Gate needs two guards and has two: the slot meter reads full, which is what a healthy
    // site looks like.
    {
      index: 1,
      client: "ABC Manufacturing",
      site: "Headquarters",
      station: "Main Gate",
      required: 2,
      guard: "John Mwangi",
      employeeNumber: "SG-014",
      checkInMinutes: 357,
    },
    {
      index: 2,
      client: "ABC Manufacturing",
      site: "Headquarters",
      station: "Main Gate",
      required: 2,
      guard: "David Otieno",
      employeeNumber: "SG-033",
      checkInMinutes: 369,
    },
    {
      index: 3,
      client: "ABC Manufacturing",
      site: "Headquarters",
      station: "Rear Gate",
      required: 1,
      guard: "Peter Kamau",
      employeeNumber: "SG-021",
      status: "late",
      checkInMinutes: 391,
    },
    {
      index: 4,
      client: "ABC Manufacturing",
      site: "Warehouse",
      station: "Loading Bay",
      required: 1,
      guard: "Mercy Wanjiku",
      employeeNumber: "SG-068",
      checkInMinutes: 352,
    },
    {
      index: 5,
      client: "Mombasa International School",
      site: "Main Campus",
      station: "Gate A",
      required: 2,
      guard: "Brian Kiplagat",
      employeeNumber: "SG-071",
      status: "absent",
      checkInMinutes: undefined,
    },
  ];

  return buildRows(specs);
}

type Spec = {
  index: number;
  client: string;
  site: string;
  station: string;
  required: number;
  guard: string;
  employeeNumber: string;
  status?: DeploymentRow["status"];
  /** Minutes past midnight for the check-in. Omit for `absent`. */
  checkInMinutes?: number;
};

/**
 * Occupancy is aggregated per station before any row is built.
 *
 * Counting presence row-by-row would show two guards on a two-person gate as "1 / 2" on both
 * rows — the board would contradict itself, and the occupancy meter would understate coverage at
 * exactly the site that is fine.
 */
function buildRows(specs: Spec[]): DeploymentRow[] {
  const presentByStation = new Map<string, number>();

  for (const spec of specs) {
    const status = spec.status ?? "on_duty";
    if (status === "on_duty" || status === "late") {
      const key = stationKey(spec);
      presentByStation.set(key, (presentByStation.get(key) ?? 0) + 1);
    }
  }

  return specs.map((spec) =>
    toRow(spec, presentByStation.get(stationKey(spec)) ?? 0),
  );
}

function stationKey(spec: Spec): string {
  return `${spec.client}/${spec.site}/${spec.station}`;
}

function toRow(spec: Spec, present: number): DeploymentRow {
  const status = spec.status ?? "on_duty";

  // Day shift, 06:00–18:00, pinned to today so the sample never shows a date that has passed.
  const shiftStart = 6 * 60;
  const shiftEnd = 18 * 60;
  const { scheduledStart, scheduledEnd } = materialiseShiftWindow(
    isoToday(),
    shiftStart,
    shiftEnd,
  );

  const actualCheckIn =
    spec.checkInMinutes === undefined
      ? null
      : new Date(
          scheduledStart.getTime() +
            (spec.checkInMinutes - shiftStart) * 60_000,
        );

  return {
    assignmentId: `sample-${spec.index}`,
    clientId: `sample-client-${spec.client}`,
    client: spec.client,
    siteId: `sample-site-${spec.client}-${spec.site}`,
    site: spec.site,
    stationId: `sample-station-${stationKey(spec)}`,
    station: spec.station,
    guardId: `sample-guard-${spec.employeeNumber}`,
    guard: spec.guard,
    employeeNumber: spec.employeeNumber,
    shiftId: "sample-shift-day",
    shift: "Day Shift",
    shiftWindow: formatShiftWindow(shiftStart, shiftEnd),
    supervisorId: null,
    supervisor: null,
    scheduledStart,
    scheduledEnd,
    actualCheckIn,
    actualCheckOut: null,
    status,
    statusLabel: status,
    stationRequiredCount: spec.required,
    stationPresentCount: Math.min(present, spec.required),
  };
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
