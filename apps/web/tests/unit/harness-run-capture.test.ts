import { describe, expect, it } from "vitest";
import {
  buildCapturedRunEvidence,
  readRunHarnessCaptureContext,
} from "@/lib/harness-evolution";

describe("harness run evidence capture", () => {
  const context = {
    interfaceVersion: "run-harness-context.v1" as const,
    workId: "work-1",
    workVersionId: "version-1",
    harnessSnapshotId: "snapshot-1",
    componentSetHash: "hash-1",
    model: "model-1",
    capturedAt: "2026-08-12T00:00:00.000Z",
  };

  it("reads only a complete embedded Harness context", () => {
    expect(readRunHarnessCaptureContext({ harnessEvolution: context })).toEqual(
      context,
    );
    expect(
      readRunHarnessCaptureContext({
        harnessEvolution: { ...context, harnessSnapshotId: "" },
      }),
    ).toBeNull();
  });

  it("builds a traceable bundle without copying event bodies", () => {
    const bundle = buildCapturedRunEvidence({
      id: "evidence-1",
      userId: "user-1",
      workId: "work-1",
      workRunId: null,
      loopId: "loop-1",
      loopRunId: "loop-run-1",
      context,
      status: "failed",
      startedAt: "2026-08-12T00:00:00.000Z",
      completedAt: "2026-08-12T00:00:02.000Z",
      outputSummary: "Sensitive output must not be copied.",
      error: "tool failed",
      verificationResult: {
        passed: false,
        verification: {
          passed: false,
          issues: [{ code: "missing_required_field", message: "Missing plan" }],
        },
        decision: { attemptsUsed: 2 },
        toolGate: {
          decisions: [
            { actionName: "readData", decision: "allow" },
            { actionName: "sendMessage", decision: "deny" },
          ],
        },
      },
      events: [
        {
          id: "event-source",
          type: "source_checked",
          metadata: { provider: "market", freshness: "fresh" },
          createdAt: "2026-08-12T00:00:01.000Z",
        },
        {
          id: "event-tool",
          type: "tool_call",
          metadata: { toolName: "readData" },
          createdAt: "2026-08-12T00:00:01.500Z",
        },
      ],
      contextLogs: [
        {
          id: "context-1",
          selectedMemoryIds: ["memory-1"],
          deniedCount: 2,
          createdAt: "2026-08-12T00:00:00.500Z",
        },
      ],
      createdAt: "2026-08-12T00:00:02.000Z",
    });

    expect(bundle.completeness).toBe("complete");
    expect(bundle.actions.toolNames).toEqual(["readData", "sendMessage"]);
    expect(bundle.actions.deniedCount).toBe(3);
    expect(bundle.outcome.requiredFieldsMissing).toEqual(["Missing plan"]);
    expect(bundle.evidenceRefs.map((reference) => reference.id)).toEqual([
      "loop-run-1",
      "event-source",
      "context-1",
    ]);
    expect(JSON.stringify(bundle)).not.toContain("Sensitive output");
  });
});
