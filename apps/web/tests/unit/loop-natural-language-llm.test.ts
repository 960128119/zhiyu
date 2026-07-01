import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/user-llm-api-settings", () => ({
  getUserLlmProviderConfig: vi.fn(async () => undefined),
}));

import { draftLoopFromNaturalLanguage } from "@/lib/loops/natural-language";

describe("natural language loop LLM parser", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.LOOP_NL_LLM_API_KEY = "test-key";
    process.env.LOOP_NL_LLM_BASE_URL = "https://llm.example.test/v1";
    process.env.LOOP_NL_LLM_MODEL = "fast-parser-model";
    process.env.LOOP_NL_LLM_TIMEOUT_MS = "12345";
    process.env.LOOP_NL_LLM_MAX_TOKENS = "321";
    process.env.LOOP_NL_LLM_JSON_MODE = "0";
    delete process.env.LOOP_NL_RULE_PARSER;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.LOOP_NL_LLM_API_KEY;
    delete process.env.LOOP_NL_LLM_BASE_URL;
    delete process.env.LOOP_NL_LLM_MODEL;
    delete process.env.LOOP_NL_LLM_TIMEOUT_MS;
    delete process.env.LOOP_NL_LLM_MAX_TOKENS;
    delete process.env.LOOP_NL_LLM_JSON_MODE;
    delete process.env.LOOP_NL_RULE_PARSER;
  });

  it("uses the compact dedicated LLM request by default", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: "Daily weather",
                description: "Send Beijing weather every morning",
                goal: "每天早上9点给文件传输助手发送北京天气预报",
                schedule: {
                  type: "cron",
                  cronExpression: "0 9 * * *",
                  timezone: "Asia/Shanghai",
                  label: "每天 09:00",
                },
                taskKind: "weather_wechat_delivery",
                contextInstructions: "Fetch Beijing weather and send it.",
                weather: { city: "北京", date: "today" },
                delivery: {
                  platform: "wechat_desktop",
                  recipientName: "文件传输助手",
                  sendMode: "loop_approved",
                },
                missingFields: [],
                allowedActions: ["getWeather"],
                requiredApprovalActions: [],
                successCriteria: ["sent"],
              }),
            },
          },
        ],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const draft = await draftLoopFromNaturalLanguage({
      userId: "user-1",
      intent: "每天早上9点给文件传输助手发送北京天气预报",
      timezone: "Asia/Shanghai",
      externalWriteMode: "loop_approved",
    });

    expect(draft.planner).toMatchObject({
      model: "fast-parser-model",
      parser: "local_llm_api",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      model: "fast-parser-model",
      max_tokens: 321,
      stream: false,
    });
    expect(body.response_format).toBeUndefined();
    expect(body.messages[1].content).toContain("Keys:");
    expect(body.messages[1].content).not.toContain("Required JSON shape");
  });
});
