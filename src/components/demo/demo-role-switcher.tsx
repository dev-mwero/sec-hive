"use client";

import { FlaskConical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/constants/domain";
import { DUMMY, dummyNotifications } from "@/data/dummy";
import {
  DEFAULT_PREVIEW_ROLE,
  DEMO_ROLE_COOKIE,
  PREVIEW_ROLES,
  type PreviewRole,
} from "@/lib/demo";

/**
 * DEVELOPMENT-ONLY role preview.
 *
 * Stands in for a login screen until auth lands, so the four role experiences can be built and
 * reviewed for real instead of guessed at.
 *
 * Two properties keep it honest:
 *
 * 1. **It renders only outside production.** In a production build this component returns `null`
 *    and `getSession()` returns `null`, so there is no path by which it authorises anything. It is
 *    a UI convenience, never a control.
 * 2. **It sets a cookie, not a session.** The cookie changes which *session projection* the demo
 *    returns, so the shell, the navigation and every server-rendered page agree on the role. A
 *    query param would have desynchronised the sidebar from the page body — the sidebar would say
 *    "Guard" while the dashboard rendered supervisor rows.
 *
 * Real permissions still come from the matrix in `lib/permissions.ts`, checked on the server.
 * Previewing `client_admin` grants no capability that role does not genuinely have.
 */
export function DemoRoleSwitcher({
  currentRole,
}: {
  currentRole: PreviewRole;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PreviewRole | null>(null);

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  function preview(role: PreviewRole) {
    setPending(role);
    // 1 year, path-scoped, SameSite=Lax. Long-lived so a refresh mid-review does not silently
    // drop back to the admin view and invalidate a screenshot.
    //
    // Deliberate: this cookie carries a UI preview of a demo session, not an authorisation
    // decision. The server ignores it entirely outside development, and the permission matrix is
    // still evaluated server-side. A cookie API is the only way for a client component to make a
    // server component re-render under a different role.
    // biome-ignore lint/suspicious/noDocumentCookie: deliberate, see above.
    document.cookie = `${DEMO_ROLE_COOKIE}=${role}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  function reset() {
    setPending(null);
    // biome-ignore lint/suspicious/noDocumentCookie: see above.
    document.cookie = `${DEMO_ROLE_COOKIE}=; path=/; max-age=0; samesite=lax`;
    router.refresh();
  }

  const unread = dummyNotifications.filter((n) => n.readAt === null).length;

  return (
    <div className="fixed right-4 bottom-4 z-50 w-72 rounded-lg border border-accent/30 bg-surface shadow-[var(--shadow-popover)]">
      <div className="flex items-center justify-between border-b border-border-base px-3 py-2">
        <p className="label-block flex items-center gap-1.5 text-accent">
          <FlaskConical aria-hidden className="size-3" />
          Role preview
        </p>
        <span
          aria-hidden
          className="rounded-sm bg-accent-subtle px-1.5 py-0.5 font-mono text-[10px] text-accent"
        >
          DEV
        </span>
      </div>

      <p className="px-3 pt-2 pb-1 text-2xs leading-relaxed text-foreground-subtle">
        Auth not wired. Previewing {DUMMY.organization.name} · {unread} unread.
      </p>

      <ul className="p-1.5">
        {PREVIEW_ROLES.map((role) => {
          const user = DUMMY.users.find((u) => u.role === role);
          const active = role === currentRole;

          return (
            <li key={role}>
              <button
                type="button"
                onClick={() => preview(role)}
                disabled={pending !== null && !active}
                aria-current={active ? "true" : undefined}
                className={`flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-50 ${
                  active
                    ? "bg-accent-subtle font-semibold text-accent"
                    : "text-foreground-muted hover:bg-surface-raised hover:text-foreground"
                }`}
              >
                <span className="truncate">{ROLE_LABELS[role]}</span>
                <span className="truncate font-mono text-2xs text-foreground-subtle">
                  {user?.email}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {currentRole !== DEFAULT_PREVIEW_ROLE ? (
        <div className="border-t border-border-base p-2">
          <Button variant="ghost" size="sm" className="w-full" onClick={reset}>
            Reset to {ROLE_LABELS[DEFAULT_PREVIEW_ROLE]}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
