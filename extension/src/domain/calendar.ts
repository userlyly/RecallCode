import type { StoredCard } from "./fsrs";

export function localDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function calendarDaysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

// FSRS intervals are whole days. Add them to the local review date so DST
// changes cannot move a review into the previous or following calendar day.
export function reviewDate(card: StoredCard, timezone: string) {
  if (
    card.lastReviewAt &&
    typeof card.scheduledDays === "number" &&
    Number.isInteger(card.scheduledDays) &&
    card.scheduledDays >= 1
  ) {
    const day = new Date(localDate(new Date(card.lastReviewAt), timezone));
    day.setUTCDate(day.getUTCDate() + card.scheduledDays);
    return day.toISOString().slice(0, 10);
  }
  // Older backups can contain only dueAt.
  return localDate(new Date(card.dueAt), timezone);
}
