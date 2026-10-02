import type { LucideIcon } from "lucide-react";
import {
  type StatusStyle,
  type StatusTone,
  TONE_CLASSES,
} from "@/components/status/status-styles";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The status badge — SecHive's most-used component.
 *
 * Renders **text + icon + colour** together. The icon and the text are both load-bearing: colour
 * alone would fail roughly one in twelve men with a colour vision deficiency, and an ops console
 * where "amber or red?" decides whether someone gets dispatched is not a place to rely on hue.
 *
 * The label is real text in the DOM (not an `aria-label` on an icon), so a screen reader
 * announces "LATE" rather than a shape.
 */
export function StatusBadge({
  style,
  size = "md",
  className,
  showIcon = true,
  label,
}: {
  style: StatusStyle;
  size?: "sm" | "md";
  className?: string;
  showIcon?: boolean;
  /**
   * Display text in place of `style.label`, for a counted status — "2 UNCOVERED" is the same status
   * with a number attached, and re-implementing the badge at the call site to add the count is how a
   * badge ends up with colour and no icon. The tone, icon and `description` still come from `style`,
   * so the override cannot change what the badge *means*, only how it reads.
   */
  label?: string;
}) {
  const Icon = style.icon;

  return (
    <Badge
      variant={TONE_TO_BADGE[style.tone]}
      size={size}
      className={cn(TONE_CLASSES[style.tone], className)}
      title={style.description}
    >
      {showIcon ? <Icon aria-hidden className="size-3 shrink-0" /> : null}
      {label ?? style.label}
    </Badge>
  );
}

/** Compact status for dense table cells: icon + label, no chrome. */
export function StatusText({
  style,
  className,
}: {
  style: StatusStyle;
  className?: string;
}) {
  const Icon = style.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        TONE_TEXT_CLASSES[style.tone],
        className,
      )}
      title={style.description}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="font-narrow text-2xs font-semibold uppercase tracking-[0.1em]">
        {style.label}
      </span>
    </span>
  );
}

/**
 * Bare icon for the board, where the row's left-edge rule and the adjacent text already carry
 * the status. Always paired with an accessible name so it is never a meaningless glyph.
 */
export function StatusIcon({
  icon: Icon,
  tone,
  label,
  className,
}: {
  icon: LucideIcon;
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  return (
    <span role="img" aria-label={label} title={label}>
      <Icon
        aria-hidden
        className={cn("size-4", TONE_TEXT_CLASSES[tone], className)}
      />
    </span>
  );
}

const TONE_TO_BADGE: Record<
  StatusTone,
  "covered" | "attention" | "critical" | "neutral"
> = {
  covered: "covered",
  attention: "attention",
  critical: "critical",
  neutral: "neutral",
};

const TONE_TEXT_CLASSES: Record<StatusTone, string> = {
  covered: "text-covered",
  attention: "text-attention",
  critical: "text-critical",
  neutral: "text-neutral-signal",
};
