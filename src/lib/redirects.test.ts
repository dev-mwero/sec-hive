/**
 * Redirect graph invariants.
 *
 * Two rounds of the same defect class (unscoped page serving a non-org-wide role,
 * and a redirect to a path that redirects back) required explicit enforcement.
 * These tests model each page's gate as a pure function and assert loop-freedom,
 * self-redirect prevention, the `homeForRole` invariant, and fail-closed behaviour.
 *
 * The page gates are mirrored here as plain functions with source comments so
 * drift is visible: a page edit may invalidate the mirror. If a mirror becomes
 * too fragile to maintain, that should be raised.
 */

import { describe, expect, it } from "vitest";

import {
  CLIENT_ROLES,
  ROLES,
  type Role,
  SELF_SCOPED_ROLES,
  SITE_SCOPED_ROLES,
} from "@/constants/domain";
import {
  homeForRole,
  NO_ACCESS_ROUTE,
  safeHomeForRole,
} from "@/constants/navigation";
import {
  can,
  hasOrgWideScope,
  ORGANIZATION_SCOPED_ROLES,
} from "@/lib/permissions";

type SessionShape = {
  clientId: string | null;
};

type GateResult = "render" | string;

function gateDashboard(role: Role, _session: SessionShape): GateResult {
  // Mirrors: src/app/(app)/dashboard/page.tsx lines ~50-70
  // Checks: can(role,"deployment:read") AND hasOrgWideScope(role)
  if (can(role, "deployment:read") && hasOrgWideScope(role)) {
    return "render";
  }
  return homeForRole(role);
}

function gateDashboardLive(role: Role, _session: SessionShape): GateResult {
  // Mirrors: src/app/(app)/dashboard/live/page.tsx lines ~40-60
  // Checks: can(role,"deployment:read") AND hasOrgWideScope(role)
  if (can(role, "deployment:read") && hasOrgWideScope(role)) {
    return "render";
  }
  return homeForRole(role);
}

function gatePortal(role: Role, session: SessionShape): GateResult {
  // Mirrors: src/app/(app)/portal/page.tsx lines ~70-110
  // First: can(role,"coverage:read") else safeHomeForRole(role, "/portal")
  // Second: if !clientId, redirect isClientRole ? NO_ACCESS_ROUTE : safeHomeForRole(role,"/portal")
  if (!can(role, "coverage:read")) {
    return safeHomeForRole(role, "/portal");
  }
  if (!session.clientId) {
    return CLIENT_ROLES.includes(role)
      ? NO_ACCESS_ROUTE
      : safeHomeForRole(role, "/portal");
  }
  return "render";
}

function gateMyDuty(role: Role, _session: SessionShape): GateResult {
  // Mirrors: src/app/(app)/my-duty/page.tsx lines ~55-75
  // Requires: can(role,"attendance:checkin") else safeHomeForRole(role,"/my-duty")
  if (can(role, "attendance:checkin")) {
    return "render";
  }
  return safeHomeForRole(role, "/my-duty");
}

function gateSites(role: Role, _session: SessionShape): GateResult {
  // Mirrors: src/app/(app)/sites/page.tsx lines ~40-65
  // Requires: can(role,"sites:read") else homeForRole(role) (no org-wide scope check)
  if (can(role, "sites:read")) {
    return "render";
  }
  return homeForRole(role);
}

function gateNoAccess(_role: Role, _session: SessionShape): GateResult {
  // Mirrors: src/app/(app)/no-access/page.tsx
  // Terminal: renders, never redirects
  return "render";
}

// Map of paths to gates (as modelled). Includes NO_ACCESS_ROUTE as terminal.
const GATES: Record<string, (role: Role, session: SessionShape) => GateResult> =
  {
    "/dashboard": gateDashboard,
    "/dashboard/live": gateDashboardLive,
    "/portal": gatePortal,
    "/my-duty": gateMyDuty,
    "/sites": gateSites,
    [NO_ACCESS_ROUTE]: gateNoAccess,
  };

function followRedirects(
  role: Role,
  session: SessionShape,
  startPath: string,
  maxHops = 3,
): { final: GateResult; hops: string[] } {
  const visited: string[] = [];
  let current = startPath;
  let hops = 0;

  while (hops <= maxHops + 1) {
    visited.push(current);
    hops++;
    const gate = GATES[current];
    if (!gate) {
      // If unknown path, treat as terminal (no redirect defined)
      return { final: "render", hops: visited };
    }
    const res = gate(role, session);
    if (res === "render") {
      return { final: "render", hops: visited };
    }
    if (res === current) {
      return { final: res, hops: visited };
    }
    current = res;
    if (hops > maxHops) {
      return { final: current, hops: visited };
    }
  }
  return { final: current, hops: visited };
}

// Imported, not re-spelled. A hardcoded copy of the org-wide allowlist would let this suite stay
// green while `permissions.ts` drifted — which is the exact failure these tests exist to catch,
// so restating the value here would undermine the point of the file.
const ORGANIZATION_SCOPED_ROLES_SET = new Set<Role>(ORGANIZATION_SCOPED_ROLES);

const CLIENT_ROLES_SET = new Set<Role>(CLIENT_ROLES);
const SITE_SCOPED_ROLES_SET = new Set<Role>(SITE_SCOPED_ROLES);
const SELF_SCOPED_ROLES_SET = new Set<Role>(SELF_SCOPED_ROLES);

describe("Redirect graph invariants", () => {
  describe("Bounded termination (no infinite loops)", () => {
    it("terminates within bounded hops from all entry paths for all roles with clientId set", () => {
      // Bound choice: current worst case observed is ~2 hops; assert <= 3 so a
      // legitimate extra hop does not fail while still catching loops. The
      // comment documents the rationale as requested.
      const maxHops = 3;
      const sessionWithClient: SessionShape = { clientId: "client-1" };
      const entryPaths = Object.keys(GATES);

      for (const role of ROLES) {
        for (const entryPath of entryPaths) {
          const { final, hops } = followRedirects(
            role,
            sessionWithClient,
            entryPath,
            maxHops,
          );
          expect(
            final,
            `role=${role} entry=${entryPath} should terminate (hops=${hops.join("->")})`,
          ).toBe("render");
          expect(
            hops.length - 1,
            `role=${role} entry=${entryPath} hops=${hops.join("->")} should be <= ${maxHops}`,
          ).toBeLessThanOrEqual(maxHops);
        }
      }
    });

    it("terminates within bounded hops for client roles with clientId null", () => {
      const maxHops = 3;
      const sessionNoClient: SessionShape = { clientId: null };
      const entryPaths = Object.keys(GATES);

      for (const role of CLIENT_ROLES) {
        for (const entryPath of entryPaths) {
          const { final, hops } = followRedirects(
            role,
            sessionNoClient,
            entryPath,
            maxHops,
          );
          expect(
            final,
            `client role=${role} entry=${entryPath} should terminate (hops=${hops.join("->")})`,
          ).toBe("render");
          expect(
            hops.length - 1,
            `client role=${role} entry=${entryPath} hops should be <= ${maxHops}`,
          ).toBeLessThanOrEqual(maxHops);
        }
      }
    });
  });

  describe("No self-redirects", () => {
    it("safeHomeForRole never returns fromPath", () => {
      // safeHomeForRole exists precisely to prevent self-redirects; assert invariant holds.
      const paths = [
        "/dashboard",
        "/dashboard/live",
        "/portal",
        "/my-duty",
        "/sites",
      ];
      for (const role of ROLES) {
        for (const fromPath of paths) {
          const target = safeHomeForRole(role, fromPath);
          expect(target).not.toBe(fromPath);
        }
      }
    });
  });

  describe("homeForRole invariant", () => {
    it("homeForRole's target page renders for that role", () => {
      // For each role, if homeForRole(role) exists as a page in the graph,
      // that page must render for that role (with a typical session shape).
      // This is the invariant that catches redirect loops at the source.
      //
      // `clientId` is set here deliberately. A client role's home is `/portal`, and `/portal`
      // redirects a `clientId: null` session to `/no-access` — so the honest statement of this
      // invariant is "the role's home renders for a session entitled to be there", not "renders
      // for every session shape". The `clientId: null` shape is a genuinely different case: it is
      // the one where no surface exists, and it terminates at `/no-access` by design. Asserting
      // that here would demand a home for a session that has none.
      const sessionWithClient: SessionShape = { clientId: "client-1" };

      for (const role of ROLES) {
        const home = homeForRole(role);
        if (home in GATES) {
          const res = GATES[home](role, sessionWithClient);
          expect(
            res,
            `homeForRole(${role})=${home} should render for that role`,
          ).toBe("render");
        }
      }
    });
  });

  describe("Scope constraints", () => {
    it("only org-wide roles render unscoped pages (/dashboard, /dashboard/live)", () => {
      const sessionWithClient: SessionShape = { clientId: "client-1" };
      const unscopedPages = ["/dashboard", "/dashboard/live"];

      for (const role of ROLES) {
        for (const page of unscopedPages) {
          const gate = GATES[page];
          const res = gate(role, sessionWithClient);
          if (ORGANIZATION_SCOPED_ROLES_SET.has(role)) {
            expect(res, `${page} must render for ${role}`).toBe("render");
          } else {
            // Non-org-wide roles must not render unscoped pages; they redirect.
            expect(res, `${page} must not render for ${role}`).not.toBe(
              "render",
            );
          }
        }
      }

      // Assert model agrees with hasOrgWideScope
      for (const role of ROLES) {
        const isOrgWide = hasOrgWideScope(role);
        expect(isOrgWide).toBe(ORGANIZATION_SCOPED_ROLES_SET.has(role));
      }
    });
  });

  describe("Fail-closed homeForRole", () => {
    it("returns NO_ACCESS_ROUTE for an unclassified role (cast outside known buckets)", () => {
      // Role is a closed union so this needs a cast; the cast is the point -
      // it simulates a role added to ROLES without classification.
      const unclassified = "new_role_not_yet_classified" as Role;

      const home = homeForRole(unclassified);
      expect(home).toBe(NO_ACCESS_ROUTE);

      // Also assert it's not misclassified into org/site/client/self buckets
      expect(ORGANIZATION_SCOPED_ROLES_SET.has(unclassified)).toBe(false);
      expect(CLIENT_ROLES_SET.has(unclassified)).toBe(false);
      expect(SITE_SCOPED_ROLES_SET.has(unclassified)).toBe(false);
      expect(SELF_SCOPED_ROLES_SET.has(unclassified)).toBe(false);
    });
  });
});
