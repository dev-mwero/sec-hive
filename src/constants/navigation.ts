/**
 * Navigation model.
 *
 * A nav item carries the **permission** it requires rather than a role list. Two reasons:
 *
 * 1. It keeps role knowledge out of the view layer — adding a role does not touch the sidebar.
 * 2. It reuses the same matrix the server enforces, so navigation cannot drift from authorisation.
 *    Hiding an item is still only a convenience (docs/rbac.md), but at least the two agree.
 *
 * `Section` labels are ordered by how often an operator needs them, not alphabetically.
 */

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BadgeCheck,
  Bell,
  Building2,
  CalendarRange,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  MapPin,
  MapPinned,
  Radio,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  UserSquare2,
  Users,
} from "lucide-react";

import { type Role, SELF_SCOPED_ROLES } from "@/constants/domain";
import { can, type Permission } from "@/lib/permissions";

/** Roles whose navigation is about their own records rather than the organisation's. */
const SELF_ONLY = SELF_SCOPED_ROLES;

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Granted permission. Absent means the item is available to any signed-in user. */
  permission?: Permission;
  /**
   * Role restriction, for the few items that are about *your own* records rather than about a
   * capability. "My Duty" is the case in point: no permission can express "this is my duty and not
   * somebody else's", because the permission is identical for every guard. Scope questions are
   * therefore asked in the shape that answers them.
   */
  roles?: readonly Role[];
  /** Renders an unread-count badge. */
  badge?: "notifications";
  /** Short description used as the accessible name and in the command palette. */
  description?: string;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

/**
 * Sections are shared across roles; each role selects the items it can use.
 *
 * Grouping by purpose rather than by entity mirrors how an operator thinks: "what is happening
 * now" (Deployment, Coverage) sits above "the roster" (Guards, Clients, Sites) above
 * "records" (Attendance, Reports, Audit).
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Operations",
    items: [
      {
        href: "/dashboard",
        label: "Overview",
        icon: LayoutDashboard,
        permission: "deployment:read",
        description: "Operational counters for today",
      },
      {
        href: "/dashboard/live",
        label: "Live Deployment",
        icon: Radio,
        permission: "deployment:read",
        description: "Who is guarding what right now",
      },
      {
        href: "/dashboard/coverage",
        label: "Coverage",
        icon: ShieldCheck,
        permission: "coverage:read",
        description: "Station occupancy and uncovered posts",
      },
      {
        href: "/dashboard/assignments",
        label: "Assignments",
        icon: ClipboardList,
        permission: "assignments:read",
        description: "Duty roster and scheduling",
      },
      {
        href: "/my-duty",
        label: "My Duty",
        icon: BadgeCheck,
        roles: SELF_ONLY,
        description: "Today's duty, check in and check out",
      },
    ],
  },
  {
    label: "Deployment",
    items: [
      {
        href: "/dashboard/attendance",
        label: "Attendance",
        icon: CalendarRange,
        permission: "attendance:read",
        description: "Check-ins, check-outs and corrections",
      },
      {
        href: "/duty-history",
        label: "Duty History",
        icon: History,
        roles: SELF_ONLY,
        description: "Past deployments and attendance",
      },
    ],
  },
  {
    label: "Directory",
    items: [
      {
        href: "/guards",
        label: "Guards",
        icon: UserSquare2,
        permission: "guards:read",
        description: "Guard records and employment status",
      },
      {
        href: "/clients",
        label: "Clients",
        icon: Building2,
        permission: "clients:read",
        description: "Customers served",
      },
      {
        href: "/sites",
        label: "Sites",
        icon: MapPinned,
        permission: "sites:read",
        description: "Client locations and supervisors",
      },
      {
        href: "/stations",
        label: "Stations",
        icon: MapPin,
        permission: "stations:read",
        description: "Posts and required guard counts",
      },
      {
        href: "/shifts",
        label: "Shifts",
        icon: Activity,
        permission: "shifts:read",
        description: "Shift templates and hours",
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        href: "/reports",
        label: "Reports",
        icon: FileText,
        permission: "reports:read",
        description: "Deployment, attendance and coverage reports",
      },
      {
        href: "/notifications",
        label: "Notifications",
        icon: Bell,
        permission: "notifications:read",
        badge: "notifications",
        description: "Assignments, lateness and coverage alerts",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/users",
        label: "Users",
        icon: Users,
        permission: "users:read",
        description: "Accounts, roles and access",
      },
      {
        href: "/audit-log",
        label: "Audit Log",
        icon: ScrollText,
        permission: "audit:read",
        description: "Recorded actions, append-only",
      },
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        permission: "settings:read",
        description: "Organisation profile and lateness policy",
      },
    ],
  },
];

/** Items a guard sees, which is a deliberately short list. */
export const GUARD_NAV_SECTIONS: NavSection[] = [
  {
    label: "My Duty",
    items: [
      {
        href: "/my-duty",
        label: "Today's Duty",
        icon: Shield,
        description: "Today's duty, check in and check out",
      },
      {
        href: "/duty-history",
        label: "Duty History",
        icon: History,
        description: "Past deployments and attendance",
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        href: "/notifications",
        label: "Notifications",
        icon: Bell,
        permission: "notifications:read",
        badge: "notifications",
        description: "Assignment changes and shift reminders",
      },
      {
        href: "/profile",
        label: "Profile",
        icon: UserSquare2,
        description: "Your details",
      },
    ],
  },
];

/** Client portal navigation. Read-only, and pointedly shorter than the company's. */
export const CLIENT_NAV_SECTIONS: NavSection[] = [
  {
    label: "Coverage",
    items: [
      {
        href: "/portal",
        label: "Overview",
        icon: LayoutDashboard,
        description: "Your security provider and coverage",
      },
      {
        href: "/portal/live",
        label: "Live Coverage",
        icon: Radio,
        permission: "deployment:read",
        description: "Guards on duty at your sites now",
      },
      {
        href: "/portal/sites",
        label: "Sites",
        icon: MapPinned,
        permission: "sites:read",
        description: "Your locations and their posts",
      },
      {
        href: "/portal/guards",
        label: "Guards",
        icon: UserSquare2,
        permission: "guards:read_public",
        description: "Guards assigned to your sites",
      },
      {
        href: "/portal/duty-history",
        label: "Duty History",
        icon: History,
        permission: "attendance:read",
        description: "Attendance at your sites",
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        href: "/notifications",
        label: "Notifications",
        icon: Bell,
        permission: "notifications:read",
        badge: "notifications",
        description: "Coverage changes",
      },
      {
        href: "/profile",
        label: "Profile",
        icon: UserSquare2,
        description: "Your details",
      },
    ],
  },
];

/**
 * Terminal route for a caller entitled to no surface at all.
 *
 * A redirect target has to be somewhere the reader can stay, and for a role that holds no
 * capability on any page there is no such place. `NO_ACCESS_ROUTE` is that place: it renders for
 * every role, redirects nowhere, and reads nothing. Every other home below is a page that can
 * refuse the role that was sent to it, which is what makes a redirect chain out of it possible.
 */
export const NO_ACCESS_ROUTE = "/no-access";

/**
 * Home route for a role. A guard lands on their duty card, not on an operations dashboard they
 * have no data for; a client lands on their coverage view.
 *
 * **It has to return somewhere the role can actually stay.** Every page that reads unscoped
 * organisation rows sends an unauthorised role here, so the value returned must not itself be a
 * page that redirects back. Pointing a `supervisor` at `/dashboard` or `/dashboard/live` — both of
 * which assert `hasOrgWideScope()`, and correctly so — is a redirect loop rather than a home, and
 * a loop is how a fix for one leak becomes a way to reach it again by pressing back.
 *
 * `/sites` is already the site-scoped destination in `NAV_SECTIONS`, gated on `sites:read`, which
 * is exactly the grant `supervisor` and `site_manager` hold over their assigned sites. It becomes
 * their real home once the scope-filtered board lands there; until then it is a placeholder, which
 * is still a surface they can be sent to without exposing a row they are not entitled to.
 *
 * **The organisation-wide roles are named, not inherited from `default`.** They were relying on it,
 * which meant `default` had to be a surface those two can open — and therefore could not fail
 * closed. A role added to `ROLES` but classified nowhere lands in `default`, and would have been
 * dropped onto `/dashboard`, which sends it straight back here by way of `homeForRole`. It now
 * lands on `NO_ACCESS_ROUTE`: least privilege, and terminal. `Role` is a closed union so the branch
 * is unreachable today; it is written the way the security tests in `src/lib/security.test.ts`
 * already assert an unclassified role should behave.
 */
export function homeForRole(role: Role): string {
  switch (role) {
    case "guard":
      return "/my-duty";
    case "client_admin":
    case "client_viewer":
      return "/portal";
    case "supervisor":
    case "site_manager":
      return "/sites";
    case "platform_admin":
    case "security_company_admin":
      return "/dashboard";
    default:
      return NO_ACCESS_ROUTE;
  }
}

/**
 * The role's home, unless that home is the page asking.
 *
 * A page that fails closed still has to answer the caller with somewhere to go, and `homeForRole`
 * alone cannot guarantee that: when a role's home *is* the page redirecting, the redirect is a
 * loop. `/portal` was the live example — a client role's home is `/portal`, so a client with no
 * `clientId` bounced `/portal` → `/dashboard` → `homeForRole()` → `/portal` forever.
 *
 * So a page whose own path is a role's home must send that role to `NO_ACCESS_ROUTE` instead. The
 * check is written here rather than in each page because "this page might be my own redirect
 * target" is a property of the *mapping*, and duplicating the comparison in every caller is how
 * the next page forgets it.
 *
 * `fromPath` is the path of the page doing the redirect, as it appears in a URL — no query string,
 * no trailing slash — which is what makes it comparable to the literals above.
 */
export function safeHomeForRole(role: Role, fromPath: string): string {
  const home = homeForRole(role);

  return home === fromPath ? NO_ACCESS_ROUTE : home;
}

/**
 * Sections a role should see.
 *
 * Purely a visibility convenience. The server re-checks every permission on every request, so a
 * navigation entry that leaked would reveal a page name and nothing more.
 */
export function sectionsForRole(role: Role): NavSection[] {
  if (role === "guard") {
    return GUARD_NAV_SECTIONS;
  }
  if (role === "client_admin" || role === "client_viewer") {
    return CLIENT_NAV_SECTIONS;
  }
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        (!item.permission || can(role, item.permission)) &&
        (!item.roles || item.roles.includes(role)),
    ),
  }));
}

/** True when the role can see anything with this permission under this label. */
export function hasNavAccess(role: Role, permission: Permission): boolean {
  return can(role, permission);
}

/** Where each role belongs, used by `proxy.ts` for coarse redirects. */
export const PROTECTED_ROOTS = [
  "/dashboard",
  "/dashboard/live",
  "/dashboard/coverage",
  "/dashboard/assignments",
  "/dashboard/attendance",
  "/reports",
  "/guards",
  "/clients",
  "/sites",
  "/stations",
  "/shifts",
  "/users",
  "/audit-log",
  "/settings",
  "/profile",
  "/notifications",
  "/my-duty",
  "/duty-history",
  "/portal",
] as const;

export const LANDING_ROUTES = ["/", "/login", "/register"] as const;
