import Link from "next/link";

import { Wordmark } from "@/components/layout/brand";

/**
 * Site footer.
 *
 * A server component — it holds no state, so making it a client component would only add
 * hydration weight to the first paint.
 */
export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border-base bg-surface-inset">
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Wordmark />
            <p className="mt-3 text-sm leading-relaxed text-foreground-muted">
              Deployment visibility for security companies. Know who is on post,
              whether they turned up, and what your client is paying for.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:gap-14">
            <FooterColumn
              title="Product"
              links={[
                { href: "#product", label: "Capabilities" },
                { href: "#how", label: "How it works" },
                { href: "#roles", label: "Who uses it" },
              ]}
            />
            <FooterColumn
              title="Access"
              links={[{ href: "/login", label: "Sign in" }]}
            />
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-border-base pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-2xs text-foreground-subtle">
            © {new Date().getFullYear()} SecHive
          </p>
          <p className="text-2xs text-foreground-subtle">
            Built for guards who work nights, and the people who answer for
            them.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: readonly { href: string; label: string }[];
}) {
  return (
    <div>
      <p className="label-block mb-3">{title}</p>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-foreground-muted transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
