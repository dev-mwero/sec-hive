/**
 * DEVELOPMENT-ONLY demo session.
 *
 * Shapes the exact session projection that `auth()` will return once authentication lands, so the
 * UI can be built and reviewed against a real session instead of a guess. Replacing this with the
 * real `auth()` requires editing `src/server/auth/session.ts` and nothing else.
 *
 * Isomorphic on purpose: the server needs it to build the session, and the client needs it to
 * render the preview switcher. It reads only `src/data/dummy`, so it grants nothing.
 */

import type { Role } from "@/constants/domain";
import { DUMMY, dummyNotifications } from "@/data/dummy";

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  organizationId: string;
  organizationName: string;
  clientId: string | null;
  clientName: string | null;
  guardId: string | null;
};

export type Session = {
  user: SessionUser;
  expiresAt: string;
  unreadNotifications: number;
};

/**
 * Cookie carrying the previewed role.
 *
 * Named `sechive_demo_*` rather than something neutral so that a stray reference to it in
 * production code is obvious in review. It is read *only* when `NODE_ENV !== "production"`;
 * `getSession()` returns `null` in production, so this value can never authenticate anything.
 */
export const DEMO_ROLE_COOKIE = "sechive_demo_role";

/**
 * Roles that have a demo user.
 *
 * Deliberately not all seven: only four people exist in the dummy dataset, and previewing a role
 * as an unrelated person's name would misrepresent the very thing the preview exists to show.
 * `platform_admin`, `site_manager` and `client_viewer` arrive with the auth phase.
 */
export const PREVIEW_ROLES = [
  "security_company_admin",
  "supervisor",
  "client_admin",
  "guard",
] as const satisfies readonly Role[];

export type PreviewRole = (typeof PREVIEW_ROLES)[number];

export const DEFAULT_PREVIEW_ROLE: PreviewRole = "security_company_admin";

export function isPreviewRole(value: unknown): value is PreviewRole {
  return (
    typeof value === "string" &&
    (PREVIEW_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Builds the session for a previewed role.
 *
 * Identity is looked up in `DUMMY.users` rather than hard-coded, so a name change in the dataset
 * cannot leave the shell showing a stale user. `guardId` is resolved from the guard's employee
 * number, which is the only field both records share.
 */
export function demoSession(role: PreviewRole): Session {
  const user = DUMMY.users.find((u) => u.role === role);

  if (!user) {
    throw new Error(
      `No demo user for role "${role}". Add one to DUMMY.users before previewing it.`,
    );
  }

  const clientId = user.clientId;
  const guardId =
    role === "guard"
      ? (DUMMY.guards.find(
          (g) => g.firstName === user.firstName && g.lastName === user.lastName,
        )?.id ?? null)
      : null;

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role,
      organizationId: DUMMY.organization.id,
      organizationName: DUMMY.organization.name,
      clientId,
      clientName: clientId
        ? (DUMMY.clients.find((c) => c.id === clientId)?.name ?? null)
        : null,
      guardId,
    },
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    unreadNotifications: dummyNotifications.filter((n) => n.readAt === null)
      .length,
  };
}
