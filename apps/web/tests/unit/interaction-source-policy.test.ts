import { describe, expect, it } from "vitest";
import {
  applyInteractionProcessingMode,
  isInteractionEventAllowedBySourcePolicy,
  processingModeForSourcePolicy,
} from "@/lib/knowledge-pipeline/source-policy-runtime";

const event = {
  content: "普通群聊消息",
  contentPreview: "普通群聊消息",
  sourceRaw: {},
};

describe("interaction source policy runtime", () => {
  it("only admits explicit mentions for mention_only sources", () => {
    expect(
      isInteractionEventAllowedBySourcePolicy({
        policy: "mention_only",
        event,
        mentionAliases: ["小宇"],
      }),
    ).toBe(false);
    expect(
      isInteractionEventAllowedBySourcePolicy({
        policy: "mention_only",
        event: { ...event, content: "@小宇 请跟进一下" },
        mentionAliases: ["小宇"],
      }),
    ).toBe(true);
    expect(
      isInteractionEventAllowedBySourcePolicy({
        policy: "mention_only",
        event: { ...event, sourceRaw: { isAtMe: true } },
      }),
    ).toBe(true);
  });

  it("maps summary sources to summary-only generation", () => {
    expect(processingModeForSourcePolicy("summary")).toBe("summary_only");
    const plan = applyInteractionProcessingMode(
      {
        notes: [
          {
            noteType: "summary",
            title: "摘要",
            body: "内容",
            confidence: 80,
            sourceEventIds: ["event-1"],
          },
        ],
        tasks: [
          {
            title: "任务",
            confidence: 80,
            sourceEventIds: ["event-1"],
          },
        ],
        memories: [
          {
            memoryType: "person",
            subject: "联系人",
            content: "长期记忆",
            confidence: 80,
            tags: [],
            sourceEventIds: ["event-1"],
          },
        ],
      },
      "summary_only",
    );

    expect(plan.notes).toHaveLength(1);
    expect(plan.tasks).toEqual([]);
    expect(plan.memories).toEqual([]);
  });
});
