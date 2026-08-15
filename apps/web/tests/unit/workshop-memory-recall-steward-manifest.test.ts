import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reviewWorkshopManifest } from "@/lib/workshops/manifest";

describe("memory recall steward manifest", () => {
  it("passes manifest review with read-only quality controls", async () => {
    const manifestYaml = readFileSync(
      join(
        process.cwd(),
        "..",
        "..",
        "manifests",
        "workshops",
        "memory-recall-steward.workshop.yaml",
      ),
      "utf8",
    );

    const { review } = await reviewWorkshopManifest({
      userId: "00000000-0000-4000-8000-000000000001",
      manifestYaml,
      existingWorkshops: [],
    });

    expect(review.issues.filter((issue) => issue.severity === "error")).toEqual(
      [],
    );
    expect(review.requestedSkills).toContain("openzhiyu-memory");
    expect(review.requestedTools).toContain(
      "workshopInspectMemoryRecallQuality",
    );
    expect(review.deniedTools).toContain("workshopProposeAgentChange");
    expect(manifestYaml).toContain(
      "Never infer a missing grant from deniedMemoryCount",
    );
    expect(manifestYaml).toContain(
      "A Workshop with no context log in the window is unobserved",
    );
  });
});
