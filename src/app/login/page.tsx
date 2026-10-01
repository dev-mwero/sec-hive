import type { Metadata } from "next";

import { HiveMark } from "@/components/layout/brand";
import { Card, CardContent } from "@/components/ui/card";
import { ROLE_LABELS } from "@/constants/domain";
import { DUMMY, DUMMY_CREDENTIALS } from "@/data/dummy";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * Login placeholder.
 *
 * Authentication is the next phase, so this page does not authenticate anything. It exists because
 * every protected route redirects here when there is no session, and a redirect to a 404 would
 * make the fail-closed behaviour look like a bug.
 *
 * It deliberately offers no password field: a non-functional form is worse than none, because it
 * suggests a security control that is not there.
 */
export default function LoginPage() {
  const isStub = process.env.NODE_ENV !== "production";

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <HiveMark size={40} />
          <p className="font-narrow mt-3 text-lg leading-none font-bold tracking-[0.14em] text-foreground uppercase">
            Sec<span className="text-accent">Hive</span>
          </p>
        </div>

        <Card>
          <CardContent className="p-4">
            <p className="label-block mb-2">Authentication not wired</p>
            <p className="text-sm text-foreground-muted">
              {isStub
                ? "Sign-in arrives with the auth phase. In development, use the role preview in the corner of any authenticated screen to see each role's experience."
                : "This deployment is running without an authentication provider. Configure Auth.js before signing anyone in."}
            </p>

            {isStub ? (
              <>
                <p className="mt-4 mb-1.5 text-2xs text-foreground-subtle">
                  Demo accounts for {DUMMY.organization.name}
                </p>
                <ul className="space-y-1">
                  {DUMMY_CREDENTIALS.map((cred) => (
                    <li
                      key={cred.email}
                      className="flex items-center justify-between gap-3 rounded-sm bg-surface-raised px-2 py-1.5"
                    >
                      <span className="truncate text-xs text-foreground-muted">
                        {cred.role}
                      </span>
                      <span className="truncate font-mono text-2xs text-foreground-subtle">
                        {cred.email}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-2xs text-foreground-subtle">
                  Passwords are not modelled in the dummy data — no credential
                  in this dataset can authenticate against anything.
                </p>
              </>
            ) : (
              <p className="mt-3 font-mono text-2xs text-foreground-subtle">
                {ROLE_LABELS.security_company_admin} · auth provider missing
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
