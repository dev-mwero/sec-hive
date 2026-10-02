import {
  CircleCheck,
  CircleSlash,
  Clock,
  MinusCircle,
  ShieldX,
  UserX,
} from "lucide-react";

import { StatusBadge, StatusText } from "@/components/status/status-badge";
import {
  type StatusStyle,
  TONE_EDGE_CLASSES,
} from "@/components/status/status-styles";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SiteBoardRow, SiteFinding } from "@/lib/site-board";
import { cn } from "@/lib/utils";
import type { Site } from "@/types/domain";

/**
 * **Your sites** — the board a supervisor and a site manager open instead of a company dashboard.
 *
 * Its job is to answer, in one screen: *which of my sites need me right now, and which are fine?*
 *
 * Design decisions driven by that job:
 *
 * - **Problems first.** Sites sort by their worst finding, so a dark post is the first row on the
 *   board rather than the fourth. This is the live board's rule and it is there for the same
 *   reason: an operator opening this screen is looking for exceptions, and making them read past
 *   healthy sites to find one defeats the screen.
 * - **Flat, not grouped by client.** The live board groups because its rows are per-assignment and
 *   an operator thinks "what is happening at ABC". Here the unit is the site and the sort is by
 *   severity, so grouping by client would put every site of one client above a problem in another
 *   and defeat the sort that matters. Client is a column instead.
 * - **The verdict lives in one column.** `Posts` is a measurement — discrete slots, one per post,
 *   hatched where a post is dark, plus the bare guard ratios. `Attention` is the only column that
 *   says what the numbers mean. Splitting a reading from its verdict across two columns is what
 *   stops the board contradicting itself, and the reason `CoverageBar` is not used for the site
 *   cell is in the comment there.
 * - **Status is text + icon + colour**, in both the findings and the site record's own state, for
 *   the same reason as everywhere else in SecHive: colour alone fails roughly one in twelve men
 *   with a colour vision deficiency, and this board decides whether someone gets dispatched.
 */
export function SiteBoard({
  rows,
  emptyState,
}: {
  rows: SiteBoardRow[];
  emptyState: { title: string; description: string };
}) {
  const columns = (
    <TableHeader>
      <TableRow>
        {/* Pairs with the status rule `TableRow` inserts, so the columns line up. */}
        <TableHead className="w-[3px] p-0" aria-hidden />
        <TableHead className="w-[24%]">Site</TableHead>
        <TableHead className="w-[18%]">Client</TableHead>
        <TableHead className="w-[20%]">Address</TableHead>
        <TableHead className="w-[20%]">Posts</TableHead>
        <TableHead className="w-[12%]">Attention</TableHead>
        <TableHead className="w-[9%]">Status</TableHead>
      </TableRow>
    </TableHeader>
  );

  if (rows.length === 0) {
    return (
      <div className="panel">
        <Table>
          {columns}
          <TableBody>
            <TableEmpty
              colSpan={6}
              title={emptyState.title}
              description={emptyState.description}
            />
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <Table>
        {columns}
        <TableBody>
          {rows.map((row) => (
            <SiteBoardRowView key={row.site.id} row={row} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SiteBoardRowView({ row }: { row: SiteBoardRow }) {
  const worst = row.findings[0];

  return (
    <TableRow
      statusRule={
        TONE_EDGE_CLASSES[worst ? FINDING_STYLES[worst.kind].tone : "covered"]
      }
    >
      <TableCell>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {row.site.name}
          </p>
          <p className="font-mono text-2xs text-foreground-subtle">
            {row.site.code ?? "—"}
          </p>
        </div>
      </TableCell>

      <TableCell>
        {row.client ? (
          <span className="truncate text-xs text-foreground-muted">
            {row.client.name}
          </span>
        ) : (
          // A site whose client record is missing is still a site this caller is responsible for,
          // so it is shown and named as unknown. Dropping it would shrink the board to fit the
          // data we happen to have, and the caller would read that as "not my sites".
          <span className="text-xs text-foreground-subtle">Unknown client</span>
        )}
      </TableCell>

      <TableCell>
        {row.site.address ? (
          <span className="truncate text-xs text-foreground-muted">
            {row.site.address}
          </span>
        ) : (
          // Said rather than dashed. Every site in the current dataset has no address on file, and
          // a dash there would read as a rendering failure rather than as the truth: there is no
          // address recorded.
          <span className="text-xs text-foreground-subtle">
            No address on file
          </span>
        )}
      </TableCell>

      <TableCell>
        <PostSlots row={row} />
      </TableCell>

      <TableCell>
        <SiteFindings findings={row.findings} />
      </TableCell>

      <TableCell>
        <StatusText style={SITE_STATUS_STYLES[row.site.status]} />
      </TableCell>
    </TableRow>
  );
}

/**
 * One slot per post, filled where a post is fully covered and hatched where it is not.
 *
 * **Not `PostOccupancy`, and not `CoverageBar`.** Both take guard counts and both derive a verdict
 * from them, which is right for a single post and wrong for a site. A site with two two-guard posts
 * — one full, one with nobody at it — is `2 of 4` present, and an aggregate says exactly the same
 * thing about it as it does about two two-guard posts with one guard in each. `CoverageBar` would
 * additionally print its own verdict in the same cell as this board's findings, so a site with one
 * overstaffed post and one dark post would read `COVERED` and `1 UNCOVERED` in two columns of the
 * same row. Slots per post cannot contradict the findings column, because the thing being counted
 * is the thing being reported on.
 *
 * The guard ratios are printed as bare numbers with no verdict attached: `assigned` is in the
 * tooltip because "booked but not yet arrived" is not an exception and has no badge, and `required`
 * is what makes a shortfall mean anything.
 */
function PostSlots({ row }: { row: SiteBoardRow }) {
  if (row.postsTotal === 0) {
    // A site with no posts is not covered and not uncovered: there is nothing there to cover. Said
    // as a fact, with no badge, because turning a missing configuration into an alarm trains the
    // reader to ignore the badges that mean something.
    return (
      <span
        className="text-xs text-foreground-subtle"
        title="No posts are defined at this site"
      >
        No posts defined
      </span>
    );
  }

  // Whether an empty slot is hatched is read from the site's findings rather than recomputed from
  // the slot counts, so the slots and the verdict in the next column are the same statement made
  // twice and cannot drift apart.
  const dark = row.findings.some((finding) => finding.kind === "uncovered");

  // Slot identity is positional by nature — slot 3 is the third post at the site — so the key is
  // derived from the position rather than being the position, the same bargain `PostOccupancy`
  // makes. The slots are drawn from the post count, not from a list of posts, because the rollup
  // deliberately does not carry each post's id: a slot says "a post here is not covered", and which
  // post it is belongs to the site view that does not exist yet.
  const slots = Array.from({ length: row.postsTotal }, (_, index) => ({
    id: `slot-${index}`,
    filled: index < row.postsCovered,
  }));

  return (
    <div
      className="min-w-0"
      title={`${row.assigned} assigned, ${row.present} present, ${row.required} required`}
    >
      <span
        role="img"
        aria-label={`${row.postsCovered} of ${row.postsTotal} posts fully covered`}
        className="flex items-center gap-[3px]"
      >
        {slots.map((slot) => (
          <span
            key={slot.id}
            aria-hidden
            className={cn(
              "h-3 w-2.5 rounded-[2px] border",
              slot.filled
                ? "border-covered/40 bg-covered"
                : dark
                  ? "border-critical/30 bg-critical-subtle hatch-uncovered"
                  : "border-border-base bg-surface-inset",
            )}
          />
        ))}
      </span>
      <p className="mt-1 font-mono text-2xs whitespace-nowrap text-foreground-muted">
        {row.postsCovered}/{row.postsTotal} posts
      </p>
      <p className="font-mono text-2xs whitespace-nowrap text-foreground-subtle">
        {row.present}/{row.required} guards
      </p>
    </div>
  );
}

/**
 * The board's verdict, and the only place one is stated.
 *
 * Clean sites say so in words rather than rendering nothing, because a supervisor comparing this
 * board against the live one needs to see that a site was checked and found healthy — the same
 * reason the live board prints "All posts covered" on a site header.
 */
function SiteFindings({ findings }: { findings: SiteFinding[] }) {
  if (findings.length === 0) {
    return <span className="label-block text-covered">All posts covered</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {findings.map((finding) => {
        const style = FINDING_STYLES[finding.kind];
        return (
          <StatusBadge
            key={finding.kind}
            style={style}
            size="sm"
            label={
              finding.kind === "inactive"
                ? style.label
                : `${finding.count} ${style.label}`
            }
          />
        );
      })}
    </div>
  );
}

/**
 * What each finding looks like, and what it means.
 *
 * The icons are the existing coverage and assignment sets rather than new glyphs: an uncovered post
 * is the same condition whether you meet it on the live board or here, and a reader who has
 * learned `ShieldX` on one screen should not have to learn it again on this one.
 *
 * `PARTIAL` is the short form of the domain's `partially_covered` — a badge reading
 * "1 PARTIALLY COVERED" would be true and unreadable. The full term is in the description, which is
 * what a pointer reads.
 */
const FINDING_STYLES: Record<SiteFinding["kind"], StatusStyle> = {
  uncovered: {
    value: "uncovered",
    label: "UNCOVERED",
    tone: "critical",
    icon: ShieldX,
    description: "Posts that require a guard and have nobody present at them.",
  },
  partial: {
    value: "partial",
    label: "PARTIAL",
    tone: "attention",
    icon: MinusCircle,
    description:
      "Posts with guards present but below their required guard count — partially covered.",
  },
  absent: {
    value: "absent",
    label: "ABSENT",
    tone: "critical",
    icon: UserX,
    description:
      "Guards rostered to this site who did not report for their shift.",
  },
  late: {
    value: "late",
    label: "LATE",
    tone: "attention",
    icon: Clock,
    description:
      "Guards who reported after their shift started plus the grace period.",
  },
  inactive: {
    value: "inactive",
    label: "INACTIVE",
    tone: "neutral",
    icon: CircleSlash,
    description:
      "The site record is deactivated, so nothing here is being staffed. Information, not an alarm.",
  },
};

/**
 * The site record's own state, which is a different question from its coverage.
 *
 * `Site.status` is `active | inactive` — the two values `RESOURCE_STATUSES` already fixes in
 * `constants/domain.ts` — and the labels are local rather than a `*_LABELS` map there because
 * that file is the domain's single source of truth and adding a member to it is not a decision this
 * page gets to make. If a site status ever has to appear in an API response or a CSV, promote these
 * two labels into `constants/domain.ts` rather than importing them from a component.
 *
 * `inactive` is neutral rather than an alarm, for the same reason `cancelled` is neutral on the
 * live board: a deactivated site is information about the record, not a guard who did not turn up.
 * It is a finding, so it still floats to the top of the sort, but it is never the reason a supervisor
 * is sent somewhere.
 */
const SITE_STATUS_STYLES: Record<Site["status"], StatusStyle> = {
  active: {
    value: "active",
    label: "ACTIVE",
    tone: "covered",
    icon: CircleCheck,
    description: "The site is in service.",
  },
  inactive: {
    value: "inactive",
    label: "INACTIVE",
    tone: "neutral",
    icon: CircleSlash,
    description: "The site record is deactivated.",
  },
};
