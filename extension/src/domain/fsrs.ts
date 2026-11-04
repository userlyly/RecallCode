import { DefaultScheduler, Rating } from "ts-fsrs";
export const fsrsVersion = "ts-fsrs@6.0.0/FSRS-6";
export const ratings = ["Again", "Hard", "Good", "Easy"] as const;
export type Grade = (typeof ratings)[number];
export type StoredCard = Record<string, unknown> & {
  dueAt: string;
  lastReviewAt: string | null;
};
export async function schedule(
  card: StoredCard | undefined,
  grade: Grade,
  now: Date,
  retention = 0.9,
) {
  if (!ratings.includes(grade) || !Number.isFinite(now.getTime()))
    throw Error("无效评分");
  const scheduler = await DefaultScheduler({
    version: "FSRS-6",
    desiredRetention: retention,
    enableShortTerm: false,
    enableFuzz: false,
  });
  let previous = card
    ? {
        ...card,
        dueAt: new Date(card.dueAt),
        lastReviewAt: card.lastReviewAt ? new Date(card.lastReviewAt) : null,
      }
    : scheduler.newCard({ now });
  const result = scheduler.review({
    card: previous as Parameters<typeof scheduler.review>[0]["card"],
    grade: Rating[grade],
    now,
  });
  return {
    card: JSON.parse(JSON.stringify(result.card)) as StoredCard,
    revlog: JSON.parse(JSON.stringify(result.revlog)),
  };
}
