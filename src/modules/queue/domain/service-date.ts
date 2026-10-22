/**
 * A business day is the wall-clock date in the branch's own timezone, stored as
 * midnight UTC so it can be compared against a MySQL `@db.Date` column.
 *
 * Every query that reads "today's queues" must use the same helper, otherwise a
 * nightly leftover from yesterday keeps showing up on the TV display.
 */
export function dateForTimezone(timezone: string, now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
}
