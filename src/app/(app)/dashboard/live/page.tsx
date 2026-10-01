import Link from "next/link";
import { redirect } from "next/navigation";
import { DeploymentBoard } from "@/components/deployment/deployment-board";
import { PageHeader } from "@/components/layout/page-header";
import { LivePoll } from "@/components/shared/live-poll";
import { RefreshIndicator } from "@/components/shared/refresh-indicator";
import { Button } from "@/components/ui/button";
import { DEPLOYMENT_POLL_INTERVAL_MS } from "@/constants/domain";
import { homeForRole } from "@/constants/navigation";
import { dummyDeployment } from "@/data/dummy";
import { can, hasOrgWideScope } from "@/lib/permissions";
import { getSession } from "@/server/auth/session";

/**
 * **Live Deployment** — the operational screen.
 *
 * This is the page a supervisor keeps open on a tablet at the gate. It refreshes on a 30-second
 * poll and states plainly that it is a poll; it is not claiming real-time.
 *
 * The permission check is real, not decorative: the same `can()` the server will use for the API
 * route decides whether the page renders at all. Doing it here as well as in the layout is
 * deliberate — hiding a navigation item is a convenience, and this page has to fail closed.
 */
export default async function LiveDeploymentPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Both checks are required, and the second is the one that matters.
  //
  // Client roles are *granted* `deployment:read` — a client has every right to see the guard at
  // their own gate. But that grant is scoped to their own `clientId`, while this board renders
  // unscoped rows for every client. Asserting only the capability would serve a client the
  // company's entire roster behind a sidebar that claims otherwise.
  if (
    !can(session.user.role, "deployment:read") ||
    !hasOrgWideScope(session.user.role)
  ) {
    // Send them to their own home rather than a bare 403: a client gets their coverage portal, a
    // guard gets their duty card. Reveals nothing, since neither was entitled to these rows.
    redirect(homeForRole(session.user.role));
  }

  const generatedAt = new Date();

  return (
    <>
      <LivePoll intervalMs={DEPLOYMENT_POLL_INTERVAL_MS} />

      <PageHeader
        eyebrow="Operations / Live"
        title="Live deployment"
        description="Who is guarding what right now, grouped by client and site. Exceptions sort first."
        actions={
          <>
            <RefreshIndicator
              generatedAt={generatedAt}
              intervalMs={DEPLOYMENT_POLL_INTERVAL_MS}
            />
            {can(session.user.role, "assignments:create") ? (
              <Button asChild size="sm" variant="primary">
                <Link href="/dashboard/assignments/new">New assignment</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <DeploymentBoard rows={dummyDeployment} />
    </>
  );
}
