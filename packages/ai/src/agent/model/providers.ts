import { customProvider } from "ai";
import type { LanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { DEV_PORT, PROD_PORT } from "@openzhiyu/shared";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * User type - application-specific, defaults to "free" for package consumers.
 * Override by calling setUserTypeOverride() before initializing models.
 */
export type UserType =
  | "guest"
  | "regular"
  | "slack"
  | "discord"
  | "google"
  | "basic"
  | "pro"
  | "team"
  | "enterprise"
  | "free";

/**
 * User context for AI requests
 */
export interface AIUserContext {
  id: string;
  email: string | null | undefined;
  name: string | null | undefined;
  type: string; // User type string - any value is accepted
  token?: string; // Optional: use existing cloud auth token instead of generating new one
  llmApiSettings?: {
    openaiCompatible?: {
      apiKey: string;
      baseUrl: string;
      model: string;
    };
  };
}

const userContextStorage = new AsyncLocalStorage<AIUserContext | null>();

/**
 * Module-level keepalive fetch instance for connection reuse.
 * Using a singleton pattern to ensure the same connection is reused across requests.
 */
let _keepaliveFetch: typeof fetch | null = null;

/**
 * Create a fetch function with keepalive enabled for connection reuse.
 * This reduces TTFT (Time To First Token) by maintaining persistent HTTP connections.
 */
function createKeepAliveFetch(): typeof fetch {
  if (_keepaliveFetch) return _keepaliveFetch;

  _keepaliveFetch = async (
    url: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const keepaliveInit: RequestInit = {
      ...init,
      keepalive: true, // Keep connection alive for subsequent requests
    };
    return fetch(url, keepaliveInit);
  };

  return _keepaliveFetch;
}

/**
 * Set the user context for the current asynchronous request chain.
 * Call this at the beginning of bot/background operations
 */
export function setAIUserContext(context: AIUserContext | null) {
  userContextStorage.enterWith(context);
}

/**
 * Clear the user context for the current asynchronous request chain.
 * Call this after bot/background operations complete
 */
export function clearAIUserContext() {
  userContextStorage.enterWith(null);
}

/**
 * Get the current user context
 */
export function getAIUserContext(): AIUserContext | null {
  return userContextStorage.getStore() ?? null;
}

/**
 * Create a custom fetch function that adds user JWT token
 * @param userContext - Optional user context for authentication
 * @param options - Options including keepalive for connection reuse
 */
function createFetchWithContext(
  userContext?: AIUserContext | null,
  options?: { keepalive?: boolean },
): typeof fetch {
  const baseFetch = options?.keepalive ? createKeepAliveFetch() : fetch;

  return async (url, init) => {
    const headers = new Headers(init?.headers);

    if (userContext) {
      if (!userContext.token) {
        const error = new Error(
          "[AI Provider] Cloud auth token is required but not provided. " +
            "Please ensure you are logged in with cloud authentication.",
        );
        console.error(error.message);
        throw error;
      }

      headers.set("Authorization", `Bearer ${userContext.token}`);
    }

    return baseFetch(url, {
      ...init,
      headers,
      keepalive: options?.keepalive ?? true, // Default to keepalive for connection reuse
    });
  };
}

/**
 * Get the appropriate base URL for LLM API
 * - Native: Use local proxy (/api/ai/v1)
 * - Web (cloud + local dev): Use external AI provider directly
 */
function getLLMBaseUrl(isNativeMode: boolean): string {
  if (isNativeMode) {
    const isDev = process.env.NODE_ENV !== "production";
    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    const fallbackAppUrl = isDev
      ? `http://localhost:${DEV_PORT}`
      : `http://localhost:${PROD_PORT}`;
    let localUrl = fallbackAppUrl;

    if (configuredAppUrl) {
      try {
        const parsedUrl = new URL(configuredAppUrl);
        if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
          localUrl = configuredAppUrl;
        } else {
          console.warn(
            `[LLM Provider] Ignoring NEXT_PUBLIC_APP_URL with unsupported protocol: ${configuredAppUrl}`,
          );
        }
      } catch {
        console.warn(
          `[LLM Provider] Ignoring invalid NEXT_PUBLIC_APP_URL: ${configuredAppUrl}`,
        );
      }
    }

    const proxyPath = "/api/ai/v1";
    const fullLocalUrl = `${localUrl}${proxyPath}`;
    return fullLocalUrl;
  }

  const externalUrl = process.env.LLM_BASE_URL;
  if (!externalUrl) {
    throw new Error("LLM_BASE_URL environment variable is not set (web mode)");
  }
  console.log(
    "[LLM Provider] Using external AI provider (web mode):",
    externalUrl,
  );
  return externalUrl;
}

/**
 * Validate and get required environment variables
 * @returns Validated environment variables
 * @throws Error if any required environment variable is missing
 */
function getValidatedEnv(
  isNativeMode: boolean,
  userContext = getAIUserContext(),
) {
  const userOpenAISettings =
    userContext?.llmApiSettings?.openaiCompatible;
  const baseUrl = userOpenAISettings?.baseUrl ?? getLLMBaseUrl(isNativeMode);

  const apiKey =
    userOpenAISettings?.apiKey ??
    (isNativeMode ? "local-auth-via-jwt-token" : process.env.LLM_API_KEY);

  if (!isNativeMode && !apiKey) {
    throw new Error("LLM_API_KEY environment variable is not set (web mode)");
  }

  const modelName = userOpenAISettings?.model ?? process.env.LLM_MODEL;

  if (!modelName) {
    throw new Error("LLM_MODEL environment variable is not set");
  }

  return {
    baseUrl,
    apiKey,
    modelName,
    imageModelName: process.env.LLM_IMAGE_MODEL,
    vlmModelName: process.env.LLM_VISION_LANGUAGE_MODEL || modelName,
  };
}

type ModelBundle = {
  model: LanguageModel;
  vlmModel: LanguageModel;
  provider: ReturnType<typeof customProvider>;
};

const defaultModelBundles = new Map<boolean, ModelBundle>();
const userModelBundles = new WeakMap<
  AIUserContext,
  Map<boolean, ModelBundle>
>();

function createModelBundle(
  isNativeMode: boolean,
  userContext: AIUserContext | null,
): ModelBundle {
  const env = getValidatedEnv(isNativeMode, userContext);
  const { baseUrl, apiKey, modelName, imageModelName, vlmModelName } = env;

  const shouldUseCustomFetch =
    userContext && (!isNativeMode || userContext.token);

  // Use keepalive fetch to reduce TTFT through connection reuse
  const customFetch = shouldUseCustomFetch
    ? createFetchWithContext(userContext, { keepalive: true })
    : createKeepAliveFetch();

  if (userContext && isNativeMode && !userContext.token) {
    console.warn(
      "[AI Provider] Bot operation in native environment without cloud token - may fail",
    );
  }

  const model = createOpenAICompatible({
    baseURL: baseUrl,
    name: "chat-model",
    apiKey: apiKey,
    fetch: customFetch,
  }).chatModel(modelName);

  const vlmModel = createOpenAICompatible({
    baseURL: baseUrl,
    name: "vlm-model",
    apiKey: apiKey,
    fetch: customFetch,
  }).chatModel(vlmModelName);

  const imageModels = imageModelName
    ? {
        "small-model": createOpenAICompatible({
          baseURL: baseUrl,
          name: "image-model",
          apiKey: apiKey,
          fetch: customFetch,
        }).imageModel(imageModelName),
      }
    : undefined;

  const provider = customProvider({
    languageModels: {
      "chat-model": model,
      "vlm-model": vlmModel,
      "title-model": model,
      "artifact-model": model,
    },
    imageModels,
  });

  return { model, vlmModel, provider };
}

function getModelBundle(isNativeMode: boolean): ModelBundle {
  const userContext = getAIUserContext();
  if (!userContext) {
    const existing = defaultModelBundles.get(isNativeMode);
    if (existing) return existing;
    const created = createModelBundle(isNativeMode, null);
    defaultModelBundles.set(isNativeMode, created);
    return created;
  }

  let bundles = userModelBundles.get(userContext);
  if (!bundles) {
    bundles = new Map<boolean, ModelBundle>();
    userModelBundles.set(userContext, bundles);
  }
  const existing = bundles.get(isNativeMode);
  if (existing) return existing;
  const created = createModelBundle(isNativeMode, userContext);
  bundles.set(isNativeMode, created);
  return created;
}

/**
 * Get the chat model
 * Lazily initializes models on first access
 */
export function getModel(isNativeMode: boolean): LanguageModel {
  return getModelBundle(isNativeMode).model;
}

/**
 * Get the VLM (Vision Language Model)
 * Lazily initializes models on first access
 */
export function getVLMModel(isNativeMode: boolean): LanguageModel {
  return getModelBundle(isNativeMode).vlmModel;
}

/**
 * Create a dynamic model with the specified model name
 * This allows using any model (e.g., from OpenRouter) at request time
 */
export function createDynamicModel(
  isNativeMode: boolean,
  modelName?: string,
): LanguageModel {
  const userContext = getAIUserContext();
  const env = getValidatedEnv(isNativeMode, userContext);
  const actualModelName = modelName || env.modelName;

  const shouldUseCustomFetch =
    userContext && (!isNativeMode || userContext.token);

  // Use keepalive fetch to reduce TTFT through connection reuse
  const customFetch = shouldUseCustomFetch
    ? createFetchWithContext(userContext, { keepalive: true })
    : createKeepAliveFetch();

  const debugFetch = customFetch
    ? async (url: RequestInfo | URL, init?: RequestInit) => {
        const urlStr =
          typeof url === "string"
            ? url
            : url instanceof URL
              ? url.toString()
              : url.url;
        if (urlStr.includes("openrouter.ai/api/v1/chat/completions")) {
          console.log(`[OpenRouter Request Debug] URL: ${urlStr}`);
          if (init?.body) {
            const bodyStr =
              typeof init.body === "string"
                ? init.body
                : JSON.stringify(init.body);
            try {
              const bodyObj = JSON.parse(bodyStr) as {
                model?: unknown;
                tools?: unknown;
              };
              console.log(`[OpenRouter Request Debug] Model: ${bodyObj.model}`);
              if (Array.isArray(bodyObj.tools)) {
                console.log(
                  `[OpenRouter Request Debug] Tools count: ${bodyObj.tools.length}`,
                );
                bodyObj.tools.forEach((tool: unknown, idx: number) => {
                  const maybeTool = tool as {
                    function?: { name?: string };
                    name?: string;
                  };
                  const toolName = maybeTool.function?.name || maybeTool.name;
                  console.log(
                    `[OpenRouter Request Debug] Tool[${idx}] name: "${toolName}"`,
                  );
                });
              }
            } catch (e) {
              console.log(
                "[OpenRouter Request Debug] Body (parse failed):",
                bodyStr,
              );
            }
          }
        }
        return customFetch(url, init);
      }
    : undefined;

  console.log(
    `[Dynamic Model] Creating model with name: ${actualModelName}, baseUrl: ${env.baseUrl}`,
  );

  return createOpenAICompatible({
    baseURL: env.baseUrl,
    name: "dynamic-model",
    apiKey: env.apiKey,
    fetch: debugFetch,
  }).chatModel(actualModelName);
}

/**
 * Get the model provider
 * Lazily initializes models on first access
 */
export function getModelProvider(
  isNativeMode: boolean,
): ReturnType<typeof customProvider> {
  return getModelBundle(isNativeMode).provider;
}
