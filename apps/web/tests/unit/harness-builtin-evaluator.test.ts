import { describe, expect, it } from "vitest";
import {
  CORE_HARNESS_EVALUATION_SUITES,
  createBuiltinHarnessScenarioExecutor,
  type ResolvedPersistedHarnessSnapshot,
} from "@/lib/harness-evolution";

function snapshot(
  cohort: "baseline" | "candidate",
): ResolvedPersistedHarnessSnapshot {
  const recallProfiles =
    cohort === "candidate"
      ? [
          {
            id: "current-state",
            matchTerms: ["current", "latest", "当前", "最新"],
            memoryTypeBoosts: { fact: 200 },
          },
        ]
      : [];
  return {
    id: `snapshot-${cohort}`,
    workshopId: "work-1",
    workVersionId: "version-1",
    platformVersion: "test",
    componentSetHash: `hash-${cohort}`,
    status: cohort === "baseline" ? "active" : "candidate",
    resolvedAt: new Date("2026-08-12T00:00:00.000Z"),
    modelRuntime: { provider: "test", model: "fixed", reasoningLevel: null },
    policySummary: {
      allowedActions: ["memory_read"],
      approvalRequiredActions: [],
      deniedActions: ["external_send", "real_funds", "delete"],
      protectedComponentIds: ["protected-1"],
    },
    components: [
      {
        key: "work.memory-profile",
        componentId: "memory-profile-1",
        revisionId: `memory-revision-${cohort}`,
        revision: cohort === "baseline" ? 1 : 2,
        checksum: `memory-${cohort}`,
        type: "memory_profile",
        scope: { type: "work", id: "work-1" },
        owner: "work",
        mutability: "owner_editable",
        riskLevel: "low",
        sourceKind: "database",
        sourceRef: "workshops:work-1:memory",
        sourceVersion: "v1",
        content: { recallProfiles },
      },
      {
        key: "tool.read.implementation",
        componentId: "protected-1",
        revisionId: "protected-revision-1",
        revision: 1,
        checksum: "protected",
        type: "tool_implementation",
        scope: { type: "platform", id: null },
        owner: "platform",
        mutability: "system_protected",
        riskLevel: "protected",
        sourceKind: "code_registry",
        sourceRef: "agent-tools:read",
        sourceVersion: "v1",
        content: { name: "read" },
      },
    ],
  };
}

describe("built-in Harness evaluator", () => {
  it("replays the freshness pilot and detects a candidate ranking improvement", async () => {
    const scenario = CORE_HARNESS_EVALUATION_SUITES.find(
      (suite) => suite.workRole === "memory_recall_steward",
    )!.scenarios.find(
      (candidate) =>
        candidate.scenarioKey === "memory.current_state_prefers_fresh",
    )!;
    const execute = createBuiltinHarnessScenarioExecutor({
      baseline: snapshot("baseline"),
      candidate: snapshot("candidate"),
    });
    const baseline = await execute({
      scenario,
      cohort: "baseline",
      repetition: 1,
      runtimeContract: { model: "fixed" },
      allowExternalActions: false,
      allowRealFunds: false,
      allowDestructiveActions: false,
    });
    const candidate = await execute({
      scenario,
      cohort: "candidate",
      repetition: 1,
      runtimeContract: { model: "fixed" },
      allowExternalActions: false,
      allowRealFunds: false,
      allowDestructiveActions: false,
    });

    expect(baseline.metrics.freshTop3Rate).toBe(0);
    expect(candidate.metrics.freshTop3Rate).toBe(1);
    expect(candidate.actions).toEqual(["memory_read"]);
  });

  it("rejects a candidate that changes a protected component revision", async () => {
    const baseline = snapshot("baseline");
    const candidate = snapshot("candidate");
    candidate.components[1] = {
      ...candidate.components[1],
      revisionId: "protected-revision-2",
    };
    const scenario = CORE_HARNESS_EVALUATION_SUITES.find(
      (suite) => suite.workRole === "*",
    )!.scenarios[0];
    const result = await createBuiltinHarnessScenarioExecutor({
      baseline,
      candidate,
    })({
      scenario,
      cohort: "candidate",
      repetition: 1,
      runtimeContract: {},
      allowExternalActions: false,
      allowRealFunds: false,
      allowDestructiveActions: false,
    });

    expect(result.hardInvariantFailures).toContain(
      "protected_component_changed:tool.read.implementation",
    );
  });
});
