import { ShieldOff } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * No access — the terminal destination for a session entitled to nothing.
 *
 * Every other page in the app answers an unauthorised caller by redirecting them to their own home,
 * which is a promise that a home exists. For a role that holds no capability on any surface — or for
 * a client user record that is not attached to a client account yet — there is no home, and the
 * redirect chain `/portal` → `/dashboard` → `homeForRole()` → `/portal` was the loop that proved it.
 * Redirecting a caller who has nowhere to go is how a fail-closed gate turns into a browser that
 * spins, so the honest answer is a screen that says so.
 *
 * **This page reads nothing.** No session, no tenant data, no `src/data/dummy.ts` — not out of
 * caution but because there is nothing here to be scoped to: the only fact being reported is the
 * caller's own lack of access. Authentication is the `(app)` layout's job, and it holds whether or
 * not this page runs.
 *
 * **It also redirects nowhere.** A terminal route that redirects is not terminal, so the only way
 * off this page is a link the reader chooses to press.
 */
export default function NoAccessPage() {
  return (
    <>
      <PageHeader
        eyebrow="Access"
        title="No screen is available for this account yet"
        description="You are signed in, and nothing in SecHive is set up for you to open."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/">Back to the site</Link>
          </Button>
        }
      />

      <div className="max-w-2xl">
        <Card>
          <CardHeader className="border-b border-border-base py-2.5">
            <CardTitle className="flex items-center gap-2">
              <ShieldOff aria-hidden className="size-3.5" />
              Why you are seeing this
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3 p-4 text-sm leading-relaxed text-foreground-muted">
            {/* Written for the two cases that reach here, and phrased so neither implies the reader
                did anything wrong: they have not been misconfigured, their account is incomplete. */}
            <p>
              SecHive decides what to show from two separate things — what your
              role is allowed to read, and which slice of the company that read
              is scoped to. Your account is currently scoped to nothing, so
              there is no page that can be rendered for you.
            </p>
            <p>
              This usually means the account has not been attached to the
              company or client it belongs to yet. It is a record for an
              administrator to finish setting up, not something you can open
              your way past.
            </p>
            <p className="text-foreground-subtle">
              If you were expecting to see your dashboard, your sites or your
              coverage view, ask whoever administers your account to check your
              role and that your account is linked to the right organisation.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
