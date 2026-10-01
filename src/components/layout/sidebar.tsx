"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Wordmark } from "@/components/layout/brand";
import type { Role } from "@/constants/domain";
import { type NavSection, sectionsForRole } from "@/constants/navigation";
import { cn } from "@/lib/utils";

/**
 * Sidebar.
 *
 * Presentation only. Which items appear is decided by `sectionsForRole`, which consults the same
 * permission matrix the server enforces — so navigation cannot drift from authorisation, even
 * though hiding an item is a convenience rather than a control.
 *
 * Active state uses a left amber rule plus weight, not colour alone, so it survives greyscale.
 */
export function Sidebar({
  role,
  organisationName,
  onNavigate,
  className,
}: {
  role: Role;
  organisationName: string | undefined;
  /** Called after a navigation so the mobile drawer can close itself. */
  onNavigate?: (() => void) | undefined;
  className?: string;
}) {
  const pathname = usePathname();
  const sections = sectionsForRole(role);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex h-14 shrink-0 items-center border-b border-border-base px-4">
        <Link href="/" className="min-w-0 outline-none">
          <Wordmark organisationName={organisationName} />
        </Link>
      </div>

      <nav
        aria-label="Main"
        className="min-h-0 flex-1 overflow-y-auto px-2 py-4"
      >
        {sections.map((section) => (
          <NavGroup
            key={section.label}
            section={section}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </div>
  );
}

function NavGroup({
  section,
  pathname,
  onNavigate,
}: {
  section: NavSection;
  pathname: string | null;
  onNavigate: (() => void) | undefined;
}) {
  if (section.items.length === 0) {
    return null;
  }

  return (
    <div className="mb-5 last:mb-0">
      <p className="label-block px-2.5 pb-1.5">{section.label}</p>
      <ul className="space-y-0.5">
        {section.items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={item.description}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-md py-2 pr-2.5 pl-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-surface-raised font-semibold text-foreground"
                    : "text-foreground-muted hover:bg-surface-raised/60 hover:text-foreground",
                )}
              >
                {/* Left rule carries active state without relying on hue. */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-1.5 left-0 w-[2px] rounded-full transition-colors",
                    active ? "bg-accent" : "bg-transparent",
                  )}
                />
                <Icon
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-accent" : "text-foreground-subtle",
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Exact match for `/dashboard`, prefix match for everything else.
 *
 * `item.href === pathname` is not enough on its own: `/portal` must not stay active while the
 * user is on `/portal/live`. The trailing slash is stripped because Next normalises paths.
 */
function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) {
    return false;
  }
  const current = pathname.replace(/\/$/, "") || "/";
  if (current === href) {
    return true;
  }
  return current.startsWith(`${href}/`);
}

/** Mobile drawer close affordance, rendered by the parent sheet. */
export function DrawerClose({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close navigation"
      className="inline-flex size-8 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <X aria-hidden className="size-4" />
    </button>
  );
}
