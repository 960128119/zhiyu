import { describe, expect, it } from "vitest";
import { verifyLoopRun } from "@/lib/loops";

describe("loop verifier", () => {
  it("passes legacy status verification for successful jobs", () => {
    const result = verifyLoopRun({
      verificationConfig: { type: "legacy_status" },
      result: {
        status: "success",
        output: "Done",
        duration: 10,
      },
    });

    expect(result.passed).toBe(true);
    expect(result.type).toBe("legacy_status");
    expect(result.issues).toEqual([]);
  });

  it("passes structured checks when fields and sources are present", () => {
    const result = verifyLoopRun({
      verificationConfig: {
        type: "structured_check",
        requiredFields: ["summary", "reasoningChain"],
        requiredSources: ["jira", "memory"],
      },
      result: {
        status: "success",
        output: "Risk is medium",
        duration: 10,
        result: {
          structuredReport: {
            summary: "Risk is medium",
            reasoningChain: [
              {
                summary: "Checked Jira",
                sourceType: "jira",
              },
              {
                summary: "Checked memory",
                sourceType: "memory",
              },
            ],
          },
        },
      },
    });

    expect(result.passed).toBe(true);
    expect(result.evidence.observedSources).toEqual(["jira", "memory"]);
  });

  it("fails structured checks when required evidence is missing", () => {
    const result = verifyLoopRun({
      verificationConfig: {
        type: "structured_check",
        requiredFields: ["riskLevel"],
        requiredSources: ["insight"],
      },
      result: {
        status: "success",
        output: "Done",
        duration: 10,
      },
    });

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "missing_required_field",
      "missing_required_source",
    ]);
  });

  it("fails any verification when the execution failed", () => {
    const result = verifyLoopRun({
      verificationConfig: { type: "legacy_status" },
      result: {
        status: "error",
        error: "Agent failed",
        duration: 10,
      },
    });

    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatchObject({
      code: "job_failed",
      severity: "error",
    });
  });
});
