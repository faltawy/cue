import { describe, expect, test } from "vitest";

import { eventCalendarDay, eventCalendarDays } from "./event-day";

describe("eventCalendarDay", () => {
  test("keeps Outlook all-day dates on the calendar day west of UTC", () => {
    expect(
      eventCalendarDay("2026-08-27T00:00:00", true, "America/Los_Angeles"),
    ).toBe("2026-08-27");
    expect(
      eventCalendarDay(
        "2026-08-27T00:00:00+00:00",
        true,
        "America/Los_Angeles",
      ),
    ).toBe("2026-08-27");
  });

  test("groups timed events by the instant in the display timezone", () => {
    expect(
      eventCalendarDay(
        "2026-08-27T02:00:00+00:00",
        false,
        "America/Los_Angeles",
      ),
    ).toBe("2026-08-26");
    expect(
      eventCalendarDay("2026-08-27T12:00:00.0000000", false, "Europe/Paris"),
    ).toBe("2026-08-27");
  });
});

describe("eventCalendarDays", () => {
  test("lists every day of a multi-day all-day event, end date exclusive", () => {
    expect(
      eventCalendarDays("2026-10-20", "2026-10-23", true, "Europe/Berlin"),
    ).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
    expect(
      eventCalendarDays("2026-10-31", "2026-11-02", true, "Europe/Berlin"),
    ).toEqual(["2026-10-31", "2026-11-01"]);
  });

  test("keeps single-day events on one day", () => {
    expect(
      eventCalendarDays("2026-10-20", "2026-10-21", true, "Europe/Berlin"),
    ).toEqual(["2026-10-20"]);
    expect(
      eventCalendarDays(
        "2026-10-20T09:00:00+02:00",
        "2026-10-21T00:00:00+02:00",
        false,
        "Europe/Berlin",
      ),
    ).toEqual(["2026-10-20"]);
    expect(eventCalendarDays("2026-10-20", "", true, "Europe/Berlin")).toEqual([
      "2026-10-20",
    ]);
  });

  test("shows a timed event that runs past midnight on both days", () => {
    expect(
      eventCalendarDays(
        "2026-10-20T22:00:00+02:00",
        "2026-10-21T02:00:00+02:00",
        false,
        "Europe/Berlin",
      ),
    ).toEqual(["2026-10-20", "2026-10-21"]);
  });
});
