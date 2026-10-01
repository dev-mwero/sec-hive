import { CheckCheck, LogIn, LogOut } from "lucide-react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { RefreshIndicator } from "@/components/shared/refresh-indicator";
import { PostOccupancy } from "@/components/status/post-occupancy";
import { StatusText } from "@/components/status/status-badge";
import { assignmentStatusStyle } from "@/components/status/status-styles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DASHBOARD_POLL_INTERVAL_MS } from "@/constants/domain";
import { safeHomeForRole } from "@/constants/navigation";
import { dummyGuardDuty } from "@/data/dummy";
import { can } from "@/lib/permissions";
import { formatHHMM, timeToMinutes } from "@/lib/time";
import { getSession } from "@/server/auth/session";

/**
 * **My Duty** — the guard's entire world.
 *
 * Built for a phone held in one hand at a gate, often outdoors, sometimes in poor light. That
 * drives every decision:
 *
 * - **One question first: can I check in right now?** The button is the largest thing on the page,
 *   because it is the only irreversible thing a guard does here.
 * - **The clock is stated twice** — what the shift says, and what the phone says — so a guard who
 *   arrives late knows it before they check in rather than after.
 * - **No aggregates.** A guard does not need a coverage percentage. They need their post, their
 *   hours, and their attendance state.
 *
 * A company supervisor has no `attendance:checkin` permission of their own, so this page
 * redirects rather than rendering an inert card.
 */
export default async function MyDutyPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { user } = session;

  // Not a bare `/dashboard`. A supervisor is redirected here for exactly the reason a guard is not,
  // and `/dashboard` answers a supervisor by calling `homeForRole` — so the hop has to be made
  // through the same mapping, and through the variant that refuses to send a role to the page doing
  // the sending. Without that, "send the caller home" is a loop for any role homed here.
  if (!can(user.role, "attendance:checkin")) {
    redirect(safeHomeForRole(user.role, "/my-duty"));
  }

  const generatedAt = new Date();
  const now = generatedAt;

  return (
    <>
      <PageHeader
        eyebrow="My duty"
        title={`Hello, ${user.firstName}`}
        description="Your post, your hours, and what to do right now."
        actions={
          <RefreshIndicator
            generatedAt={generatedAt}
            intervalMs={DASHBOARD_POLL_INTERVAL_MS}
          />
        }
      />

      <div className="space-y-4">
        {dummyGuardDuty.map((duty) => {
          const style = assignmentStatusStyle(duty.assignment.status);
          const start = duty.assignment.scheduledStart;
          const end = duty.assignment.scheduledEnd;
          const checkedInAt = duty.attendance?.actualCheckIn ?? null;

          // The overnight marker already lives in the pre-formatted window string, so it is read
          // from there rather than recomputed and risking a second source of truth.
          const isOvernight =
            duty.assignment.shiftWindow?.includes("(+1)") ?? false;

          return (
            <Card key={duty.assignment.assignmentId}>
              <CardHeader className="flex flex-wrap items-start justify-between gap-3 border-b border-border-base">
                <div className="min-w-0">
                  <p className="label-block mb-1">{duty.assignment.client}</p>
                  <CardTitle className="text-base">
                    {duty.assignment.station}
                  </CardTitle>
                  <p className="mt-0.5 text-xs text-foreground-subtle">
                    {duty.assignment.site} · {duty.assignment.shift}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <PostOccupancy
                    required={duty.assignment.stationRequiredCount}
                    present={duty.assignment.stationPresentCount}
                    size="sm"
                  />
                  <StatusText style={style} />
                </div>
              </CardHeader>

              <CardContent className="p-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <p className="label-block mb-2">Shift window</p>
                    <p className="font-mono text-2xl text-foreground">
                      {formatHHMM(timeToMinutes(start))}
                      <span className="mx-2 text-foreground-subtle">→</span>
                      {formatHHMM(timeToMinutes(end))}
                    </p>
                    <p className="mt-1 font-mono text-2xs text-foreground-subtle">
                      now{" "}
                      {formatHHMM(
                        timeToMinutes(
                          new Date(
                            now.getFullYear(),
                            now.getMonth(),
                            now.getDate(),
                            now.getHours(),
                            now.getMinutes(),
                          ),
                        ),
                      )}
                      {isOvernight ? " · overnight shift" : ""}
                    </p>

                    <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                      <div>
                        <dt className="label-block">Checked in</dt>
                        <dd className="font-mono text-sm text-foreground">
                          {checkedInAt
                            ? formatHHMM(timeToMinutes(checkedInAt))
                            : "not yet"}
                        </dd>
                      </div>
                      <div>
                        <dt className="label-block">Checked out</dt>
                        <dd className="font-mono text-sm text-foreground">
                          {duty.attendance?.actualCheckOut
                            ? formatHHMM(
                                timeToMinutes(duty.attendance.actualCheckOut),
                              )
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* The one action. `type="button"`, not a form submit: the server action arrives
                      with auth, and a button that silently does nothing is worse than a disabled
                      one, so it is disabled with a stated reason. */}
                  <div className="sm:w-56">
                    {duty.canCheckIn ? (
                      <Button
                        type="button"
                        size="lg"
                        variant="primary"
                        className="w-full"
                        disabled
                        title="Available once authentication is wired"
                      >
                        <LogIn aria-hidden />
                        Check in
                      </Button>
                    ) : duty.canCheckOut ? (
                      <Button
                        type="button"
                        size="lg"
                        variant="primary"
                        className="w-full"
                        disabled
                        title="Available once authentication is wired"
                      >
                        <LogOut aria-hidden />
                        Check out
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 rounded-md border border-border-base bg-surface-raised px-3 py-2.5 text-sm text-foreground-muted">
                        <CheckCheck
                          aria-hidden
                          className="size-4 text-covered"
                        />
                        Nothing to do right now
                      </div>
                    )}
                    {/* The footnote only makes sense where there is a button to press. On a
                        finished shift it would be noise that implies unfinished business. */}
                    {duty.canCheckIn || duty.canCheckOut ? (
                      <p className="mt-2 text-center text-2xs text-foreground-subtle">
                        Check-in opens 30 minutes before your shift.
                      </p>
                    ) : null}
                  </div>
                </div>

                {duty.assignment.status === "late" ? (
                  <p className="mt-4 flex items-start gap-2 rounded-md border border-attention/30 bg-attention/10 px-3 py-2 text-xs text-attention">
                    <Badge variant="attention" size="sm">
                      Late
                    </Badge>
                    <span>
                      You are past the grace period for this shift. Your
                      supervisor has been notified. Check in anyway — an
                      accurate record is more useful than a tidy one.
                    </span>
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
