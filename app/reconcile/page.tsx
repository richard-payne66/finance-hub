import { redirect } from "next/navigation";

// Merged into the unified /bookkeeping page (the "Cross-check" tab).
// Kept as a redirect for old bookmarks.
export default function ReconcilePage() {
  redirect("/bookkeeping");
}
