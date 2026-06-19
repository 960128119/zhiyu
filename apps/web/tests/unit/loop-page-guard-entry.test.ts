import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(process.cwd(), "app/(chat)/loops/page.tsx"),
  "utf8",
);

describe("/loops guarded chat entry", () => {
  it("keeps the loop guard query parameter wired from the product page", () => {
    expect(pageSource).toContain("function openGuardedChat");
    expect(pageSource).toContain("loopIdForGuard: loop.id");
    expect(pageSource).toContain("loopName: loop.name");
    expect(pageSource).toContain("router.push(`/chat?${params.toString()}`)");
  });

  it("keeps the guarded chat action visible in the loop detail controls", () => {
    expect(pageSource).toContain("守护聊天");
    expect(pageSource).toContain("onClick={() => openGuardedChat(selectedLoop)}");
  });
});