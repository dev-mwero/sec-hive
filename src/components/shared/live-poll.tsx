"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Polling island.
 *
 * A 30- or 60-second `router.refresh()` is the honest choice for "live" deployment data on a
 * budget: no socket infrastructure, no stale-cache bugs, and the page re-renders from the server
 * with real authorisation applied. The cost is that it is a *poll*, so the UI says so and prints
 * the age of the reading next to it.
 *
 * Two details that matter in practice:
 *
 * - **Only when visible.** A tab left open on a phone all afternoon would otherwise query the
 *   database every 30 seconds forever.
 * - **Aligned to a real deadline**, not a naive `setInterval`. `setInterval` drifts and keeps
 *   firing after a tab has been suspended; re-arming from a fresh `setTimeout` after each refresh
 *   means a backgrounded tab resumes and polls once, not forty times.
 */
export function LivePoll({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    async function schedule() {
      if (cancelled || document.visibilityState !== "visible") {
        return;
      }

      await new Promise((resolve) => {
        timer = setTimeout(resolve, intervalMs);
      });

      if (cancelled) {
        return;
      }

      router.refresh();
      schedule();
    }

    void schedule();

    // Refresh immediately on tab return rather than waiting out the remaining interval: an
    // operator alt-tabbing back to the board wants current figures, not figures from eight
    // minutes ago.
    function onVisible() {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, router]);

  return null;
}
