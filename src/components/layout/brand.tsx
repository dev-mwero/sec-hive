import type { Role } from "@/constants/domain";
import { ROLE_LABELS } from "@/constants/domain";
import { cn } from "@/lib/utils";

/**
 * The mark.
 *
 * A shield cut from a duty-board slot grid: the outer hex reads as a shield, the inner cells are
 * the occupancy slots from `PostOccupancy`. It ties the brand to the product's own instrument
 * rather than to a generic lock, and the amber cell is the accent used consistently elsewhere.
 */
export function HiveMark({
  className,
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      role="img"
      aria-label="SecHive"
      className={cn("shrink-0", className)}
    >
      <title>SecHive</title>
      <path
        d="M14 1.75 24.25 5v8.5c0 6.1-4.15 11.2-10.25 12.75C7.9 24.7 3.75 19.6 3.75 13.5V5L14 1.75Z"
        stroke="currentColor"
        strokeWidth="1.6"
        className="text-accent"
      />
      {/* Occupancy slots: three posts, one filled. The product's promise, at 28px. */}
      <rect
        x="8.5"
        y="9"
        width="3"
        height="3"
        rx="0.6"
        className="fill-accent"
      />
      <rect
        x="12.5"
        y="9"
        width="3"
        height="3"
        rx="0.6"
        className="fill-accent/45"
      />
      <rect
        x="16.5"
        y="9"
        width="3"
        height="3"
        rx="0.6"
        className="fill-accent/20"
      />
      <rect
        x="8.5"
        y="13.5"
        width="3"
        height="3"
        rx="0.6"
        className="fill-accent/45"
      />
      <rect
        x="12.5"
        y="13.5"
        width="3"
        height="3"
        rx="0.6"
        className="fill-accent/20"
      />
      <rect
        x="16.5"
        y="13.5"
        width="3"
        height="3"
        rx="0.6"
        className="fill-accent/20"
      />
    </svg>
  );
}

export function Wordmark({
  className,
  organisationName,
}: {
  className?: string;
  organisationName?: string | undefined;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <HiveMark />
      <div className="min-w-0">
        <p className="font-narrow text-base leading-none font-bold tracking-[0.14em] text-foreground uppercase">
          Sec<span className="text-accent">Hive</span>
        </p>
        {organisationName ? (
          <p className="mt-1 truncate text-2xs tracking-[0.06em] text-foreground-subtle uppercase">
            {organisationName}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function RoleChip({ role }: { role: Role }) {
  return (
    <span className="label-block rounded-sm border border-border-base bg-surface-raised px-1.5 py-0.5 text-foreground-muted">
      {ROLE_LABELS[role]}
    </span>
  );
}
