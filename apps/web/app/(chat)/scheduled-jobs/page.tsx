import { redirect } from "next/navigation";

export default function LegacyScheduledJobsRedirect() {
  redirect("/loops");
}
