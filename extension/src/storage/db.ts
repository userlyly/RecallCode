import Dexie, { type Table } from "dexie";
export interface Problem {
  key: string;
  frontendId?: string;
  title: string;
  titleSlug?: string;
  url: string;
  difficulty: string;
  topics: string[];
  source: string;
}
export interface StudyList {
  id: string;
  name: string;
  problemKeys: string[];
  sourceType: string;
  createdAt: string;
  enabledForPlanning: boolean;
  sourceUrl?: string;
}
export interface Progress {
  problemKey: string;
  state: "unseen" | "prior_unassessed" | "learning" | "reviewing";
  note?: string;
  legacyMetadata?: unknown;
  fsrsCard?: unknown;
}
export interface Review {
  id: string;
  problemKey: string;
  rating: string;
  kind: string;
  reviewedAt: string;
  activeSeconds: number;
  fsrsVersion: string;
}
export interface Session {
  id: string;
  problemKey: string;
  startedAt: string;
  status: string;
  activeSeconds: number;
}
export interface Preferences {
  minutesPerDay: number;
  newPerDay: number;
  focus: "balanced" | "review" | "new";
  retention: number;
  timezone: string;
  enableLeetcodeInline: boolean;
  autoReduceNew?: boolean;
}
export const defaults: Preferences = {
  minutesPerDay: 30,
  newPerDay: 2,
  focus: "balanced",
  retention: 0.9,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  enableLeetcodeInline: false,
  autoReduceNew: true,
};
export class RecallDB extends Dexie {
  problems!: Table<Problem, string>;
  studyLists!: Table<StudyList, string>;
  progress!: Table<Progress, string>;
  reviewEvents!: Table<Review, string>;
  trainingSessions!: Table<Session, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  constructor(name = "recallcode-v2") {
    super(name);
    this.version(1).stores({
      problems: "key,titleSlug,frontendId",
      studyLists: "id",
      progress: "problemKey",
      reviewEvents: "id,reviewedAt,problemKey",
      trainingSessions: "id,problemKey,status",
      dayDeferrals: "[date+problemKey]",
      meta: "key",
    });
  }
}
export const db = new RecallDB();
export async function preferences(): Promise<Preferences> {
  const saved = await db.meta.get("preferences");
  return { ...defaults, ...((saved?.value as Partial<Preferences>) ?? {}) };
}
export async function savePreferences(value: Preferences) {
  validatePreferences(value);
  await db.meta.put({ key: "preferences", value });
  if (globalThis.chrome?.storage)
    await chrome.storage.local.set({ preferences: value });
}
export function validatePreferences(value: Preferences) {
  if (
    !Number.isInteger(value.minutesPerDay) ||
    value.minutesPerDay < 1 ||
    value.minutesPerDay > 240 ||
    !Number.isInteger(value.newPerDay) ||
    value.newPerDay < 0 ||
    value.newPerDay > 20 ||
    !Number.isFinite(value.retention) ||
    value.retention < 0.7 ||
    value.retention > 0.99 ||
    !["balanced", "review", "new"].includes(value.focus) ||
    typeof value.enableLeetcodeInline !== "boolean"
  )
    throw Error("设置超出有效范围");
  new Intl.DateTimeFormat("en", { timeZone: value.timezone });
}
