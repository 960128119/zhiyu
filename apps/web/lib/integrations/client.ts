import type {
  IntegrationAccountClient,
  IntegrationId,
} from "@/hooks/use-integrations";

export type { IntegrationAccountClient, IntegrationId };

export async function createIntegrationAccount(
  _input?: unknown,
): Promise<IntegrationAccountClient> {
  throw new Error("Connector integrations have been removed from this build.");
}

export async function deleteIntegrationAccountRemote(_input?: unknown): Promise<void> {
  throw new Error("Connector integrations have been removed from this build.");
}
