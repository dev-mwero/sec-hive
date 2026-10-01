import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  FileClock,
  LayoutGrid,
  Radio,
  ScrollText,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MarketingBoard } from "@/components/marketing/marketing-board";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "SecHive — Know Who's on Guard",
  description:
    "Live guard deployment, duty assignments and post coverage for security companies. See who is on post right now, whether they turned up, and what your client is paying for.",
};

/**
 * Public landing page.
 *
 * The argument is built as a proof rather than a promise: the hero renders the real Live
 * Deployment board, so what a visitor sees on arrival is what an operator sees on shift. Every
 * claim after it is one an operator can check against that board.
 *
 * This route is deliberately free of session reads and of `src/data/dummy.ts`. It is the one page
 * that has to work with nobody signed in, so it must not depend on who is signed in.
 */
export default function Home() {
  return (
    <>
      <SiteHeader />

      <main>
        <Hero />
        <TheThreeQuestions />
        <Capabilities />
        <HowItWorks />
        <WhoUsesIt />
        <ClosingCallToAction />
      </main>

      <SiteFooter />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border-base">
      {/* Floodlight wash. One amber source, low opacity, positioned as if it were falling from
          the top of the compound — the product's name taken literally, and the only gradient in
          the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_-10%,var(--accent-subtle),transparent_70%)]"
      />

      <div className="relative mx-auto max-w-[1200px] px-4 pt-16 pb-12 sm:px-6 sm:pt-24 sm:pb-16">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14">
          <div>
            <Badge variant="accent" size="md">
              Guard deployment platform
            </Badge>

            <h1 className="mt-5 text-4xl leading-[1.05] font-bold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
              Know who&apos;s on guard.
              <span className="block text-accent">Right now.</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-pretty text-foreground-muted sm:text-lg">
              SecHive replaces the WhatsApp group, the paper duty roster and the
              Monday morning argument. One board shows every post across every
              client — who reported, who is late, and which gate is standing
              empty.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="xl" variant="primary">
                <Link href="/login">
                  Open the board
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline">
                <a href="#product">See what it covers</a>
              </Button>
            </div>

            <p className="mt-6 font-mono text-2xs text-foreground-subtle">
              Live views refresh every 30 seconds · no special hardware · works
              on a phone
            </p>
          </div>

          <MarketingBoard />
        </div>
      </div>
    </section>
  );
}

/**
 * The three questions.
 *
 * Ordered by how badly they cost money when unanswered. Not a feature list — a list of problems,
 * which is what a security company owner actually arrives with.
 */
function TheThreeQuestions() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6">
      <SectionHeading
        eyebrow="The problem"
        title="Three questions, one screen"
        description="Every feature below exists to answer one of these. If a feature does not, it is not in the product."
      />

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {QUESTIONS.map((q, index) => (
          <Card key={q.title} className="relative overflow-hidden">
            {/* Oversized numeral in the accent, bleeding off the edge. A duty-sheet field number,
                and a way to make three identical cards read as a sequence. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -top-4 right-2 font-mono text-7xl leading-none font-bold text-accent/10"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <CardContent className="relative p-5">
              <q.icon aria-hidden className="size-5 text-accent" />
              <h3 className="mt-4 text-base font-semibold text-foreground">
                {q.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
                {q.body}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

const QUESTIONS = [
  {
    icon: Radio,
    title: "Is every post covered?",
    body: "Each station has a required guard count and the board shows how many are actually there. Uncovered posts are flagged on the station, on the site header and in a counter — you cannot miss them by accident.",
  },
  {
    icon: CalendarClock,
    title: "Did they turn up?",
    body: "Guards check in from their own phone. Lateness is measured against a grace period you set, so a traffic jam is not recorded as misconduct and a guard who never arrived is not recorded as present.",
  },
  {
    icon: LayoutGrid,
    title: "What is my client seeing?",
    body: "Clients get their own read-only portal, scoped to their sites only. They can check coverage without phoning your office at two in the morning, and they never see another client's roster.",
  },
] as const;

/** Capability grid. Deliberately short — six things the product actually does. */
function Capabilities() {
  return (
    <section
      id="product"
      className="scroll-mt-16 border-y border-border-base bg-surface-inset"
    >
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="Capabilities"
          title="What it does"
          description="Built around one screen and the records behind it. No payroll, no scheduling optimisation, no app marketplace."
        />

        <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-border-base bg-border-base sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((cap) => (
            <div key={cap.title} className="bg-surface p-5">
              <cap.icon aria-hidden className="size-4 text-accent" />
              <h3 className="mt-3 text-sm font-semibold text-foreground">
                {cap.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground-muted">
                {cap.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const CAPABILITIES = [
  {
    icon: Radio,
    title: "Live deployment board",
    body: "Grouped by client, then site, with lateness and absence sorted to the top. Refreshes every 30 seconds and tells you how old the reading is.",
  },
  {
    icon: ShieldCheck,
    title: "Post occupancy",
    body: "Required against present, per station. Slots fill like a physical post board, so coverage reads at a glance across a room.",
  },
  {
    icon: CalendarClock,
    title: "Grace-period lateness",
    body: "Each organisation sets its own grace period. Check-in is only flagged late once that window closes, and the minutes overdue are shown.",
  },
  {
    icon: ClipboardList,
    title: "Duty assignments",
    body: "Day, night and overnight shifts with the end date handled properly. Overlapping assignments are refused rather than silently created.",
  },
  {
    icon: UserCog,
    title: "Role-scoped access",
    body: "Seven roles, each scoped to the right slice — the whole company, assigned sites, one client, or just your own duty. Scoping narrows, it never widens.",
  },
  {
    icon: ScrollText,
    title: "Audit trail",
    body: "Approvals, corrections, exports and access changes are recorded and append-only, so a disputed incident has a record rather than an argument.",
  },
] as const;

/** Three steps. Each names the thing the user actually has to do. */
function HowItWorks() {
  return (
    <section
      id="how"
      className="scroll-mt-16 mx-auto max-w-[1200px] px-4 py-20 sm:px-6"
    >
      <SectionHeading
        eyebrow="How it works"
        title="Three steps to a live board"
        description="No migration, no hardware, no field training beyond 'tap your name to check in'."
      />

      <ol className="mt-10 grid gap-6 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="relative">
            {/* Connecting rule, like a form's continuation line. Hidden on the last item so it
                does not run off the edge of the row. */}
            {index < STEPS.length - 1 ? (
              <span
                aria-hidden
                className="absolute top-4 left-11 hidden h-px w-[calc(100%-3rem)] bg-border-base md:block"
              />
            ) : null}
            <div className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent-subtle font-mono text-xs font-bold text-accent">
                {index + 1}
              </span>
              <h3 className="text-sm font-semibold text-foreground">
                {step.title}
              </h3>
            </div>
            <p className="mt-3 pl-11 text-sm leading-relaxed text-foreground-muted">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const STEPS = [
  {
    title: "Describe your estate",
    body: "Add clients, their sites, the posts at each site, and how many guards a post needs while open. This is the structure everything else hangs off.",
  },
  {
    title: "Roster guards onto shifts",
    body: "Assign guards to day, night or overnight shifts. The system refuses overlapping assignments so a roster cannot contradict itself.",
  },
  {
    title: "Watch it live",
    body: "Guards check in from their phones. The board shows exceptions first, and clients see their own coverage without calling you.",
  },
] as const;

/** Who uses it — one card per person who logs in. */
function WhoUsesIt() {
  return (
    <section
      id="roles"
      className="scroll-mt-16 border-y border-border-base bg-surface-inset"
    >
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="Who uses it"
          title="Four people, four screens"
          description="Each role sees only what it needs. A guard's page has no counters and a client's has no staffing detail."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((role) => (
            <Card key={role.name}>
              <CardContent className="p-5">
                <p className="label-block">{role.kind}</p>
                <h3 className="mt-2 text-base font-semibold text-foreground">
                  {role.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
                  {role.body}
                </p>
                <p className="mt-3 font-mono text-2xs text-accent">
                  {role.screen}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

const ROLES = [
  {
    kind: "Company",
    name: "Owners and admins",
    body: "Coverage across every client, staff records, approvals and the audit trail.",
    screen: "/dashboard",
  },
  {
    kind: "Field",
    name: "Supervisors",
    body: "Only the sites they are assigned to. Roster, spot a late guard, act.",
    screen: "/dashboard/live",
  },
  {
    kind: "Front line",
    name: "Guards",
    body: "One card: today's post, the hours, check in and check out. Built for a phone.",
    screen: "/my-duty",
  },
  {
    kind: "Customer",
    name: "Client contacts",
    body: "Read-only coverage at their own sites. No other client's roster is reachable.",
    screen: "/portal",
  },
] as const;

function ClosingCallToAction() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6">
      <div className="panel relative overflow-hidden p-8 sm:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_0%,var(--accent-subtle),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-2xl text-center">
          <p className="label-block">Get started</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-balance text-foreground sm:text-3xl">
            Stop finding out about an empty post from the client.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-pretty text-foreground-muted">
            Set up your clients and posts, roster the week, and open the board
            before the first guard clocking in.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="xl" variant="primary">
              <Link href="/login">
                Open the board
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          <p className="mt-6 inline-flex items-center gap-2 text-2xs text-foreground-subtle">
            <FileClock aria-hidden className="size-3" />
            Figures in this page are illustrative samples, not live deployments.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Shared section header.
 *
 * The eyebrow is the block lettering from the app's tables, so the marketing page inherits the
 * duty-sheet identity rather than inventing a second visual language.
 */
function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="label-block">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-balance text-foreground sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 text-base leading-relaxed text-pretty text-foreground-muted">
        {description}
      </p>
    </div>
  );
}
