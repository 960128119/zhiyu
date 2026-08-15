"use client";

import type { ReactNode } from "react";

export function ConversationApiOnboardingGuard({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
