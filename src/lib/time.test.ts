/**
 * Time arithmetic.
 *
 * The cases that matter are the ones that silently produce a plausible-looking wrong answer:
 * an overnight shift whose end lands on the wrong day, and two shifts that touch at midnight
 * being treated as an overlap.
 */

import { describe, expect, it } from "vitest";

import {
  addDaysToIsoDate,
  formatDateTime,
  formatHHMM,
  formatShiftWindow,
  MINUTES_PER_DAY,
  materialiseShiftWindow,
  minutesToTime,
  normalizeMinutes,
  shiftCrossesMidnight,
  shiftDurationMinutes,
  timeToMinutes,
  toIsoDate,
  windowsOverlap,
} from "@/lib/time";

const HOUR = 60;

describe("timeToMinutes", () => {
  it("parses HH:mm", () => {
    expect(timeToMinutes("06:00")).toBe(6 * HOUR);
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("23:59")).toBe(23 * HOUR + 59);
  });

  it("accepts single-digit hours", () => {
    expect(timeToMinutes("6:05")).toBe(6 * HOUR + 5);
  });

  it("round-trips through minutesToTime", () => {
    for (const minutes of [0, 1, 359, 360, 719, 720, 1439]) {
      expect(timeToMinutes(minutesToTime(minutes))).toBe(minutes);
    }
  });

  it("pins wall-clock times to the reference day so the year never reaches the UI", () => {
    expect(minutesToTime(360).toISOString()).toBe("1970-01-01T06:00:00.000Z");
  });

  it("rejects anything that is not HH:mm", () => {
    // A permissive parser here is how "6:0" and "0600" quietly become 360 and NaN.
    expect(() => timeToMinutes("6:0")).toThrow(TypeError);
    expect(() => timeToMinutes("0600")).toThrow(TypeError);
    expect(() => timeToMinutes("")).toThrow(TypeError);
    expect(() => timeToMinutes("abc")).toThrow(TypeError);
  });
});

describe("normalizeMinutes", () => {
  it("wraps out-of-range values into a single day", () => {
    expect(normalizeMinutes(-1)).toBe(MINUTES_PER_DAY - 1);
    expect(normalizeMinutes(MINUTES_PER_DAY)).toBe(0);
    expect(normalizeMinutes(MINUTES_PER_DAY + 90)).toBe(90);
  });
});

describe("formatHHMM", () => {
  it("zero-pads both components", () => {
    expect(formatHHMM(0)).toBe("00:00");
    expect(formatHHMM(65)).toBe("01:05");
    expect(formatHHMM(1439)).toBe("23:59");
  });
});

describe("shiftCrossesMidnight", () => {
  it("treats an end at or before the start as overnight", () => {
    // Equality counts as crossing: a 00:00–00:00 shift is a 24-hour shift, not a zero-length one.
    expect(shiftCrossesMidnight(18 * HOUR, 6 * HOUR)).toBe(true);
    expect(shiftCrossesMidnight(0, 0)).toBe(true);
  });

  it("is false when the shift ends later the same day", () => {
    expect(shiftCrossesMidnight(6 * HOUR, 18 * HOUR)).toBe(false);
    expect(shiftCrossesMidnight(6 * HOUR, 6 * HOUR + 1)).toBe(false);
  });
});

describe("shiftDurationMinutes", () => {
  it("is the simple difference within one day", () => {
    expect(shiftDurationMinutes(6 * HOUR, 18 * HOUR)).toBe(12 * HOUR);
  });

  it("wraps for an overnight shift instead of going negative", () => {
    expect(shiftDurationMinutes(18 * HOUR, 6 * HOUR)).toBe(12 * HOUR);
  });

  it("treats an equal start and end as a full day, not zero", () => {
    expect(shiftDurationMinutes(8 * HOUR, 8 * HOUR)).toBe(MINUTES_PER_DAY);
  });
});

describe("formatShiftWindow", () => {
  it("formats a same-day window", () => {
    expect(formatShiftWindow(6 * HOUR, 18 * HOUR)).toBe("06:00 – 18:00");
  });

  it("marks an overnight window with (+1)", () => {
    expect(formatShiftWindow(18 * HOUR, 6 * HOUR)).toBe("18:00 – 06:00 (+1)");
  });
});

describe("materialiseShiftWindow", () => {
  it("places both ends on the same day for a same-day shift", () => {
    const { scheduledStart, scheduledEnd, crossesMidnight } =
      materialiseShiftWindow("2026-03-14", 6 * HOUR, 18 * HOUR);

    expect(crossesMidnight).toBe(false);
    expect(scheduledStart.toISOString()).toBe("2026-03-14T06:00:00.000Z");
    expect(scheduledEnd.toISOString()).toBe("2026-03-14T18:00:00.000Z");
  });

  it("lands an overnight shift's end on the NEXT day", () => {
    // The classic off-by-one: 18:00 → 06:00 on the same date gives a 12-hour shift that ends
    // twelve hours before it begins.
    const { scheduledStart, scheduledEnd, crossesMidnight } =
      materialiseShiftWindow("2026-03-14", 18 * HOUR, 6 * HOUR);

    expect(crossesMidnight).toBe(true);
    expect(scheduledStart.toISOString()).toBe("2026-03-14T18:00:00.000Z");
    expect(scheduledEnd.toISOString()).toBe("2026-03-15T06:00:00.000Z");
    expect(scheduledEnd.getTime() - scheduledStart.getTime()).toBe(
      12 * HOUR * 60_000,
    );
  });

  it("rolls an overnight shift that starts on the last day of a month", () => {
    const { scheduledEnd } = materialiseShiftWindow(
      "2026-01-31",
      18 * HOUR,
      6 * HOUR,
    );
    expect(toIsoDate(scheduledEnd)).toBe("2026-02-01");
  });

  it("applies a timezone offset so 06:00 local is 06:00 local", () => {
    // EAT is UTC+3. A 06:00 shift in Nairobi is 03:00 UTC, so the stored instant must shift by
    // the offset or every shift reads three hours early.
    const { scheduledStart } = materialiseShiftWindow(
      "2026-03-14",
      6 * HOUR,
      18 * HOUR,
      180,
    );
    expect(scheduledStart.toISOString()).toBe("2026-03-14T03:00:00.000Z");
  });

  it("keeps an overnight shift spanning midnight in the right timezone", () => {
    const { scheduledStart, scheduledEnd } = materialiseShiftWindow(
      "2026-03-14",
      18 * HOUR,
      6 * HOUR,
      180,
    );
    expect(scheduledStart.toISOString()).toBe("2026-03-14T15:00:00.000Z");
    expect(scheduledEnd.toISOString()).toBe("2026-03-15T03:00:00.000Z");
  });

  it("rejects a malformed date instead of producing NaN", () => {
    expect(() =>
      materialiseShiftWindow("2026-3-14", 6 * HOUR, 18 * HOUR),
    ).not.toThrow();
    expect(() =>
      materialiseShiftWindow("not-a-date", 6 * HOUR, 18 * HOUR),
    ).toThrow(TypeError);
  });
});

describe("addDaysToIsoDate", () => {
  it("rolls over month and year boundaries", () => {
    expect(addDaysToIsoDate("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysToIsoDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToIsoDate("2024-02-28", 1)).toBe("2024-02-29");
  });
});

describe("windowsOverlap", () => {
  const at = (iso: string) => new Date(iso);

  it("detects a genuine overlap", () => {
    expect(
      windowsOverlap(
        at("2026-03-14T06:00:00Z"),
        at("2026-03-14T18:00:00Z"),
        at("2026-03-14T12:00:00Z"),
        at("2026-03-15T00:00:00Z"),
      ),
    ).toBe(true);
  });

  it("does NOT treat back-to-back shifts as overlapping", () => {
    // Half-open intervals: one guard working 06:00–18:00 and 18:00–06:00 is a normal double, not
    // a conflict. A closed interval would reject every overnight handover.
    expect(
      windowsOverlap(
        at("2026-03-14T06:00:00Z"),
        at("2026-03-14T18:00:00Z"),
        at("2026-03-14T18:00:00Z"),
        at("2026-03-15T06:00:00Z"),
      ),
    ).toBe(false);
  });

  it("detects a shift fully contained inside another", () => {
    expect(
      windowsOverlap(
        at("2026-03-14T00:00:00Z"),
        at("2026-03-15T00:00:00Z"),
        at("2026-03-14T08:00:00Z"),
        at("2026-03-14T12:00:00Z"),
      ),
    ).toBe(true);
  });

  it("does not overlap disjoint shifts on different days", () => {
    expect(
      windowsOverlap(
        at("2026-03-14T06:00:00Z"),
        at("2026-03-14T18:00:00Z"),
        at("2026-03-15T06:00:00Z"),
        at("2026-03-15T18:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("formatDateTime", () => {
  it("renders the format audit metadata and CSV exports rely on", () => {
    expect(formatDateTime(new Date("2026-03-14T06:07:00Z"))).toBe(
      "2026-03-14 06:07",
    );
  });

  it("renders an em dash for a missing value rather than Invalid Date", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });
});
