import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

import { GET } from "@/app/(chat)/api/loops/approvals/adapters/route";

describe("loop approval adapters route", () => {
  it("returns replay adapters and explicit final-send adapter metadata", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.adapters).toEqual(body.replayAdapters);
    expect(body.replayAdapters).toEqual([
      expect.objectContaining({
        actionName: "recordLoopAudit",
        capability: "write_internal",
        requiresConfirmation: false,
      }),
      expect.objectContaining({
        actionName: "draftExternalReply",
        capability: "write_external",
        requiresConfirmation: true,
      }),
    ]);
    expect(body.finalSendAdapters).toEqual([]);
    expect(body.replayAdapters[0].execute).toBeUndefined();
  });
});
