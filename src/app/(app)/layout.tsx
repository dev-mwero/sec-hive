import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import type { PreviewRole } from "@/lib/demo";
import { getSession } from "@/server/auth/session";

/**
 * Authenticated shell.
 *
 * The session is resolved here for the chrome only. It is *not* the access control: every page
 * re-checks permissions at its own data access, because a layout that renders for an unauthenticated
 * request must still fail closed rather than leak a page's data.
 *
 * Next 16 gives layouts no `searchParams`, so the demo preview travels in a cookie. That is also
 * better behaviour: the server, the sidebar and the page body all read the same role.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <AppShell
      session={session}
      unreadCount={session.unreadNotifications}
      previewRole={session.user.role as PreviewRole}
    >
      {children}
    </AppShell>
  );
}
