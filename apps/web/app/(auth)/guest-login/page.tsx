import { redirect } from "next/navigation";

/**
 * Guest login page - immediately creates a guest account on the server path.
 */
export default async function GuestLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl || "/";
  redirect(callbackUrl);
}
