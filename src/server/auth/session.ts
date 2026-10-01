/**
 * The one place that answers "who is signed in?".
 *
 * Every page and every API route resolves its session through here. Today that is a demo stub;
 * tomorrow it is Auth.js. Keeping it behind a single function is what makes that swap a one-line
 * change instead of an audit of forty call sites.
 */

import "server-only";

import { cookies } from "next/headers";

import { ApiError } from "@/lib/api-response";
import {
  DEFAULT_PREVIEW_ROLE,
  DEMO_ROLE_COOKIE,
  demoSession,
  isPreviewRole,
  type Session,
} from "@/lib/demo";

export type { Session, SessionUser } from "@/lib/demo";

/**
 * Returns the current session, or `null` when there is none.
 *
 * Callers must treat `null` as "redirect to login" rather than "render a default user". That is
 * what makes the demo stub safe to ship behind: in a production build it *always* returns
 * `null`, so a production deploy cannot run on a fabricated session.
 */
export async function getSession(): Promise<Session | null> {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const store = await cookies();
  const previewed = store.get(DEMO_ROLE_COOKIE)?.value;

  return demoSession(
    isPreviewRole(previewed) ? previewed : DEFAULT_PREVIEW_ROLE,
  );
}

/**
 * Requires a session, or throws.
 *
 * For API routes and server actions, where a redirect is the wrong response shape. The thrown
 * error is an `UNAUTHENTICATED` `AppError`, so `api-response.ts` renders it as a 401 without any
 * route needing to know about authentication.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new ApiError("UNAUTHENTICATED", 401, "Authentication required.");
  }
  return session;
}
