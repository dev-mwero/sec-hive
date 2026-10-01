import {
  coverageStatusStyle,
  deriveCoverageStatus,
  type StatusTone,
  TONE_DOT_CLASSES,
} from "@/components/status/status-styles";
import { cn } from "@/lib/utils";

/**
 * **Post occupancy** — SecHive's signature element.
 *
 * A duty board covers coverage with discrete slots, one per required guard, and you can see at a
 * glance whether the post is filled because you are counting magnets, not reading a percentage.
 * A 0% / 66% / 100% bar hides exactly the information an operator needs: whether *one* guard is
 * missing from a two-guard post.
 *
 * So: `required` slots, filled and empty drawn differently, plus an unfilled slot that is
 * hatched in critical colour. The hatching carries the state without relying on hue, which keeps
 * the signal readable in greyscale and to a colourblind reader.
 *
 * When `required` exceeds a readable count, it collapses to a summary rather than drawing a wall
 * of slots — precision is preserved, legibility wins.
 */
export function PostOccupancy({
  required,
  present,
  showCount = true,
  size = "md",
  className,
}: {
  required: number;
  present: number;
  showCount?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const coverage = deriveCoverageStatus(required, present);
  const style = coverageStatusStyle(coverage);
  const filled = Math.min(present, required);

  // A post nobody is required to staff is not a coverage failure, so it draws no empty slots.
  if (required <= 0) {
    return (
      <span
        className={cn("inline-flex items-center gap-2", className)}
        title="No guards required at this post"
      >
        <span className="text-2xs text-foreground-subtle">No requirement</span>
      </span>
    );
  }

  const collapsed = required > 8;

  // Slot identity is positional by nature — slot 3 is the third position at the post — so the
  // key is derived rather than positional, and React sees a stable identity across renders.
  const slots = Array.from({ length: required }, (_, index) => ({
    id: `slot-${index}`,
    filled: index < filled,
  }));

  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      role="img"
      aria-label={`${filled} of ${required} required guards present. ${style.label}`}
    >
      {collapsed ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              "h-2 w-8 rounded-sm",
              filled >= required
                ? TONE_DOT_CLASSES.covered
                : TONE_DOT_CLASSES[style.tone],
            )}
          />
          <span className="font-mono text-xs text-foreground-muted">
            {filled}/{required}
          </span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-[3px]" aria-hidden>
          {slots.map((slot) => (
            <span
              key={slot.id}
              className={cn(
                size === "sm" ? "size-2.5" : "size-3",
                "rounded-[2px] border",
                slot.filled
                  ? "border-covered/40 bg-covered"
                  : "border-critical/30 bg-critical-subtle hatch-uncovered",
              )}
            />
          ))}
        </span>
      )}

      {showCount ? (
        <span className="font-mono text-xs text-foreground-muted">
          {filled}/{required}
        </span>
      ) : null}

      <span className="sr-only">{style.label}</span>
    </span>
  );
}

/**
 * Coverage bar for aggregate views (a site, a shift), where the question is "how much of this
 * site's requirement is met" rather than "is this one post filled".
 *
 * `assigned` is rendered explicitly rather than omitted, because "assigned but not present" is
 * the gap an operator acts on — a post with two assigned guards and zero present is a different
 * problem from a post with nobody assigned, and a `present/required` bar alone cannot tell them
 * apart.
 */
export function CoverageBar({
  required,
  assigned,
  present,
  className,
}: {
  required: number;
  assigned: number;
  present: number;
  className?: string;
}) {
  const coverage = deriveCoverageStatus(required, present);
  const style = coverageStatusStyle(coverage);
  const pct =
    required > 0 ? Math.min(100, Math.round((present / required) * 100)) : 100;
  const unaccounted = Math.max(0, assigned - present);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-inset"
        role="img"
        aria-label={`${pct}% of required coverage present. ${style.label}`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            TONE_DOT_CLASSES[style.tone],
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <span
        className="font-mono text-xs whitespace-nowrap text-foreground-muted"
        title="Guards present / guards required"
      >
        {present}/{required}
      </span>

      {unaccounted > 0 ? (
        <span
          className="font-mono text-xs whitespace-nowrap text-attention"
          title={`${unaccounted} assigned guard${unaccounted === 1 ? "" : "s"} not present`}
        >
          −{unaccounted} away
        </span>
      ) : null}

      <span
        className={cn(
          "font-narrow text-2xs font-semibold tracking-[0.1em] uppercase",
          TONE_TEXT[style.tone],
        )}
      >
        {style.label}
      </span>
    </div>
  );
}

const TONE_TEXT: Record<StatusTone, string> = {
  covered: "text-covered",
  attention: "text-attention",
  critical: "text-critical",
  neutral: "text-neutral-signal",
};
