import { describe, expect, it } from "vitest";
import {
  buildProjectRiskReviewLoopSpec,
  buildLoopSpecFromTemplate,
  DAILY_BRIEF_TEMPLATE_ID,
  getLoopTemplate,
  listLoopTemplates,
  loopSpecToCreateLoopInput,
  MEETING_PREP_TEMPLATE_ID,
  PERSONAL_CRM_FOLLOW_UP_TEMPLATE_ID,
  parseLoopSpec,
  safeParseLoopSpec,
  WEEKLY_UPDATE_TEMPLATE_ID,
} from "@/lib/loops";

describe("loop spec", () => {
  it("normalizes defaults for a minimal manual loop", () => {
    const spec = parseLoopSpec({
      goal: "Keep track of project status",
      trigger: { type: "manual" },
    });

    expect(spec.version).toBe(1);
    expect(spec.context.sources).toEqual([]);
    expect(spec.actions.requiresApproval).toEqual([]);
    expect(spec.approval.externalWrites).toBe("require_approval");
    expect(spec.retry.maxAttempts).toBe(1);
  });

  it("rejects invalid cron triggers", () => {
    const result = safeParseLoopSpec({
      goal: "Review risk",
      trigger: { type: "cron", timezone: "UTC" },
    });

    expect(result.success).toBe(false);
  });

  it("accepts explicit model checker verification config", () => {
    const spec = parseLoopSpec({
      goal: "Review risk",
      trigger: { type: "manual" },
      verification: {
        type: "structured_check",
        modelChecker: {
          enabled: true,
          provider: "openai",
          model: "gpt-5-mini",
          maxInputChars: 8_000,
        },
      },
    });

    expect(spec.verification.modelChecker).toEqual({
      enabled: true,
      provider: "openai",
      model: "gpt-5-mini",
      maxInputChars: 8_000,
    });
  });

  it("applies model checker overrides to template specs", () => {
    const spec = buildLoopSpecFromTemplate({
      userId: "user-1",
      templateId: DAILY_BRIEF_TEMPLATE_ID,
      modelChecker: {
        enabled: true,
        maxInputChars: 10_000,
      },
    });

    expect(spec.verification.modelChecker).toEqual({
      enabled: true,
      maxInputChars: 10_000,
    });
  });

  it("maps a spec into loop persistence fields", () => {
    const spec = parseLoopSpec({
      goal: "Review risk",
      trigger: { type: "cron", expression: "0 9 * * 1-5" },
    });

    const input = loopSpecToCreateLoopInput({
      userId: "user-1",
      name: "Risk Review",
      spec,
    });

    expect(input.goal).toBe("Review risk");
    expect(input.triggerConfig).toEqual({
      type: "cron",
      expression: "0 9 * * 1-5",
      timezone: "UTC",
    });
    expect(input.initialState?.stateJson).toMatchObject({
      loopSpec: spec,
    });
  });

  it("builds the project risk review template", () => {
    const spec = buildProjectRiskReviewLoopSpec({
      projectName: "Orion",
      timezone: "Asia/Shanghai",
      connectorSources: [{ platform: "jira", project: "ORION" }],
    });

    expect(spec.templateId).toBe("project-risk-review");
    expect(spec.trigger).toEqual({
      type: "cron",
      expression: "0 9 * * 1-5",
      timezone: "Asia/Shanghai",
    });
    expect(spec.context.sources.map((source) => source.type)).toEqual([
      "insight",
      "memory",
      "connector",
    ]);
    expect(spec.verification.requiredFields).toContain("riskLevel");
    expect(spec.actions.requiresApproval).toContain("sendMessage");
  });

  it("lists loop templates through the registry", () => {
    const templates = listLoopTemplates();
    const ids = templates.map((template) => template.id);

    expect(ids).toEqual([
      "project-risk-review",
      DAILY_BRIEF_TEMPLATE_ID,
      MEETING_PREP_TEMPLATE_ID,
      WEEKLY_UPDATE_TEMPLATE_ID,
      PERSONAL_CRM_FOLLOW_UP_TEMPLATE_ID,
    ]);
    expect(getLoopTemplate(DAILY_BRIEF_TEMPLATE_ID)).toMatchObject({
      id: DAILY_BRIEF_TEMPLATE_ID,
      defaultCronExpression: "0 8 * * 1-5",
      requiredInputFields: [],
    });
  });

  it("builds additional native loop templates", () => {
    const dailyBrief = buildLoopSpecFromTemplate({
      userId: "user-1",
      templateId: DAILY_BRIEF_TEMPLATE_ID,
      timezone: "Asia/Shanghai",
    });
    const meetingPrep = buildLoopSpecFromTemplate({
      userId: "user-1",
      templateId: MEETING_PREP_TEMPLATE_ID,
      meetingTopic: "QBR",
    });
    const weeklyUpdate = buildLoopSpecFromTemplate({
      userId: "user-1",
      templateId: WEEKLY_UPDATE_TEMPLATE_ID,
      projectName: "Orion",
    });
    const personalCrm = buildLoopSpecFromTemplate({
      userId: "user-1",
      templateId: PERSONAL_CRM_FOLLOW_UP_TEMPLATE_ID,
      contactGroup: "investors",
    });

    expect(dailyBrief.templateId).toBe(DAILY_BRIEF_TEMPLATE_ID);
    expect(meetingPrep.goal).toContain("QBR");
    expect(weeklyUpdate.goal).toContain("Orion");
    expect(personalCrm.goal).toContain("investors");
  });

  it("rejects missing required template input", () => {
    expect(() =>
      buildLoopSpecFromTemplate({
        userId: "user-1",
        templateId: MEETING_PREP_TEMPLATE_ID,
      }),
    ).toThrow("meetingTopic is required");
  });
});
