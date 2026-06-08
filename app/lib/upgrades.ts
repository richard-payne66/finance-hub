import { db } from "@/app/lib/db";

// Per-page "upgrade" ideas Richard jots down in the UPGRADES box at the bottom
// of each page; a daily evening task works through the pending ones.
//
// Stored in a DEDICATED `upgrades` table in finance-hub's own Supabase project
// (project jeifndupsazbuafwvnpn) — its own place, not the shared kv row and
// nothing to do with the Mind-Flux or badass databases.

export type Upgrade = {
  id: string;
  page: string;          // pathname the idea was added on, e.g. "/year"
  text: string;
  status: "pending" | "done";
  created_at: string;
  completed_at: string | null;
  note?: string | null;
};

export async function listUpgrades(page?: string): Promise<Upgrade[]> {
  let q = db().from("upgrades").select("*").order("created_at", { ascending: false });
  if (page) q = q.eq("page", page);
  const { data } = await q;
  return (data ?? []) as Upgrade[];
}

export async function addUpgrade(page: string, text: string): Promise<Upgrade | null> {
  const row = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    page,
    text: text.slice(0, 600),
    status: "pending",
    completed_at: null,
    note: null,
  };
  const { data } = await db().from("upgrades").insert(row).select().single();
  return (data as Upgrade) ?? null;
}

export async function updateUpgrade(
  id: string,
  patch: { status?: "pending" | "done"; note?: string },
): Promise<Upgrade | null> {
  const upd: Record<string, unknown> = {};
  if (patch.status === "done" || patch.status === "pending") {
    upd.status = patch.status;
    upd.completed_at = patch.status === "done" ? new Date().toISOString() : null;
  }
  if (typeof patch.note === "string") upd.note = patch.note.slice(0, 600);
  const { data } = await db().from("upgrades").update(upd).eq("id", id).select().single();
  return (data as Upgrade) ?? null;
}

export async function removeUpgrade(id: string): Promise<void> {
  await db().from("upgrades").delete().eq("id", id);
}

/** Friendly label for a page path, for the global Setup list. */
export function pageLabel(path: string): string {
  const map: Record<string, string> = {
    "/": "Dashboard",
    "/year": "Year by year",
    "/setup": "Setup",
    "/capture": "Capture (mobile)",
    "/digest": "Monthly digest",
    "/bookkeeping": "Bookkeeping",
    "/how-it-works": "What I pay",
    "/receipts": "Receipts",
    "/dividends": "Dividends",
    "/deadlines": "Deadlines",
    "/documents": "Documents",
  };
  return map[path] ?? path;
}
