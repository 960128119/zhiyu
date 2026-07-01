import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(process.cwd(), "app/(chat)/loops/page.tsx"),
  "utf8",
);

describe("/loops adapter registry visibility", () => {
  it("loads the approval adapter registry from the product page", () => {
    expect(pageSource).toContain("/api/loops/approvals/adapters");
    expect(pageSource).toContain("LoopApprovalAdaptersResponse");
    expect(pageSource).toContain("adapterRegistry?.replayAdapters?.length");
    expect(pageSource).toContain("adapterRegistry?.finalSendAdapters?.length");
  });

  it("keeps replay and final-send adapter status visible", () => {
    expect(pageSource).toContain("Adapter registry");
    expect(pageSource).toContain("Replay adapters");
    expect(pageSource).toContain("Final-send adapters");
    expect(pageSource).toContain(
      "Final send remains blocked until a platform adapter has proven idempotency.",
    );
  });
});