import {
  type StatusTone,
  TONE_DOT_CLASSES,
} from "@/components/status/status-styles";
import { cn } from "@/lib/utils";

/**
 * Metric tile for the operational counter row.
 *
 * Counters are the fastest read on the dashboard: "how many are late, how many posts are
 * uncovered". They are deliberately **not** charts — a bar or sparkline here would add ink
 * without adding an answer, and an ops console should not look like an analytics product.
 *
 * A zero count is dimmed rather than hidden. Hiding it would make the row reflow as problems
 * appear, which is disorienting precisely when attention is needed.
 */
export function Metric({
  label,
  value,
  tone = "neutral",
  hint,
  emphasis = false,
  className,
}: {
  label: string;
  value: number | string;
  tone?: StatusTone;
  hint?: string;
  /** Highlights a counter that needs attention (uncovered stations, absent guards). */
  emphasis?: boolean;
  className?: string;
}) {
  const isZero = value === 0;

  return (
    <div
      className={cn(
        "panel relative flex min-w-0 flex-col gap-1 px-3.5 py-3",
        emphasis && tone !== "neutral" && "border-l-2",
        className,
      )}
      style={
        emphasis && tone !== "neutral"
          ? { borderLeftColor: `var(--signal-${toneMap[tone]})` }
          : undefined
      }
    >
      <span className="label-block truncate">{label}</span>
      <span className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-2xl leading-none font-semibold tabular-nums",
            isZero ? "text-foreground-subtle" : "text-foreground",
          )}
        >
          {value}
        </span>
        {!isZero && tone !== "neutral" ? (
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              TONE_DOT_CLASSES[tone],
            )}
            aria-hidden
          />
        ) : null}
      </span>
      {hint ? (
        <span className="truncate text-2xs text-foreground-subtle">{hint}</span>
      ) : null}
    </div>
  );
}

export function MetricRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

const toneMap: Record<StatusTone, string> = {
  covered: "covered",
  attention: "attention",
  critical: "critical",
  neutral: "neutral",
};
