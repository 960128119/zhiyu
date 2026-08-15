"use client";

export function TelegramTokenFormProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

export function PlatformIntegrations(_props: Record<string, unknown>) {
  return null;
}

export function useTelegramTokenForm() {
  return {
    isOpen: false,
    open: () => undefined,
    close: () => undefined,
    showTelegramTokenForm: () => undefined,
    hideTelegramTokenForm: () => undefined,
    telegramReconnectAccountId: null as string | null,
    isTelegramTokenFormOpen: false,
  };
}

export default PlatformIntegrations;
