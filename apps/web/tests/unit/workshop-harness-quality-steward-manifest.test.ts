import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listRegisteredAgentTools } from "@/lib/agent-tools/registry";
import { reviewWorkshopManifest } from "@/lib/workshops/manifest";

describe("Harness quality steward manifest", () => {
  it("passes review with proposal-only tools and hard production boundaries", async () => {
    const manifestYaml = readFileSync(
      join(
        process.cwd(),
        "..",
        "..",
        "manifests",
        "workshops",
        "harness-quality-steward.workshop.yaml",
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
    expect(review.requestedSkills).toContain("harness-quality-control");
    expect(review.requestedTools).toEqual(
      expect.arrayContaining([
        "workshopInspectHarnessQuality",
        "workshopCreateHarnessProposal",
        "workshopCreateHarnessEvaluationCampaign",
        "workshopRunHarnessEvaluation",
      ]),
    );
    expect(review.deniedTools).toEqual(
      expect.arrayContaining([
        "workshopProposeAgentChange",
        "wechatDesktopSendMessage",
        "quantPaperPlaceOrder",
        "douyinPublishApprovedDraft",
      ]),
    );
    expect(manifestYaml).toContain('title: "Harness 质量管家"');
    expect(manifestYaml).toContain('title: "Harness 失败阈值复核"');
    expect(manifestYaml).toContain("minutes: 2880");
    expect(manifestYaml).toContain(
      "The targetWorkId is not the Harness Quality Work itself.",
    );
    expect(manifestYaml).not.toMatch(/[锟�]/);
    expect(manifestYaml).toContain("Harness Quality Work Level 1 only");
    expect(manifestYaml).not.toContain("cron:");
  });

  it("registers quality tools without any publish or apply tool", () => {
    const tools = listRegisteredAgentTools();
    const qualityTools = tools.filter((tool) =>
      [
        "workshopInspectHarnessQuality",
        "workshopCreateHarnessProposal",
        "workshopCreateHarnessEvaluationCampaign",
        "workshopRunHarnessEvaluation",
      ].includes(tool.name),
    );

    expect(qualityTools).toHaveLength(4);
    expect(qualityTools.map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining([
        "workshopPublishHarnessCandidate",
        "workshopApplyHarnessProposal",
      ]),
    );
  });
});
