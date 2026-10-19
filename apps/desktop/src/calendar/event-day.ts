import { format, parseEventInstant, TZDate } from "@anlg/utils";

const CALENDAR_DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function toTz(date: Date, tz?: string): Date {
  return tz ? new TZDate(date, tz) : date;
}

export function eventCalendarDay(
  startedAt: string | null | undefined,
  isAllDay: boolean | number | null | undefined,
  tz?: string,
): string | null {
  if (!startedAt) {
    return null;
  }

  if (Boolean(isAllDay)) {
    const date = startedAt.trim().slice(0, 10);
    return CALENDAR_DATE_KEY.test(date) ? date : null;
  }

  const raw = parseEventInstant(startedAt);
  if (!raw) {
    return null;
  }
  return format(toTz(raw, tz), "yyyy-MM-dd");
}

export function eventCalendarDays(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  isAllDay: boolean | number | null | undefined,
  tz?: string,
): string[] {
  const first = eventCalendarDay(startedAt, isAllDay, tz);
  if (!first) return [];
  const last = lastEventDay(endedAt, isAllDay, tz);
  if (!last || last <= first) return [first];

  const days: string[] = [];
  const cursor = new Date(`${first}T00:00:00Z`);
  for (let day = first; day <= last; ) {
    days.push(day);
    if (days.length >= MAX_EVENT_DAYS) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    day = cursor.toISOString().slice(0, 10);
  }
  return days;
}

// A broken end date must not paint one event across years of cells.
const MAX_EVENT_DAYS = 366;

// Ends are exclusive: an all-day event ending 10-23 covers through 10-22, and
// a meeting ending at midnight stays on the day it started.
function lastEventDay(
  endedAt: string | null | undefined,
  isAllDay: boolean | number | null | undefined,
  tz?: string,
): string | null {
  if (!endedAt) return null;
  if (Boolean(isAllDay)) {
    const end = eventCalendarDay(endedAt, true, tz);
    if (!end) return null;
    const date = new Date(`${end}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }
  const end = parseEventInstant(endedAt);
  if (!end) return null;
  return format(toTz(new Date(end.getTime() - 1), tz), "yyyy-MM-dd");
}
