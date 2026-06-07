// Compare-and-swap read-modify-write for our single-row JSON kv blobs.
//
// Shared state (the audit log, learned category rules, the dividend log,
// processed-txn sets) lives in one kv row each, mutated by load → modify →
// upsert. Multiple routes and overlapping crons do this, and a plain upsert
// blindly overwrites — so two writers that read the same snapshot silently
// clobber each other (lost update). That's invisible because FreeAgent itself
// stays correct; only our local record of what happened drifts.
//
// mutateKvJson fixes that with optimistic concurrency: it writes only if the
// row still holds the value we read (CAS via `.eq("value", prevRaw)`). If
// another writer got in first, the update matches 0 rows, and we re-read and
// retry. This is enforced in Postgres, so it holds across serverless instances
// — not just within one process.

import { db } from "@/app/lib/db";

export async function mutateKvJson<T>(
  key: string,
  mutate: (current: T | null) => T,
  opts: { retries?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 5;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const { data } = await db().from("kv").select("value").eq("key", key).maybeSingle();
    const prevRaw: string | null = data?.value ?? null;

    let current: T | null = null;
    if (prevRaw != null) {
      try {
        current = JSON.parse(prevRaw) as T;
      } catch {
        current = null; // corrupt blob — treat as empty and overwrite
      }
    }

    const next = mutate(current);
    const nextRaw = JSON.stringify(next);

    if (prevRaw == null) {
      // No row yet — try to insert. If another writer inserted first we'll
      // get a unique-key violation; fall through to retry as a CAS update.
      const { error } = await db().from("kv").insert({ key, value: nextRaw });
      if (!error) return next;
    } else {
      // CAS: only write if the stored value is still what we read.
      const { data: updated } = await db()
        .from("kv")
        .update({ value: nextRaw })
        .eq("key", key)
        .eq("value", prevRaw)
        .select("key");
      if (updated && updated.length > 0) return next;
    }
    // Lost the race (or insert collided) — loop and retry against fresh state.
  }

  throw new Error(`mutateKvJson: could not commit "${key}" after ${retries} retries (write contention)`);
}
