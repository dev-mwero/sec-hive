"use client";

import { Menu, Moon, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Wordmark } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Public site header.
 *
 * Sticky, hairline-ruled, and quiet. It borrows the app shell's wordmark and theme toggle so the
 * marketing page and the product feel like one product rather than two sites that happen to share
 * a name.
 *
 * The nav collapses to a drawer below `md` with no JavaScript-dependent layout shift: the mobile
 * menu is a plain state toggle, and the bar's height is fixed so opening it cannot shift the
 * document.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Any navigation closes the menu. Without this, tapping a link leaves the drawer covering the
  // section it just scrolled to. Compared against the previous path rather than fired on every
  // render, so the initial mount does not count as a navigation.
  const [lastPath, setLastPath] = useState(pathname);
  useEffect(() => {
    if (pathname !== lastPath) {
      setLastPath(pathname);
      setOpen(false);
    }
  }, [lastPath, pathname]);

  // A drawer that stays open behind a scroll locks the page underneath. Escape and scroll both
  // close it, which is the behaviour people expect from an overlay.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-border-base bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="SecHive home" className="shrink-0">
          <Wordmark />
        </Link>

        <nav aria-label="Site" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {SITE_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-sm px-2.5 py-1.5 text-sm text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex-1" />

        <ThemeToggle />

        <Button
          asChild
          size="sm"
          variant="primary"
          className="hidden sm:inline-flex"
        >
          <Link href="/login">Sign in</Link>
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="tap-expand md:hidden"
        >
          {open ? <X aria-hidden /> : <Menu aria-hidden />}
        </Button>
      </div>

      {open ? (
        <nav
          id="site-menu"
          aria-label="Site"
          className="border-t border-border-base bg-background md:hidden"
        >
          <ul className="mx-auto max-w-[1200px] px-4 py-2 sm:px-6">
            {SITE_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-sm px-2 py-2.5 text-sm text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="px-2 pt-2 pb-3 sm:hidden">
              <Button asChild size="md" variant="primary" className="w-full">
                <Link href="/login">Sign in</Link>
              </Button>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

const SITE_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#roles", label: "Who uses it" },
] as const;

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Null until mounted. Rendering the sun or moon during SSR would disagree with the client's
  // first paint and trip a hydration mismatch on a page nobody is logged into.
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
      className={cn("tap-expand", isDark && "text-accent")}
    >
      {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
