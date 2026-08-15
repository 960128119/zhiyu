import { describe, expect, it } from "vitest";
import { workshopAllowsSuggestedActionOutbox } from "@/lib/workshops/outbox-boundary";

describe("workshop suggested-action outbox boundary", () => {
  it("blocks post-run drafts when external messages are blocked", () => {
    expect(
      workshopAllowsSuggestedActionOutbox({
        boundaryPolicy: { externalMessages: "blocked" },
        modelConfig: {},
        actionPolicy: {},
      }),
    ).toBe(false);
  });

  it("blocks post-run drafts when the outbox tool is denied", () => {
    expect(
      workshopAllowsSuggestedActionOutbox({
        boundaryPolicy: {},
        modelConfig: { disallowedTools: ["workshopCreateOutboxDraft"] },
        actionPolicy: {},
      }),
    ).toBe(false);
  });

  it("keeps legacy draft behavior when no boundary blocks it", () => {
    expect(
      workshopAllowsSuggestedActionOutbox({
        boundaryPolicy: {},
        modelConfig: {},
        actionPolicy: {},
      }),
    ).toBe(true);
  });
});
