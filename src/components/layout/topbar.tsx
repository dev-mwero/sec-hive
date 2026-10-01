"use client";

import { Bell, LogOut, Menu, Monitor, Moon, Sun, User } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { HiveMark, RoleChip } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, type Role } from "@/constants/domain";
import { cn, initialsFromName } from "@/lib/utils";

/**
 * Topbar.
 *
 * Deliberately thin. On a duty board the screen space belongs to the roster, so the topbar
 * carries only what changes minute to minute: who is signed in, what time it is, what needs
 * attention.
 *
 * A **live clock** is not decoration. Every judgement in this product is time-relative — is this
 * guard late, has this shift ended — so the operator's clock is part of the data, not chrome.
 */
export function Topbar({
  role,
  userName,
  email,
  unreadCount = 0,
  onOpenNav,
}: {
  role: Role;
  userName: string;
  email: string;
  unreadCount?: number;
  onOpenNav: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-base bg-surface px-3 sm:px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="lg:hidden"
      >
        <Menu aria-hidden />
      </Button>

      <Link href="/" className="lg:hidden" aria-label="SecHive home">
        <HiveMark size={24} />
      </Link>

      <div className="flex-1" />

      <OperatorClock />

      <NotificationBell count={unreadCount} />

      <ThemeToggle />

      <UserMenu role={role} name={userName} email={email} />
    </header>
  );
}

/**
 * Local time plus an explicit timezone label.
 *
 * Without the zone, an operator comparing a clock on the board against a guard's report has no
 * way to know whether they are comparing the same clock. Stated once, here, rather than assumed.
 */
function OperatorClock() {
  const [now, setNow] = useState<Date | null>(null);
  const [zone, setZone] = useState<string>("");

  // Renders nothing until mounted so the server and client markup match — a clock rendered from
  // `new Date()` during SSR would produce a hydration mismatch.
  useEffect(() => {
    setNow(new Date());
    setZone(
      Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " "),
    );
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!now) {
    return <div className="hidden h-8 w-28 sm:block" aria-hidden />;
  }

  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return (
    <div
      className="hidden items-center gap-2 border-r border-border-base pr-3 sm:flex"
      title={`Local time (${zone})`}
    >
      <time
        dateTime={now.toISOString()}
        data-numeric
        className="font-mono text-sm text-foreground"
      >
        {time}
      </time>
      <span className="max-w-24 truncate text-2xs text-foreground-subtle">
        {zone}
      </span>
    </div>
  );
}

function NotificationBell({ count }: { count: number }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      asChild
      aria-label={
        count > 0 ? `Notifications, ${count} unread` : "Notifications"
      }
    >
      <Link href="/notifications" className="relative">
        <Bell aria-hidden />
        {count > 0 ? (
          <span
            className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-attention px-1 font-mono text-[10px] leading-4 font-semibold text-background"
            aria-hidden
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="size-8" aria-hidden />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
    >
      {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}

function UserMenu({
  role,
  name,
  email,
}: {
  role: Role;
  name: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest("[data-user-menu]")) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" data-user-menu>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-md py-1 pr-1 pl-1.5 transition-colors hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-sm bg-accent-subtle font-mono text-2xs font-semibold text-accent"
        >
          {initialsFromName(name)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-32 truncate text-xs leading-tight font-semibold text-foreground">
            {name}
          </span>
          <span className="block max-w-32 truncate text-2xs leading-tight text-foreground-subtle">
            {ROLE_LABELS[role]}
          </span>
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="panel absolute right-0 z-50 mt-2 w-60 overflow-hidden shadow-[var(--shadow-popover)]"
        >
          <div className="border-b border-border-base px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-foreground">
              {name}
            </p>
            <p className="truncate text-xs text-foreground-subtle">{email}</p>
            <RoleChip role={role} />
          </div>
          <div className="p-1">
            <Link
              href="/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <User aria-hidden className="size-3.5" />
              Profile
            </Link>
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground",
                role === "guard" && "pointer-events-none opacity-40",
              )}
              aria-disabled={role === "guard"}
            >
              <Monitor aria-hidden className="size-3.5" />
              Organisation settings
            </Link>
          </div>
          <div className="border-t border-border-base p-1">
            <form action="/api/auth/signout" method="post">
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground"
              >
                <LogOut aria-hidden className="size-3.5" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
