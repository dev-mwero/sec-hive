"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DemoRoleSwitcher } from "@/components/demo/demo-role-switcher";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import type { PreviewRole, Session } from "@/lib/demo";

/**
 * Application shell.
 *
 * Desktop is a persistent sidebar; below `lg` it becomes an overlay drawer, because the
 * supervisor and guard experiences are tablet- and phone-first and a 15-item rail would consume
 * the whole viewport.
 *
 * The shell is a client component because the drawer and the theme toggle need state. It receives
 * the session projection as props from the server layout and never fetches anything itself.
 */
export function AppShell({
  session,
  unreadCount,
  previewRole,
  children,
}: {
  session: Session;
  unreadCount: number;
  previewRole: PreviewRole;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const { user } = session;

  // Close the drawer on navigation: on a touch target the user may tap a link and then tap
  // outside, leaving the drawer covering the page they just asked for.
  useEffect(() => {
    if (pathname !== lastPath) {
      setLastPath(pathname);
      setNavOpen(false);
    }
  }, [lastPath, pathname]);

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-60 shrink-0 border-r border-border-base bg-surface lg:block">
        <div className="sticky top-0 h-svh">
          <Sidebar role={user.role} organisationName={user.organizationName} />
        </div>
      </aside>

      {navOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-background/70 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-border-base bg-surface shadow-[var(--shadow-popover)]">
            <Sidebar
              role={user.role}
              organisationName={user.organizationName}
              onNavigate={() => setNavOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-40">
          <Topbar
            role={user.role}
            userName={`${user.firstName} ${user.lastName}`}
            email={user.email}
            unreadCount={unreadCount}
            onOpenNav={() => setNavOpen(true)}
          />
        </div>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>

      <DemoRoleSwitcher currentRole={previewRole} />
    </div>
  );
}
