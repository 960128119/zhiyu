import { describe, expect, it } from "vitest";
import {
  buildLoopModelCheckerPrompt,
  createOpenAICompatibleModelCheckerTransport,
  createPromptModelChecker,
  createRuntimeLoopModelChecker,
  getLoopModelCheckerConfig,
  parseLoopModelCheckerResponse,
  resolveLoopModelChecker,
  runDeterministicChecker,
  type LoopModelCheckerPrompt,
  type LoopVerificationResult,
} from "@/lib/loops";

const verification: LoopVerificationResult = {
  type: "structured_check",
  passed: true,
  issues: [],
  evidence: {
    status: "success",
    observedFields: ["summary", "riskLevel"],
    observedSources: ["memory"],
    artifactCount: 1,
    hasOutput: true,
    hasStructuredReport: true,
  },
  checkedAt: "2026-06-16T00:00:00.000Z",
};

describe("prompt model checker", () => {
  it("builds a bounded checker prompt", () => {
    const largeObservedFields = Array.from(
      { length: 120 },
      (_, index) => `field-${index}-${"x".repeat(250)}`,
    );
    const deterministic = runDeterministicChecker({
      ...verification,
      evidence: {
        ...verification.evidence,
        observedFields: largeObservedFields,
      },
    });
    const prompt = buildLoopModelCheckerPrompt({
      verification: {
        ...verification,
        evidence: {
          ...verification.evidence,
          observedFields: largeObservedFields,
        },
      },
      deterministic,
      maxInputChars: 2_500,
    });

    expect(prompt.system).toContain("Loop Engineering checker");
    expect(prompt.user.length).toBeLessThanOrEqual(2_600);
    expect(prompt.truncated).toBe(true);
    expect(prompt.user).toContain("[prompt payload truncated]");
  });

  it("parses valid JSON responses", () => {
    const result = parseLoopModelCheckerResponse(`
      \`\`\`json
      {
        "passed": false,
        "feedback": "Evidence is ambiguous.",
        "retryRecommended": true,
        "requiresHumanApproval": false,
        "confidence": 0.51
      }
      \`\`\`
    `);

    expect(result).toMatchObject({
      passed: false,
      feedback: "Evidence is ambiguous.",
      retryRecommended: true,
      requiresHumanApproval: false,
      modelFeedback: {
        confidence: 0.51,
      },
    });
  });

  it("fails closed when model output is not valid JSON", () => {
    const result = parseLoopModelCheckerResponse("looks good to me");

    expect(result).toMatchObject({
      passed: false,
      retryRecommended: false,
      requiresHumanApproval: true,
    });
    expect(result.feedback).toContain("invalid response");
    expect(result.modelFeedback).toMatchObject({
      rawResponsePreview: "looks good to me",
    });
  });

  it("calls the injected transport and returns parsed feedback", async () => {
    const observedPrompts: LoopModelCheckerPrompt[] = [];
    const checker = createPromptModelChecker({
      maxInputChars: 3_000,
      transport: {
        complete: async (prompt) => {
          observedPrompts.push(prompt);

          return JSON.stringify({
            passed: true,
            feedback: "The deterministic evidence is sufficient.",
            confidence: 0.9,
          });
        },
      },
    });

    const result = await checker.check({
      verification,
      deterministic: runDeterministicChecker(verification),
    });

    expect(observedPrompts[0]?.user).toContain("structured_check");
    expect(result).toMatchObject({
      passed: true,
      feedback: "The deterministic evidence is sufficient.",
      modelFeedback: {
        confidence: 0.9,
      },
    });
  });

  it("keeps model checking disabled unless verification config opts in", () => {
    const resolution = resolveLoopModelChecker({
      verificationConfig: {
        type: "structured_check",
        successCriteria: [],
      },
      candidate: {
        check: async () => ({
          passed: false,
          feedback: "should not be used",
        }),
      },
    });

    expect(resolution).toMatchObject({
      enabled: false,
      modelChecker: null,
      reason: null,
    });
  });

  it("reads model checker runtime config from verification config", () => {
    expect(
      getLoopModelCheckerConfig({
        type: "structured_check",
        modelChecker: {
          enabled: true,
          provider: "openai_compatible",
          model: "checker-model",
          maxInputChars: 6_000,
        },
      }),
    ).toEqual({
      enabled: true,
      provider: "openai_compatible",
      model: "checker-model",
      maxInputChars: 6_000,
    });
  });

  it("fails closed when model checking is enabled without an adapter", async () => {
    const resolution = resolveLoopModelChecker({
      verificationConfig: {
        type: "structured_check",
        successCriteria: [],
        modelChecker: {
          enabled: true,
          maxInputChars: 4_000,
        },
      },
    });

    const result = await resolution.modelChecker?.check({
      verification,
      deterministic: runDeterministicChecker(verification),
    });

    expect(resolution).toMatchObject({
      enabled: true,
      reason:
        "Model checker is enabled for this loop, but no model checker adapter is configured.",
      maxInputChars: 4_000,
    });
    expect(result).toMatchObject({
      passed: false,
      requiresHumanApproval: true,
      modelFeedback: {
        status: "unavailable",
      },
    });
  });

  it("uses an injected adapter when model checking is enabled", async () => {
    const resolution = resolveLoopModelChecker({
      verificationConfig: {
        type: "structured_check",
        successCriteria: [],
        modelChecker: {
          enabled: true,
        },
      },
      candidate: {
        check: async () => ({
          passed: true,
          feedback: "adapter accepted",
        }),
      },
    });
    const result = await resolution.modelChecker?.check({
      verification,
      deterministic: runDeterministicChecker(verification),
    });

    expect(resolution).toMatchObject({
      enabled: true,
      reason: null,
    });
    expect(result).toMatchObject({
      passed: true,
      feedback: "adapter accepted",
    });
  });

  it("calls an OpenAI-compatible transport", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const transport = createOpenAICompatibleModelCheckerTransport({
      baseUrl: "https://models.example/v1/",
      apiKey: "test-key",
      model: "checker-model",
      fetchFn: (async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    passed: true,
                    feedback: "accepted",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      }) as typeof fetch,
    });

    const result = await transport.complete({
      system: "system prompt",
      user: "user prompt",
      estimatedChars: 24,
      truncated: false,
    });
    const body = JSON.parse(String(requests[0]?.init.body));

    expect(result).toBe('{"passed":true,"feedback":"accepted"}');
    expect(requests[0]?.url).toBe("https://models.example/v1/chat/completions");
    expect(requests[0]?.init.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });
    expect(body).toMatchObject({
      model: "checker-model",
      stream: false,
      temperature: 0,
      response_format: { type: "json_object" },
    });
    expect(body.messages).toEqual([
      { role: "system", content: "system prompt" },
      { role: "user", content: "user prompt" },
    ]);
  });

  it("surfaces OpenAI-compatible provider failures", async () => {
    const transport = createOpenAICompatibleModelCheckerTransport({
      baseUrl: "https://models.example/v1",
      apiKey: "test-key",
      model: "checker-model",
      fetchFn: (async () =>
        new Response("rate limited", { status: 429 })) as typeof fetch,
    });

    await expect(
      transport.complete({
        system: "system",
        user: "user",
        estimatedChars: 10,
        truncated: false,
      }),
    ).rejects.toThrow("Model checker provider error: 429 rate limited");
  });

  it("creates a runtime model checker from user OpenAI-compatible settings", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const checker = createRuntimeLoopModelChecker({
      verificationConfig: {
        type: "structured_check",
        modelChecker: {
          enabled: true,
          maxInputChars: 4_000,
        },
      },
      userProviderConfig: {
        apiKey: "user-key",
        baseUrl: "https://models.example/v1",
        model: "user-checker",
      },
      fetchFn: (async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    passed: true,
                    feedback: "runtime accepted",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      }) as typeof fetch,
    });

    const result = await checker?.check({
      verification,
      deterministic: runDeterministicChecker(verification),
    });
    const body = JSON.parse(String(requests[0]?.init.body));

    expect(result).toMatchObject({
      passed: true,
      feedback: "runtime accepted",
    });
    expect(body.model).toBe("user-checker");
    expect(String(requests[0]?.init.body).length).toBeLessThan(4_500);
  });

  it("lets loop config override the provider model", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const checker = createRuntimeLoopModelChecker({
      verificationConfig: {
        type: "structured_check",
        modelChecker: {
          enabled: true,
          model: "loop-checker",
        },
      },
      userProviderConfig: {
        apiKey: "user-key",
        baseUrl: "https://models.example/v1",
        model: "user-checker",
      },
      fetchFn: (async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    passed: true,
                    feedback: "runtime accepted",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      }) as typeof fetch,
    });

    await checker?.check({
      verification,
      deterministic: runDeterministicChecker(verification),
    });

    expect(JSON.parse(String(requests[0]?.init.body)).model).toBe(
      "loop-checker",
    );
  });

  it("fails closed when runtime model checker settings are missing", async () => {
    const checker = createRuntimeLoopModelChecker({
      verificationConfig: {
        type: "structured_check",
        modelChecker: {
          enabled: true,
        },
      },
      envProviderConfig: {
        apiKey: "env-key",
      },
    });
    const result = await checker?.check({
      verification,
      deterministic: runDeterministicChecker(verification),
    });

    expect(result).toMatchObject({
      passed: false,
      requiresHumanApproval: true,
      modelFeedback: {
        status: "unavailable",
      },
    });
    expect(result?.feedback).toContain("no OpenAI-compatible model settings");
  });

  it("fails closed for unsupported runtime model checker providers", async () => {
    const checker = createRuntimeLoopModelChecker({
      verificationConfig: {
        type: "structured_check",
        modelChecker: {
          enabled: true,
          provider: "anthropic_compatible",
        },
      },
      userProviderConfig: {
        apiKey: "user-key",
        baseUrl: "https://models.example/v1",
        model: "checker",
      },
    });
    const result = await checker?.check({
      verification,
      deterministic: runDeterministicChecker(verification),
    });

    expect(result).toMatchObject({
      passed: false,
      requiresHumanApproval: true,
    });
    expect(result?.feedback).toContain(
      'provider "anthropic_compatible" is not supported',
    );
  });
});
