/**
 * Page chrome.
 *
 * Deliberately a server component with no `"use client"`: headers and toolbars are pure
 * presentation, and keeping them out of a client boundary means the surrounding page's data
 * fetching and rendering stay on the server. Only genuinely interactive pieces — the drawer, the
 * theme toggle, the clock — carry `"use client"`.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Page header.
 *
 * The block-lettered eyebrow is a section identifier in the style of a printed duty sheet, which
 * is what orients an operator who arrived from a deep link. The title is then the plain name of
 * the thing they are looking at — not a slogan.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <p className="label-block mb-1">{eyebrow}</p> : null}
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-foreground-muted">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Filter and action bar.
 *
 * Filters always sit in the same place, directly under the header and above the data, so muscle
 * memory survives moving between screens.
 */
export function Toolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border-base bg-surface p-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Section heading inside a page, used to break long pages into scannable blocks. */
export function SectionHeading({
  title,
  count,
  action,
  className,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("mb-3 flex items-center justify-between gap-3", className)}
    >
      <h2 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
        {title}
        {typeof count === "number" ? (
          <span className="font-mono text-2xs text-foreground-subtle">
            {count}
          </span>
        ) : null}
      </h2>
      {action}
    </div>
  );
}
