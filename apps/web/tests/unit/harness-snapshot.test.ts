import { describe, expect, it } from "vitest";
import {
  assembleWorkHarnessSnapshot,
  type HarnessComponentDefinition,
} from "@/lib/harness-evolution";

function components(
  overrides: Partial<HarnessComponentDefinition>[] = [],
): HarnessComponentDefinition[] {
  const base: HarnessComponentDefinition[] = [
    {
      key: "work.prompt",
      type: "prompt",
      scope: { type: "work", id: "work-1" },
      owner: "work",
      mutability: "proposal_only",
      riskLevel: "medium",
      sourceKind: "database",
      sourceRef: "workshops:work-1:mission",
      sourceVersion: "work-v1",
      content: { mission: "Maintain the current watchlist." },
    },
    {
      key: "tool.quantPaperPlaceOrder",
      type: "tool_implementation",
      scope: { type: "platform", id: null },
      owner: "platform",
      mutability: "system_protected",
      riskLevel: "protected",
      sourceKind: "code_registry",
      sourceRef: "agent-tools:quantPaperPlaceOrder",
      sourceVersion: "build-1",
      content: { capabilities: ["paper_trade"], implementationHash: "abc" },
    },
  ];

  return base.map((component, index) => ({
    ...component,
    ...(overrides[index] ?? {}),
  }));
}

describe("work harness snapshot", () => {
  it("is stable across input ordering and applies denied policy before allowed", () => {
    const input = {
      workId: "work-1",
      workVersionId: "version-1",
      workVersion: "work-v1",
      platformVersion: "build-1",
      modelRuntime: {
        provider: "openai-compatible",
        model: "test-model",
        reasoningLevel: "high",
      },
      policy: {
        allowedActions: ["quantPaperPlaceOrder", "quantPaperGetAccount"],
        approvalRequiredActions: ["quantPaperPlaceOrder"],
        deniedActions: ["quantPaperPlaceOrder"],
      },
      components: components(),
      resolvedAt: "2026-08-12T00:00:00.000Z",
    } as const;

    const first = assembleWorkHarnessSnapshot(input);
    const second = assembleWorkHarnessSnapshot({
      ...input,
      components: [...components()].reverse(),
    });

    expect(first.componentSetHash).toBe(second.componentSetHash);
    expect(first.snapshotId).toBe(second.snapshotId);
    expect(first.components.map((component) => component.key)).toEqual([
      "work.prompt",
      "tool.quantPaperPlaceOrder",
    ]);
    expect(first.policySummary).toEqual({
      allowedActions: ["quantPaperGetAccount"],
      approvalRequiredActions: [],
      deniedActions: ["quantPaperPlaceOrder"],
      protectedComponentIds: [
        "harness:platform:platform:tool_implementation:tool.quantPaperPlaceOrder",
      ],
    });
  });

  it("changes the component set when a shared implementation revision changes", () => {
    const base = assembleWorkHarnessSnapshot({
      workId: "work-1",
      workVersionId: "version-1",
      workVersion: "work-v1",
      platformVersion: "build-1",
      modelRuntime: { provider: null, model: null, reasoningLevel: null },
      policy: {
        allowedActions: [],
        approvalRequiredActions: [],
        deniedActions: [],
      },
      components: components(),
      resolvedAt: "2026-08-12T00:00:00.000Z",
    });
    const changed = assembleWorkHarnessSnapshot({
      workId: "work-1",
      workVersionId: "version-1",
      workVersion: "work-v1",
      platformVersion: "build-2",
      modelRuntime: { provider: null, model: null, reasoningLevel: null },
      policy: {
        allowedActions: [],
        approvalRequiredActions: [],
        deniedActions: [],
      },
      components: components([
        {},
        {
          sourceVersion: "build-2",
          content: {
            capabilities: ["paper_trade"],
            implementationHash: "def",
          },
        },
      ]),
      resolvedAt: "2026-08-12T00:00:00.000Z",
    });

    expect(changed.componentSetHash).not.toBe(base.componentSetHash);
    expect(changed.snapshotId).not.toBe(base.snapshotId);
  });
});
