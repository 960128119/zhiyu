import { buildRunEvidenceBundle } from "./evidence";
import type {
  BuildCapturedRunEvidenceInput,
  CapturedRunEventFact,
  RunEvidenceBundle,
  RunHarnessCaptureContext,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function stringArray(value: unknown) {
  return asArray(value).filter(
    (item): item is string => typeof item === "string",
  );
}

function durationMs(startedAt: string, completedAt: string | null) {
  if (!completedAt) return null;
  const value = Date.parse(completedAt) - Date.parse(startedAt);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function readRunHarnessCaptureContext(
  inputSnapshot: unknown,
): RunHarnessCaptureContext | null {
  const context = asRecord(asRecord(inputSnapshot).harnessEvolution);
  if (
    context.interfaceVersion !== "run-harness-context.v1" ||
    !text(context.workId)?.trim() ||
    !text(context.workVersionId)?.trim() ||
    !text(context.harnessSnapshotId)?.trim() ||
    !text(context.componentSetHash)?.trim() ||
    !text(context.capturedAt)?.trim()
  ) {
    return null;
  }
  return {
    interfaceVersion: "run-harness-context.v1",
    workId: String(context.workId),
    workVersionId: String(context.workVersionId),
    harnessSnapshotId: String(context.harnessSnapshotId),
    componentSetHash: String(context.componentSetHash),
    model: text(context.model),
    capturedAt: String(context.capturedAt),
  };
}

function verificationFacts(verificationResult: unknown) {
  const root = asRecord(verificationResult);
  const verification = asRecord(root.verification);
  const decision = asRecord(root.decision);
  const toolGate = asRecord(root.toolGate);
  const decisions = asArray(toolGate.decisions).map(asRecord);
  const issues = asArray(verification.issues).map(asRecord);
  return {
    verifierPassed:
      typeof root.passed === "boolean"
        ? root.passed
        : typeof verification.passed === "boolean"
          ? verification.passed
          : null,
    attemptsUsed:
      typeof decision.attemptsUsed === "number" &&
      Number.isFinite(decision.attemptsUsed)
        ? Math.max(1, Math.trunc(decision.attemptsUsed))
        : 1,
    requiredFieldsMissing: issues
      .filter((issue) => issue.code === "missing_required_field")
      .map((issue) => text(issue.message))
      .filter((item): item is string => Boolean(item)),
    toolGateDecisions: decisions,
  };
}

function toolNamesFromEvents(events: CapturedRunEventFact[]) {
  return events
    .filter((event) => event.type === "tool_call")
    .map((event) => text(event.metadata.toolName))
    .filter((item): item is string => Boolean(item));
}

function observationFreshness(events: CapturedRunEventFact[]) {
  const sourceEvents = events.filter(
    (event) => event.type === "source_checked",
  );
  const values = sourceEvents
    .map((event) => text(event.metadata.freshness))
    .filter((value): value is string => Boolean(value));
  if (values.includes("stale")) return "stale" as const;
  if (sourceEvents.length > 0 && values.length === sourceEvents.length) {
    return "fresh" as const;
  }
  return "unknown" as const;
}

function providerWarnings(events: CapturedRunEventFact[]) {
  return events.flatMap((event) => {
    const warning = text(event.metadata.warning);
    if (warning) return [warning];
    if (event.type === "source_failed" || event.type === "source_degraded") {
      return [`${event.type}:${event.id}`];
    }
    return [];
  });
}

function errorClass(error: string | null) {
  if (!error) return null;
  return /tool|mcp|command/i.test(error)
    ? "tool_runtime_failure"
    : "external_dependency_failure";
}

export function buildCapturedRunEvidence(
  input: BuildCapturedRunEvidenceInput,
): RunEvidenceBundle {
  const verification = verificationFacts(input.verificationResult);
  const toolGateNames = verification.toolGateDecisions
    .map((decision) => text(decision.actionName))
    .filter((item): item is string => Boolean(item));
  const sourceEvents = input.events.filter(
    (event) => event.type === "source_checked",
  );
  const deniedByGate = verification.toolGateDecisions.filter(
    (decision) => decision.decision === "deny",
  ).length;
  const approvalCount = verification.toolGateDecisions.filter(
    (decision) => decision.decision === "require_approval",
  ).length;
  const externalActionCount = verification.toolGateDecisions.filter(
    (decision) =>
      decision.capability === "external_send" ||
      decision.capability === "external_write",
  ).length;
  const memoryDeniedCount = input.contextLogs.reduce(
    (sum, log) => sum + log.deniedCount,
    0,
  );
  const evidenceRefs: RunEvidenceBundle["evidenceRefs"] = [
    {
      kind: input.loopRunId ? "loop_run" : "workshop_run",
      id: input.loopRunId ?? input.workRunId ?? "missing-run",
      claim: "Run status and timing source.",
      observedAt: input.completedAt,
      freshness: "fresh",
      integrity: input.loopRunId || input.workRunId ? "verified" : "missing",
    },
    ...sourceEvents.map((event) => ({
      kind: "workshop_event" as const,
      id: event.id,
      claim: "Source observation used by the run.",
      observedAt: event.createdAt,
      freshness: "fresh" as const,
      integrity: "verified" as const,
    })),
    ...input.contextLogs.map((log) => ({
      kind: "brain_context_log" as const,
      id: log.id,
      claim: `Memory context selection (${log.selectedMemoryIds.length} selected, ${log.deniedCount} denied).`,
      observedAt: log.createdAt,
      freshness: "fresh" as const,
      integrity: "verified" as const,
    })),
    ...((input.captureWarnings?.length ?? 0) > 0
      ? [
          {
            kind: "artifact" as const,
            id: "harness-capture-context",
            claim: "Harness capture context was reconstructed after the run.",
            observedAt: input.completedAt,
            freshness: "unknown" as const,
            integrity: "unverified" as const,
          },
        ]
      : []),
  ];

  return buildRunEvidenceBundle({
    id: input.id ?? crypto.randomUUID(),
    userId: input.userId,
    workId: input.workId,
    workRunId: input.workRunId,
    loopId: input.loopId,
    loopRunId: input.loopRunId,
    workVersionId: input.context.workVersionId,
    harnessSnapshotId: input.context.harnessSnapshotId,
    componentSetHash: input.context.componentSetHash,
    runtime: {
      model: input.context.model,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: durationMs(input.startedAt, input.completedAt),
      tokenUsage: {},
      attemptCount: verification.attemptsUsed,
    },
    observations: {
      sourceEventIds: sourceEvents.map((event) => event.id),
      freshness: observationFreshness(input.events),
      providerWarnings: [
        ...providerWarnings(input.events),
        ...(input.captureWarnings ?? []),
      ],
    },
    actions: {
      toolCallCount: input.events.filter((event) => event.type === "tool_call")
        .length,
      toolNames: [...toolNamesFromEvents(input.events), ...toolGateNames],
      deniedCount: deniedByGate + memoryDeniedCount,
      approvalCount,
      externalActionCount,
    },
    outcome: {
      status: input.status,
      verifierPassed: verification.verifierPassed,
      requiredFieldsMissing: verification.requiredFieldsMissing,
      artifacts: input.events
        .filter((event) => event.type === "artifact_created")
        .map((event) => ({ type: "workshop_event", id: event.id })),
      errorClass: errorClass(input.error),
    },
    evidenceRefs,
    captureStatus: input.completedAt ? "finalized" : "partial",
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}
