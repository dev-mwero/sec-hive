/**
 * Status semantics.
 *
 * One source of truth for "what does this status look like". Every status in SecHive is
 * communicated as **text + icon + colour**, never colour alone (WCAG 1.4.1), because status is
 * the single most important signal in the product and roughly one in twelve men has some form of
 * colour vision deficiency. An amber row and a red row must be distinguishable in greyscale and
 * to a screen reader.
 *
 * The icon is load-bearing, not decorative: it is the redundant channel that survives a
 * monochrome display, a printed roster and a colourblind reader.
 *
 * Labels come from `constants/domain.ts` so the API, the UI and a CSV export all say the same
 * thing.
 */

import type { LucideIcon } from "lucide-react";
import {
  AlarmClockOff,
  BadgeCheck,
  Ban,
  CalendarClock,
  CheckCheck,
  CircleDot,
  Clock,
  LogIn,
  LogOut,
  MinusCircle,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  UserX,
} from "lucide-react";

import type {
  AssignmentStatus,
  AttendanceStatus,
  CoverageStatus,
} from "@/constants/domain";
import {
  ASSIGNMENT_STATUS_LABELS,
  ATTENDANCE_STATUS_LABELS,
  COVERAGE_STATUS_LABELS,
} from "@/constants/domain";

export type StatusTone = "covered" | "attention" | "critical" | "neutral";

export type StatusStyle = {
  /** Machine value. */
  value: string;
  /** Always-uppercase display text. Never abbreviated to a single letter. */
  label: string;
  tone: StatusTone;
  icon: LucideIcon;
  /** Human explanation shown in tooltips and detail views. */
  description: string;
};

/**
 * Assignment status.
 *
 * Tone follows operational meaning, not sentiment: `on_duty` is good, `completed` is good, and
 * both are "covered". `late` and `absent` are problems. `cancelled` is neutral — it is
 * information, not an alarm.
 */
export const ASSIGNMENT_STATUS_STYLES: Record<AssignmentStatus, StatusStyle> = {
  scheduled: {
    value: "scheduled",
    label: ASSIGNMENT_STATUS_LABELS.scheduled,
    tone: "neutral",
    icon: CalendarClock,
    description: "Booked for this shift. The guard has not reported yet.",
  },
  on_duty: {
    value: "on_duty",
    label: ASSIGNMENT_STATUS_LABELS.on_duty,
    tone: "covered",
    icon: ShieldCheck,
    description: "Checked in and within the shift window.",
  },
  late: {
    value: "late",
    label: ASSIGNMENT_STATUS_LABELS.late,
    tone: "attention",
    icon: Clock,
    description: "Checked in after the shift started plus the grace period.",
  },
  absent: {
    value: "absent",
    label: ASSIGNMENT_STATUS_LABELS.absent,
    tone: "critical",
    icon: UserX,
    description: "Did not report for the shift.",
  },
  checked_out: {
    value: "checked_out",
    label: ASSIGNMENT_STATUS_LABELS.checked_out,
    tone: "covered",
    icon: LogOut,
    description: "Checked out before the shift ended.",
  },
  completed: {
    value: "completed",
    label: ASSIGNMENT_STATUS_LABELS.completed,
    tone: "covered",
    icon: BadgeCheck,
    description: "Checked in and checked out, shift completed.",
  },
  cancelled: {
    value: "cancelled",
    label: ASSIGNMENT_STATUS_LABELS.cancelled,
    tone: "neutral",
    icon: Ban,
    description: "Duty withdrawn before the shift started.",
  },
};

/** Attendance status shares the assignment vocabulary where the meanings align. */
export const ATTENDANCE_STATUS_STYLES: Record<AttendanceStatus, StatusStyle> = {
  present: {
    value: "present",
    label: ATTENDANCE_STATUS_LABELS.present,
    tone: "covered",
    icon: ShieldCheck,
    description: "Checked in within the grace period.",
  },
  late: {
    value: "late",
    label: ATTENDANCE_STATUS_LABELS.late,
    tone: "attention",
    icon: Clock,
    description: "Checked in after the grace period.",
  },
  absent: {
    value: "absent",
    label: ATTENDANCE_STATUS_LABELS.absent,
    tone: "critical",
    icon: UserX,
    description: "Never checked in.",
  },
  checked_out: {
    value: "checked_out",
    label: ATTENDANCE_STATUS_LABELS.checked_out,
    tone: "covered",
    icon: LogOut,
    description: "Checked out.",
  },
  early_departure: {
    value: "early_departure",
    label: ATTENDANCE_STATUS_LABELS.early_departure,
    tone: "attention",
    icon: AlarmClockOff,
    description: "Checked out before the scheduled end plus the grace period.",
  },
};

/**
 * Coverage status.
 *
 * Uses a distinct icon set from assignment status on purpose: coverage answers "is this post
 * filled?", assignment answers "what is this guard doing?". Reusing the same icons would make the
 * two questions ambiguous when both appear on one screen — the supervisor view shows both.
 */
export const COVERAGE_STATUS_STYLES: Record<CoverageStatus, StatusStyle> = {
  covered: {
    value: "covered",
    label: COVERAGE_STATUS_LABELS.covered,
    tone: "covered",
    icon: CheckCheck,
    description: "Every required guard is present at the post.",
  },
  partially_covered: {
    value: "partially_covered",
    label: COVERAGE_STATUS_LABELS.partially_covered,
    tone: "attention",
    icon: MinusCircle,
    description: "Some required guards are missing from the post.",
  },
  uncovered: {
    value: "uncovered",
    label: COVERAGE_STATUS_LABELS.uncovered,
    tone: "critical",
    icon: ShieldX,
    description: "No guards are present at the post.",
  },
};

/** Severity ordering, for sorting problem-first lists. */
export const TONE_SEVERITY: Record<StatusTone, number> = {
  critical: 0,
  attention: 1,
  neutral: 2,
  covered: 3,
};

/** Static badge styling per tone. Text colour always meets contrast on its own background. */
export const TONE_CLASSES: Record<StatusTone, string> = {
  covered:
    "bg-covered-subtle text-covered border-covered/25 hover:bg-covered-subtle",
  attention:
    "bg-attention-subtle text-attention border-attention/25 hover:bg-attention-subtle",
  critical:
    "bg-critical-subtle text-critical border-critical/25 hover:bg-critical-subtle",
  neutral:
    "bg-neutral-subtle text-neutral-signal border-neutral-signal/25 hover:bg-neutral-subtle",
};

/** Dot/marker styling for dense inline use (tables, board rows). */
export const TONE_DOT_CLASSES: Record<StatusTone, string> = {
  covered: "bg-covered",
  attention: "bg-attention",
  critical: "bg-critical",
  neutral: "bg-neutral-signal",
};

/** Left-edge rule used to mark a whole row's status. */
export const TONE_EDGE_CLASSES: Record<StatusTone, string> = {
  covered: "bg-covered",
  attention: "bg-attention",
  critical: "bg-critical",
  neutral: "bg-neutral-signal",
};

export function assignmentStatusStyle(status: AssignmentStatus): StatusStyle {
  return ASSIGNMENT_STATUS_STYLES[status] ?? ASSIGNMENT_STATUS_STYLES.scheduled;
}

export function coverageStatusStyle(status: CoverageStatus): StatusStyle {
  return COVERAGE_STATUS_STYLES[status] ?? COVERAGE_STATUS_STYLES.covered;
}

export function attendanceStatusStyle(status: AttendanceStatus): StatusStyle {
  return ATTENDANCE_STATUS_STYLES[status] ?? ATTENDANCE_STATUS_STYLES.present;
}

/**
 * Derives coverage from counts.
 *
 * `required === 0` is explicitly *not* uncovered — a post nobody is required to staff is not a
 * coverage failure, and treating it as one would put a permanently red row on every board.
 */
export function deriveCoverageStatus(
  required: number,
  present: number,
): CoverageStatus {
  if (required <= 0) {
    return "covered";
  }
  if (present <= 0) {
    return "uncovered";
  }
  if (present < required) {
    return "partially_covered";
  }
  return "covered";
}

export { ShieldAlert, CircleDot, LogIn };
