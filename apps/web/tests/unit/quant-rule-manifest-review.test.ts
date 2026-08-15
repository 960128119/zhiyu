import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reviewWorkshopManifest } from "@/lib/workshops/manifest";

describe("quant rule manifest integration", () => {
  for (const name of [
    "paper-trader.workshop.yaml",
    "watchlist-hunter.workshop.yaml",
  ]) {
    it(`${name} passes review and requests quantRuleEvaluate`, async () => {
      const manifestYaml = readFileSync(
        join(process.cwd(), "..", "..", "manifests", "workshops", name),
        "utf8",
      );

      const { review } = await reviewWorkshopManifest({
        manifestYaml,
        userId: "00000000-0000-0000-0000-000000000000",
        existingWorkshops: [],
      });

      expect(review.issues.filter((issue) => issue.severity === "error")).toEqual(
        [],
      );
      expect(review.requestedTools).toContain("quantRuleEvaluate");
    });
  }
});
