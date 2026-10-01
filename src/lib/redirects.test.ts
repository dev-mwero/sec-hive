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
  isClientRole,
  isSelfScopedRole,
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
  // Mirrors: src/app/(app)/my-duty/page.tsx — the two-check gate, not the bare capability
  // Requires: can(role,"attendance:checkin") AND isSelfScopedRole(role)
  // else safeHomeForRole(role,"/my-duty")
  // The second check is the fix: `ALL` includes `attendance:checkin`, so a capability check alone
  // admitted platform_admin and security_company_admin onto a guard's own duty card.
  if (can(role, "attendance:checkin") && isSelfScopedRole(role)) {
    return "render";
  }
  return safeHomeForRole(role, "/my-duty");
}

function gateSites(role: Role, _session: SessionShape): GateResult {
  // Mirrors: src/app/(app)/sites/page.tsx
  // Requires: !isClientRole(role) AND can(role,"sites:read") (no org-wide scope check — this is a
  // scoped page), else safeHomeForRole(role,"/sites"). `safeHomeForRole` rather than `homeForRole`
  // because this page *is* the home of supervisor and site_manager.
  if (!isClientRole(role) && can(role, "sites:read")) {
    return "render";
  }
  return safeHomeForRole(role, "/sites");
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

  describe("Self-scoped and company surfaces", () => {
    // `/dashboard` and `/dashboard/live` gate on a *permission the whole product shares*. These two
    // gate on a permission or a class that only part of it should pass, and the property is stated
    // per surface rather than as a general rule, because "which roles may open this page" is a
    // decision each page makes about itself.

    it("renders /my-duty only for a self-scoped role", () => {
      // The defect: `attendance:checkin` sits inside `ALL`, so `platform_admin` and
      // `security_company_admin` held it and a capability-only gate rendered a guard's duty card to
      // the two roles with the widest scope in the product. The page shows one specific guard's
      // post, shift and check-in button — an org-wide admin reading "your post" off a card about
      // somebody else is a page answering a question its reader cannot have asked.
      //
      // Not a leak, and the grant stays: the permission answers "may this role record a check-in",
      // which a company admin legitimately may. The *gate* narrows, on scope.
      const session: SessionShape = { clientId: "client-1" };

      for (const role of ROLES) {
        expect(
          GATES["/my-duty"](role, session) === "render",
          `/my-duty rendering for ${role} must match isSelfScopedRole(${role})`,
        ).toBe(isSelfScopedRole(role));
      }
    });

    it("keeps the org-wide roles off /my-duty even though ALL grants them check-in", () => {
      // Named explicitly rather than left to the sweep above, because the fix is *not* to remove
      // the grant: if someone re-tightened `ALL`, or added `attendance:checkin` to it deliberately
      // for another surface, this test would still fail — which is the point. The gate is what must
      // hold, and this is the assertion that it does.
      const session: SessionShape = { clientId: "client-1" };

      for (const role of ORGANIZATION_SCOPED_ROLES) {
        expect(
          can(role, "attendance:checkin"),
          `${role} is expected to hold attendance:checkin via ALL`,
        ).toBe(true);
        expect(
          GATES["/my-duty"](role, session),
          `${role} must not be served a guard's own duty card`,
        ).not.toBe("render");
      }
    });

    it("renders /sites for no client role, although every client role holds sites:read", () => {
      // `CLIENT_NAV_SECTIONS` hides the nav item from a client, which is a convenience and not a
      // gate: the route was still reachable by URL. Their own buildings are a portal read narrowed
      // by `clientId`; this board is the company's, narrowed by site assignment.
      const session: SessionShape = { clientId: "client-1" };

      for (const role of CLIENT_ROLES) {
        expect(
          can(role, "sites:read"),
          `${role} is expected to hold sites:read — the point of the test`,
        ).toBe(true);
        expect(
          GATES["/sites"](role, session),
          `/sites must not render for client role ${role}`,
        ).not.toBe("render");
      }
    });

    it("renders /sites for every non-client role that holds sites:read, and for no other", () => {
      // Stated positively so the gate cannot harden into something that excludes a role this page
      // is the home of. `supervisor` and `site_manager` are sent here by `homeForRole()`; the guard
      // is the one non-client role that holds neither the class nor the permission, and is answered
      // by its own duty card.
      const session: SessionShape = { clientId: "client-1" };

      for (const role of ROLES) {
        if (CLIENT_ROLES_SET.has(role)) {
          continue;
        }
        expect(
          GATES["/sites"](role, session) === "render",
          `/sites rendering for ${role} must match can(${role},"sites:read")`,
        ).toBe(can(role, "sites:read"));
      }

      // The two roles `homeForRole()` names this page for, asserted by name: they are the reason the
      // gate cannot become a company-admin-only surface, and the reason its redirect has to go
      // through `safeHomeForRole`.
      for (const role of SITE_SCOPED_ROLES) {
        expect(homeForRole(role)).toBe("/sites");
        expect(
          GATES["/sites"](role, session),
          `/sites must render for ${role}`,
        ).toBe("render");
      }
    });

    it("sends a client refused at /sites to their portal, not to the terminal screen", () => {
      // The destination is half the control. A client who typed the company URL should land on
      // something they can use — `NO_ACCESS_ROUTE` would be safe but would be a worse product than
      // the gate it replaced, and it is the answer `safeHomeForRole` exists to avoid choosing.
      for (const role of CLIENT_ROLES) {
        expect(GATES["/sites"](role, { clientId: "client-1" })).toBe("/portal");
      }
    });

    it("never answers a page with the page itself, from any gate", () => {
      // The loop invariant, asserted on the modelled graph rather than on `safeHomeForRole` alone,
      // so a gate that reaches for `homeForRole` — or for a hardcoded path — is caught here. The
      // live example was `/portal` → `/dashboard` → `homeForRole()` → `/portal`.
      const sessions: SessionShape[] = [
        { clientId: "client-1" },
        { clientId: null },
      ];

      for (const role of ROLES) {
        for (const session of sessions) {
          for (const [path, gate] of Object.entries(GATES)) {
            const res = gate(role, session);
            if (res === "render") {
              continue;
            }
            expect(res, `${path} redirected ${role} to itself`).not.toBe(path);
          }
        }
      }
    });

    it("redirects only to a path the graph models", () => {
      // A redirect to an unmodelled path is not a loop, it is worse: the test suite cannot see where
      // the caller ends up, so the loop-freedom proof above would be reasoning about a graph with a
      // hole in it. Every destination a gate can produce is therefore asserted to be modelled.
      const sessions: SessionShape[] = [
        { clientId: "client-1" },
        { clientId: null },
      ];
      const modelled = Object.keys(GATES);

      for (const role of ROLES) {
        for (const session of sessions) {
          for (const [path, gate] of Object.entries(GATES)) {
            const res = gate(role, session);
            if (res === "render") {
              continue;
            }
            expect(
              modelled,
              `${path} redirected ${role} to unmodelled ${res}`,
            ).toContain(res);
          }
        }
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
