import { redirect } from "next/navigation";

// Deprecated — superseded by the ForecastPanel 'Upcoming bills' section
// on the home page. Redirect for any bookmarks.
export default function DeadlinesPage() {
  redirect("/");
}
