import { describe, expect, it } from "vitest";

import { hasUsableConversationApiConfiguration } from "@/lib/ai/conversation-api-configuration";

function createResponse(
  overrides: {
    enabled?: boolean;
    hasApiKey?: boolean;
    baseUrl?: string | null;
    model?: string | null;
    systemOpenAiHasApiKey?: boolean;
    systemAnthropicHasApiKey?: boolean;
  } = {},
) {
  return {
    settings: [
      {
        providerType: "anthropic_compatible",
        enabled: overrides.enabled ?? false,
        hasApiKey: overrides.hasApiKey ?? false,
        baseUrl: overrides.baseUrl ?? null,
        model: overrides.model ?? null,
      },
    ],
    systemDefaults: {
      openai_compatible: {
        hasApiKey: overrides.systemOpenAiHasApiKey ?? false,
      },
      anthropic_compatible: {
        hasApiKey: overrides.systemAnthropicHasApiKey ?? false,
      },
    },
  };
}

describe("conversation API configuration", () => {
  it("accepts a complete enabled user provider", () => {
    expect(
      hasUsableConversationApiConfiguration(
        createResponse({
          enabled: true,
          hasApiKey: true,
          baseUrl: "https://api.anthropic.com",
          model: "claude-sonnet-4-6",
        }),
      ),
    ).toBe(true);
  });

  it("rejects incomplete or disabled user providers", () => {
    expect(
      hasUsableConversationApiConfiguration(
        createResponse({
          enabled: false,
          hasApiKey: true,
          baseUrl: "https://api.anthropic.com",
          model: "claude-sonnet-4-6",
        }),
      ),
    ).toBe(false);
    expect(
      hasUsableConversationApiConfiguration(
        createResponse({
          enabled: true,
          hasApiKey: true,
          baseUrl: " ",
          model: "claude-sonnet-4-6",
        }),
      ),
    ).toBe(false);
  });

  it("accepts a complete enabled OpenAI-compatible user provider", () => {
    const response = createResponse();
    response.settings = [
      {
        providerType: "openai_compatible",
        enabled: true,
        hasApiKey: true,
        baseUrl: "https://openrouter.ai/api/v1",
        model: "openai/gpt-4o-mini",
      },
    ];

    expect(hasUsableConversationApiConfiguration(response)).toBe(true);
  });

  it("accepts the system Anthropic API key fallback", () => {
    expect(
      hasUsableConversationApiConfiguration(
        createResponse({ systemAnthropicHasApiKey: true }),
      ),
    ).toBe(true);
  });

  it("accepts the system OpenAI-compatible API key fallback", () => {
    expect(
      hasUsableConversationApiConfiguration(
        createResponse({ systemOpenAiHasApiKey: true }),
      ),
    ).toBe(true);
  });
});
