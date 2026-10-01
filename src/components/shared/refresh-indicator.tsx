"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * States the cadence **and** the age of the data.
 *
 * A 30-second poll is not real-time. An operator deciding whether to send a relief guard is acting
 * on these figures, so calling them "live" would be a lie and hiding their age would be a worse
 * one. Both are printed, in mono, next to the reading.
 *
 * The interval below only re-renders the age counter — it issues no request. The poll itself is
 * the page's own `router.refresh()`, so a backgrounded tab does not hammer the database.
 */
export function RefreshIndicator({
  generatedAt,
  intervalMs,
  className,
}: {
  generatedAt: Date | string;
  intervalMs: number;
  className?: string;
}) {
  const seconds = Math.round(intervalMs / 1000);
  const [age, setAge] = useState(0);

  const target = useMemo(
    () =>
      typeof generatedAt === "string" ? new Date(generatedAt) : generatedAt,
    [generatedAt],
  );

  useEffect(() => {
    const readAt = target.getTime();

    function tick() {
      setAge(Math.max(0, Math.round((Date.now() - readAt) / 1000)));
    }

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target]);

  // Three missed cycles means the page's own refresh is failing. Worth saying out loud: an
  // operator acting on a frozen board needs to know the board is frozen.
  const stale = age > seconds * 3;

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-2xs text-foreground-subtle",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          stale ? "bg-attention" : "bg-accent",
        )}
      />
      <span>
        Read{" "}
        <span className="font-mono text-foreground-muted">
          {describeAge(age)}
        </span>
      </span>
      <span aria-hidden>·</span>
      <span>auto-refresh every {seconds}s</span>
      {stale ? (
        <>
          <span aria-hidden>·</span>
          <span className="font-medium text-attention">refresh failing</span>
        </>
      ) : null}
    </div>
  );
}

function describeAge(seconds: number): string {
  if (seconds < 5) {
    return "just now";
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}
