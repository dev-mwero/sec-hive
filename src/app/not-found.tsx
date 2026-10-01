import Link from "next/link";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { Button } from "@/components/ui/button";

/**
 * 404.
 *
 * A public site needs a real dead end: the Next.js default is an unstyled white page that makes
 * the product look broken. This keeps the site chrome and offers the two places worth going.
 *
 * Not a 403 and not a 404 for permission failures — those return 404 by design, so a client
 * following a stale link cannot confirm that another client's data exists.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader />

      <main className="mx-auto flex max-w-[1200px] flex-col items-start px-4 py-24 sm:px-6">
        <p className="font-mono text-5xl font-bold text-accent">404</p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Nothing posted at this address
        </h1>
        <p className="mt-3 max-w-lg text-base leading-relaxed text-foreground-muted">
          The page may have moved, or the link may be out of date. If you were
          sent here from inside the product, the record you followed has
          probably been renamed or removed.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" variant="primary">
            <Link href="/">Back to the site</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/dashboard">Open the board</Link>
          </Button>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
