import { redirect } from "next/navigation";

// Merged into the unified /bookkeeping page (the "Done for you" tab).
// Kept as a redirect for old bookmarks and the home-card links.
export default function ActivityPage() {
  redirect("/bookkeeping");
}
