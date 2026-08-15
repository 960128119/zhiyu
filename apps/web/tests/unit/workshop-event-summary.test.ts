import { describe, expect, it } from "vitest";
import { summarizeWorkshopEventForList } from "@/lib/workshops/event-summary";

describe("workshop event summaries", () => {
  it("compacts large observation metadata for list views", () => {
    const event = summarizeWorkshopEventForList({
      type: "source_checked",
      body: "x".repeat(2000),
      metadata: {
        provider: "quant",
        candidates: Array.from({ length: 100 }, (_, index) => ({
          symbol: `000${index}`,
          reason: "large evidence payload",
        })),
      },
    });

    expect(event.body).toHaveLength(1203);
    expect(event.metadata).toMatchObject({
      provider: "quant",
      __truncated: true,
    });
    expect(event.metadata?.candidates).toBeUndefined();
  });

  it("keeps proposal metadata because review actions depend on it", () => {
    const metadata = {
      kind: "watchlist_change_proposal",
      status: "pending_approval",
      after: ["159278.SZ"],
      validation: { ok: true },
      evidence: "x".repeat(5000),
    };

    const event = summarizeWorkshopEventForList({
      type: "watchlist_proposal",
      body: "proposal",
      metadata,
    });

    expect(event.metadata).toEqual(metadata);
  });

  it("can preserve full body for workshop detail views", () => {
    const body = "x".repeat(2000);
    const event = summarizeWorkshopEventForList(
      {
        type: "agent_text",
        body,
        metadata: {},
      },
      { preserveBody: true, maxBodyChars: 100 },
    );

    expect(event.body).toBe(body);
  });
});
