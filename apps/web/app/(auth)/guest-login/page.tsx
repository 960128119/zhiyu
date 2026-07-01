"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession } from "next-auth/react";

/**
 * Guest login page - automatically creates a guest account and redirects to home.
 * This page is used when users access the app without logging in.
 */
export default function GuestLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    // Create guest account and sign in
    const createGuestAndLogin = async () => {
      if (isCreating) return;
      setIsCreating(true);

      try {
        const callbackUrl = searchParams.get("callbackUrl") || "/";
        // Check if already authenticated (to avoid loops when middleware redirects back)
        const session = await getSession();
        if (session?.user) {
          router.replace(callbackUrl);
          return;
        }

        window.location.replace(
          `/api/auth/guest?redirectUrl=${encodeURIComponent(callbackUrl)}`,
        );
      } catch (error) {
        console.error("[GuestLogin] Error:", error);
        router.replace("/");
      }
    };

    createGuestAndLogin();
  }, [router, searchParams, isCreating]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Creating guest account...</p>
      </div>
    </div>
  );
}
