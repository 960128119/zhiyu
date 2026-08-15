import { listWorkshopEvents } from "@/lib/workshops/service";
import type { WorkshopEvent } from "@/lib/db/schema";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface LegacyHarnessProposalProjection {
  interfaceVersion: "legacy-work-change-proposal.v1";
  id: string;
  status: "pending" | "applied" | "rejected" | "superseded";
  reason: string;
  riskLevel: string;
  changedFields: string[];
  diff: unknown[];
  proposedBy: string;
  createdAt: string;
  legacyEvidence: true;
  processingMode: "legacy_event_workflow";
}

export async function listLegacyHarnessProposalProjections(
  workshopId: string,
  limit = 30,
): Promise<LegacyHarnessProposalProjection[]> {
  const events = await listWorkshopEvents(workshopId, {
    limit: Math.min(500, Math.max(100, limit * 5)),
    order: "latest",
  });
  const resolutionByProposal = new Map<
    string,
    LegacyHarnessProposalProjection["status"]
  >();
  for (const event of events) {
    const metadata = asRecord(event.metadata);
    const proposalEventId =
      typeof metadata.proposalEventId === "string"
        ? metadata.proposalEventId
        : null;
    if (!proposalEventId) continue;
    if (event.type === "workshop_agent_change_applied") {
      resolutionByProposal.set(proposalEventId, "applied");
    }
    if (event.type === "workshop_agent_change_rejected") {
      resolutionByProposal.set(proposalEventId, "rejected");
    }
    if (event.type === "workshop_agent_change_superseded") {
      resolutionByProposal.set(proposalEventId, "superseded");
    }
  }
  return events
    .filter(
      (event: WorkshopEvent) => event.type === "workshop_agent_change_proposed",
    )
    .slice(0, Math.min(100, Math.max(1, limit)))
    .map((event: WorkshopEvent) => {
      const metadata = asRecord(event.metadata);
      return {
        interfaceVersion: "legacy-work-change-proposal.v1",
        id: event.id,
        status: resolutionByProposal.get(event.id) ?? "pending",
        reason:
          typeof event.body === "string" && event.body.trim()
            ? event.body
            : "Legacy Work configuration proposal",
        riskLevel:
          typeof metadata.riskLevel === "string"
            ? metadata.riskLevel
            : "unknown",
        changedFields: Array.isArray(metadata.changedFields)
          ? metadata.changedFields.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
        diff: Array.isArray(metadata.diff) ? metadata.diff : [],
        proposedBy:
          typeof metadata.proposedBy === "string"
            ? metadata.proposedBy
            : "unknown",
        createdAt:
          event.createdAt instanceof Date
            ? event.createdAt.toISOString()
            : new Date(event.createdAt).toISOString(),
        legacyEvidence: true,
        processingMode: "legacy_event_workflow",
      };
    });
}
