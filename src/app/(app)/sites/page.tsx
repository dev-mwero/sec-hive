import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { safeHomeForRole } from "@/constants/navigation";
import { can, isClientRole } from "@/lib/permissions";
import { getSession } from "@/server/auth/session";

/**
 * Sites — the home surface for site-scoped staff, and a **company** surface.
 *
 * A `supervisor` and a `site_manager` are sent here by `homeForRole()`. Both operations pages assert
 * `hasOrgWideScope()` and would bounce them straight back onto this one, so redirecting them
 * without a destination to land on is a loop; this route is the other half of that promise.
 *
 * **Company, not client.** `sites:read` is granted to the client roles too, and a grant is a
 * capability rather than an invitation to a particular screen — so this page refuses them by class
 * (`isClientRole`) rather than by permission. Their own locations are a portal read, narrowed by
 * `clientId`; this board is the company's, narrowed by site assignment.
 *
 * **The listing is not here yet, and the empty state is the point.** What belongs here is the
 * *scoped* site board — the caller's own `supervisorIds` and nothing else — which is the follow-up
 * task. Until then the page renders no records rather than an unscoped stand-in, because handing
 * a site-scoped role the company's site list on the way to their own would reintroduce exactly the
 * leak the redirect exists to prevent. One honest gap is worth more than a populated page the
 * caller is not entitled to.
 *
 * `hasOrgWideScope()` is deliberately absent. A page that reads *scoped* rows narrows by `siteId`
 * in its query and does not assert org-wide access; the two checks belong to unscoped pages only
 * (docs/rbac.md, "Unscoped reads").
 */
export default async function SitesPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { user } = session;

  // Two rejections, and they fail for different reasons.
  //
  // `sites:read` answers "may this role see site records at all"; scope answers how many, and the
  // narrowing happens in the query rather than here. A guard holds neither and belongs on the duty
  // card, so that is a redirect and not a 403.
  //
  // A client role holds `sites:read` and still does not belong here. `CLIENT_NAV_SECTIONS` points
  // them at `/portal/sites`, and the difference between the two routes is not cosmetic: this is the
  // company's directory of client locations, scoped by the caller's own site assignment, while a
  // client's own buildings are read through their `clientId` from the portal. The nav item was
  // hidden for a client while the route stayed reachable by URL — a gate that only convenience
  // enforces. Nothing leaks today because the page below renders no records; the reason to close it
  // now is that the scoped board is the next thing to land here, and it must not land behind a gate
  // a client can walk through.
  //
  // Not `homeForRole`: this page *is* `homeForRole` for `supervisor` and `site_manager` (see the
  // note on `homeForRole` above), so the bare mapping could redirect them straight back here. It
  // cannot today — both hold `sites:read` — but `safeHomeForRole` is what makes that true of every
  // role rather than of the two that happen to pass the check above.
  if (isClientRole(user.role) || !can(user.role, "sites:read")) {
    redirect(safeHomeForRole(user.role, "/sites"));
  }

  return (
    <>
      <PageHeader
        eyebrow="Directory"
        title="Your sites"
        description="The locations you are responsible for, and who is covering them right now."
      />

      <Card>
        <CardContent className="py-10 text-center text-sm text-foreground-muted">
          Your site board is being built. It will list only the sites assigned
          to you, not the whole company&rsquo;s.
        </CardContent>
      </Card>
    </>
  );
}
