import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { homeForRole } from "@/constants/navigation";
import { can } from "@/lib/permissions";
import { getSession } from "@/server/auth/session";

/**
 * Sites — the home surface for site-scoped staff.
 *
 * A `supervisor` and a `site_manager` are sent here by `homeForRole()`. Both operations pages assert
 * `hasOrgWideScope()` and would bounce them straight back onto this one, so redirecting them
 * without a destination to land on is a loop; this route is the other half of that promise.
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

  // `sites:read` answers "may this role see site records at all"; scope answers how many, and the
  // narrowing happens in the query rather than here. A guard holds neither and belongs on the duty
  // card, so this is a redirect and not a 403.
  if (!can(session.user.role, "sites:read")) {
    redirect(homeForRole(session.user.role));
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
