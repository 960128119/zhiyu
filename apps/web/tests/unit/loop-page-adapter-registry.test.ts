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
    expect(pageSource).toContain("审批发送能力");
    expect(pageSource).toContain("回放适配器");
    expect(pageSource).toContain("最终发送适配器");
    expect(pageSource).toContain("平台适配器需先验证幂等性");
  });
});
