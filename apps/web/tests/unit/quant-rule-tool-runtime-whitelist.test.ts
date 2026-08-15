import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("quantRuleEvaluate runtime whitelist", () => {
  it("is visible to native loop and workshop executors", () => {
    const files = [
      "lib/loops/native-executor.ts",
      "lib/workshops/executor.ts",
    ];

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).toContain('"quantRuleEvaluate"');
      expect(source).toContain('"mcp__workshop-tools__quantRuleEvaluate"');
    }
  });
});
