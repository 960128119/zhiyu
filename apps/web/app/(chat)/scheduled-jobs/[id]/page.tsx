import { redirect } from "next/navigation";

export default function LegacyScheduledJobDetailRedirect() {
  redirect("/loops");
}
