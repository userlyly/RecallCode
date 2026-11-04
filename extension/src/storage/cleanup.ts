import { db } from "./db";
export async function pruneOrphans() {
  return db.transaction("rw", db.tables, async () => {
    const used = new Set(
      (await db.studyLists.toArray()).flatMap((l) => l.problemKeys),
    );
    const orphaned = (await db.problems.toArray())
      .filter((p) => !used.has(p.key))
      .map((p) => p.key);
    for (const key of orphaned) {
      await db.progress.delete(key);
      await db.reviewEvents.where("problemKey").equals(key).delete();
      await db.trainingSessions.where("problemKey").equals(key).delete();
      await db.problems.delete(key);
    }
    return orphaned.length;
  });
}
