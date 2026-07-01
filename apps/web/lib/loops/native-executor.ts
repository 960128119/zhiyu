import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "@openzhiyu/ai/agent/types";
import { createClaudeAgent } from "@/lib/ai/extensions";
import { getUserLlmProviderConfig } from "@/lib/ai/user-llm-api-settings";
import { getUserInsightSettings } from "@/lib/db/insight-queries";
import { getUserTypeForService } from "@/lib/db/user-queries";
import { APP_DIR_NAME } from "@/lib/env/config/constants";
import { AI_PROXY_BASE_URL, DEFAULT_AI_MODEL } from "@/lib/env/constants";
import { stripMalformedToolCalls } from "@/lib/utils/tool-names";
import {
  buildStructuredExecutionReport,
  parseStructuredOutput,
  type ExecutionTraceEvent,
} from "@/lib/types/execution-result";
import type { JobExecutionResult } from "@/lib/cron/types";
import type { Loop, LoopState } from "@/lib/db/schema";
import { parseLoopSpec, safeParseLoopSpec } from "./spec";
import {
  prepareLoopContextWindow,
  type LoopContextWindowResult,
} from "./context-window";
import {
  createLoopToolPermissionHandler,
  summarizeLoopToolGate,
  type LoopToolGateDecision,
} from "./tool-gate";

export interface ExecuteNativeLoopAgentInput {
  userId: string;
  loop: Loop;
  previousState: LoopState | null;
  runId: string;
  abortController?: AbortController;
  attemptContext?: {
    attemptNumber: number;
    maxAttempts: number;
    previousFeedback?: string | null;
    previousResult?: Record<string, unknown> | null;
  };
}

function asPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function compactJson(value: unknown, maxLength = 500): string | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    const text =
      typeof value === "string" ? value : JSON.stringify(value, null, 0);
    const compacted = text.replace(/\s+/g, " ").trim();
    return compacted.length > maxLength
      ? `${compacted.slice(0, maxLength - 1)}…`
      : compacted;
  } catch {
    const text = String(value).replace(/\s+/g, " ").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }
}

function redactedBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return value.replace(/(sk-|Bearer\s+)[\w.-]+/gi, "$1***");
  }
}

function extractLoopSpec(loop: Loop, state: LoopState | null) {
  const fromState =
    state?.stateJson &&
    typeof state.stateJson === "object" &&
    !Array.isArray(state.stateJson)
      ? (state.stateJson as Record<string, unknown>).loopSpec
      : null;
  const parsed = safeParseLoopSpec(fromState);
  if (parsed.success) return parsed.data;

  return parseLoopSpec({
    version: 1,
    goal: loop.goal,
    trigger: loop.triggerConfig,
    context: loop.contextConfig,
    actions: loop.actionPolicy,
    verification: loop.verificationConfig,
    retry: loop.retryPolicy,
    approval: loop.approvalPolicy,
    escalation: loop.escalationPolicy,
    metadata: {},
  });
}

function buildNativeLoopPrompt(input: {
  loop: Loop;
  loopSpec: ReturnType<typeof parseLoopSpec>;
  contextWindow: LoopContextWindowResult;
  sessionDir: string;
  language: string | null;
  maxToolCalls: number;
  attemptContext?: ExecuteNativeLoopAgentInput["attemptContext"];
}): string {
  const outputLanguage = input.language?.toLowerCase().startsWith("en")
    ? "English"
    : "Simplified Chinese";
  const approval = input.loopSpec.approval;
  const actions = input.loopSpec.actions;
  const externalWritesAllowed =
    approval.externalWrites === "allow" &&
    actions.allowed.some((action) =>
      ["send", "reply", "email", "wechat", "wechatDesktopSendMessage"].some(
        (prefix) => action.toLowerCase().includes(prefix.toLowerCase()),
      ),
    );
  const externalWriteRule = externalWritesAllowed
    ? [
        "- External writes are allowed only because this loop's task policy explicitly allows them.",
        "- Before any external write, verify the exact recipient, destination platform, and message content from the loop spec.",
        "- Record the delivery attempt and result in the structured output.",
      ].join("\n")
    : [
        "- Do not perform external writes such as sending messages, emails, calendar invites, or ticket updates.",
        "- If an external write would be useful, return it as a suggested action only.",
      ].join("\n");
  const metadata = asRecord(input.loopSpec.metadata);
  const delivery = asRecord(metadata.delivery);
  const deliveryPlatform =
    typeof delivery.platform === "string" ? delivery.platform : null;
  const recipientName =
    typeof delivery.recipientName === "string"
      ? delivery.recipientName.trim()
      : "";
  const mandatoryDeliveryRule =
    deliveryPlatform === "wechat_desktop" && recipientName
      ? externalWritesAllowed
        ? [
            "Mandatory delivery step:",
            `- This loop is not complete until you call wechatDesktopSendMessage with recipientName exactly "${recipientName}".`,
            "- First collect or generate the requested content, then send that final content through desktop WeChat.",
            "- Do not stop after searching, browsing, or drafting. Search results are only context for the final WeChat message.",
            "- In the structured output, include a deliver/verify reasoning step that says whether the WeChat send tool returned success.",
          ].join("\n")
        : [
            "Delivery is requested, but external writes are not allowed for this loop.",
            `- Prepare the message for WeChat recipient "${recipientName}" as a suggested action requiring confirmation.`,
            "- Do not call wechatDesktopSendMessage.",
          ].join("\n")
      : "";
  const retryContext = input.attemptContext?.previousFeedback
    ? [
        "Retry context:",
        asPrettyJson({
          attemptNumber: input.attemptContext.attemptNumber,
          maxAttempts: input.attemptContext.maxAttempts,
          previousFeedback: input.attemptContext.previousFeedback,
          previousResult: input.attemptContext.previousResult,
        }),
        "Use this feedback as an observation from the verifier/checker. Fix the missing or incorrect parts before finishing.",
      ].join("\n")
    : "";

  return `You are executing an OpenZhiyu Loop Engineering loop.

Output language: ${outputLanguage}

Loop name:
${input.loop.name}

Loop goal:
${input.loop.goal}

Loop spec:
${asPrettyJson(input.loopSpec)}

Current durable state:
${asPrettyJson(input.contextWindow.durableState)}

Context window:
${asPrettyJson({
  compacted: input.contextWindow.compacted,
  originalChars: input.contextWindow.originalChars,
  compactedChars: input.contextWindow.compactedChars,
  maxChars: input.contextWindow.maxChars,
  omittedStateKeys: input.contextWindow.omittedStateKeys,
})}

Execution budget:
${asPrettyJson({
  maxToolCalls: input.maxToolCalls,
})}

${retryContext}

Execution workspace:
${input.sessionDir}

Execution rules:
- Use a Codex-style model/tool/observation loop: decide the next action, call tools when needed, read tool results as observations, then continue until the loop success criteria are satisfied or a blocker is explicit.
- Keep tool use within the execution budget. If the budget is not enough, stop and report the concrete blocker instead of looping.
- Before finishing, verify the result against the loop spec verification section and the mandatory delivery rule, if present.
- Stop only when you can produce the final <structured-output> JSON, or when you must report a concrete blocker.
- Collect context using the loop spec context sources when tools are available.
${externalWriteRule}
${mandatoryDeliveryRule}
- You may read, analyze, summarize, and create internal notes/insights only when allowed by the action policy.
- Produce a concise final answer plus a <structured-output> JSON block.

The <structured-output> JSON should include:
{
  "summary": "short result summary",
  "outcome": "what changed or what was learned",
  "reasoningChain": [
    {
      "summary": "step summary",
      "description": "what was checked",
      "sourceType": "insight|memory|connector|file|tool|system",
      "sourceLabel": "source name",
      "stepType": "input|collect|analyze|generate|deliver|verify"
    }
  ],
  "suggestedActions": [
    {
      "type": "custom",
      "label": "action label",
      "content": "draft or next step",
      "requiresConfirmation": true
    }
  ]
}

Now execute the loop once.`;
}

function messageText(message: AgentMessage): string {
  if (message.type !== "text") return "";
  return typeof message.content === "string" ? message.content : "";
}

function normalizeOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePositiveIntEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getLoopAgentEnvConfig() {
  return {
    apiKey: normalizeOptionalEnv(
      process.env.ANTHROPIC_API_KEY ??
        process.env.ANTHROPIC_AUTH_TOKEN ??
        process.env.LLM_API_KEY,
    ),
    baseUrl: normalizeOptionalEnv(
      process.env.ANTHROPIC_BASE_URL ?? process.env.LLM_BASE_URL,
    ),
    model: normalizeOptionalEnv(
      process.env.ANTHROPIC_MODEL ?? process.env.LLM_MODEL,
    ),
  };
}

export async function executeNativeLoopAgent(
  input: ExecuteNativeLoopAgentInput,
): Promise<JobExecutionResult> {
  const startedAt = Date.now();
  const userSettings = await getUserInsightSettings(input.userId);
  const loopSpec = extractLoopSpec(input.loop, input.previousState);
  const contextWindow = prepareLoopContextWindow({
    state: input.previousState,
    loopSpec,
  });
  const maxToolCalls = parsePositiveIntEnv("LOOP_MAX_TOOL_CALLS", 40);
  const agentAbortController = input.abortController ?? new AbortController();
  const sessionId = `loop-${input.loop.id}`;
  const sessionDir = join(
    homedir(),
    APP_DIR_NAME,
    "sessions",
    "loops",
    input.loop.id,
    input.runId,
  );
  mkdirSync(sessionDir, { recursive: true });
  mkdirSync(join(sessionDir, "temp"), { recursive: true });

  const userAnthropicConfig = await getUserLlmProviderConfig({
    userId: input.userId,
    providerType: "anthropic_compatible",
  });
  const envAnthropicConfig = getLoopAgentEnvConfig();
  const agentBaseUrl =
    userAnthropicConfig?.baseUrl ??
    envAnthropicConfig.baseUrl ??
    AI_PROXY_BASE_URL;
  const agentModel =
    userAnthropicConfig?.model ?? envAnthropicConfig.model ?? DEFAULT_AI_MODEL;
  const agent = createClaudeAgent({
    provider: "claude",
    baseUrl: agentBaseUrl,
    apiKey: userAnthropicConfig?.apiKey ?? envAnthropicConfig.apiKey,
    model: agentModel,
  });

  const userType = await getUserTypeForService(input.userId);
  const prompt = buildNativeLoopPrompt({
    loop: input.loop,
    loopSpec,
    contextWindow,
    sessionDir,
    language: userSettings?.language ?? null,
    maxToolCalls,
    attemptContext: input.attemptContext,
  });
  const traceEvents: ExecutionTraceEvent[] = [
    {
      type: "task_received",
      title: "Native loop received",
      detail: input.loop.name,
      timestamp: new Date().toISOString(),
      metadata: {
        loopId: input.loop.id,
        runId: input.runId,
        triggerType: input.loop.triggerConfig?.type,
        attemptNumber: input.attemptContext?.attemptNumber ?? 1,
        maxAttempts: input.attemptContext?.maxAttempts ?? 1,
      },
    },
    ...(input.attemptContext?.previousFeedback
      ? [
          {
            type: "task_received" as const,
            title: "Retry feedback received",
            detail: compactJson(input.attemptContext.previousFeedback, 240),
            status: "completed" as const,
            timestamp: new Date().toISOString(),
            metadata: {
              attemptNumber: input.attemptContext.attemptNumber,
              maxAttempts: input.attemptContext.maxAttempts,
              previousResult: input.attemptContext.previousResult,
            },
          },
        ]
      : []),
    {
      type: "workspace_prepared",
      title: "Workspace prepared",
      detail: sessionDir,
      status: "completed",
      timestamp: new Date().toISOString(),
      metadata: {
        sessionDir,
      },
    },
    {
      type: "agent_configured",
      title: "Agent configured",
      detail: agentModel,
      status: "completed",
      timestamp: new Date().toISOString(),
      metadata: {
        provider: "claude",
        model: agentModel,
        baseUrl: redactedBaseUrl(agentBaseUrl),
        userProviderConfigured: Boolean(userAnthropicConfig),
      },
    },
    {
      type: "context_prepared",
      title: contextWindow.compacted
        ? "Loop context compacted"
        : "Loop context prepared",
      detail: contextWindow.compacted
        ? `Compacted durable state from ${contextWindow.originalChars} to ${contextWindow.compactedChars} chars`
        : `Durable state fits context budget (${contextWindow.originalChars} chars)`,
      status: "completed",
      timestamp: new Date().toISOString(),
      metadata: {
        compacted: contextWindow.compacted,
        originalChars: contextWindow.originalChars,
        compactedChars: contextWindow.compactedChars,
        maxChars: contextWindow.maxChars,
        omittedStateKeys: contextWindow.omittedStateKeys,
      },
    },
    {
      type: "budget_configured",
      title: "Loop execution budget configured",
      detail: `Max tool calls: ${maxToolCalls}`,
      status: "completed",
      timestamp: new Date().toISOString(),
      metadata: {
        maxToolCalls,
      },
    },
    {
      type: "prompt_built",
      title: "Loop prompt built",
      detail: loopSpec.goal,
      status: "completed",
      timestamp: new Date().toISOString(),
      metadata: {
        approvalExternalWrites: loopSpec.approval.externalWrites,
        allowedActionCount: loopSpec.actions.allowed.length,
        trigger: loopSpec.trigger,
      },
    },
  ];

  let lastTextContent = "";
  let hasError = false;
  let errorMessage: string | undefined;
  let toolCallCount = 0;
  const toolGateDecisions: LoopToolGateDecision[] = [];

  try {
    console.info("[LoopNativeExecutor] starting native agent", {
      loopId: input.loop.id,
      runId: input.runId,
      userId: input.userId,
      sessionDir,
      model: agentModel,
      baseUrl: agentBaseUrl,
      hasApiKey: Boolean(
        userAnthropicConfig?.apiKey ?? envAnthropicConfig.apiKey,
      ),
      userType,
    });

    const generator = agent.run(prompt, {
      sessionId,
      cwd: sessionDir,
      taskId: `loops/${input.loop.id}/${input.runId}`,
      conversation: [],
      permissionMode: "default",
      stream: false,
      excludeTools: ["createLoopTask"],
      onPermissionRequest: createLoopToolPermissionHandler({
        actionPolicy: input.loop.actionPolicy,
        approvalPolicy: input.loop.approvalPolicy,
        onDecision: (decision) => {
          toolGateDecisions.push(decision);
          traceEvents.push({
            type: "permission_decision",
            title:
              decision.decision === "allow"
                ? "Tool permission allowed"
                : decision.decision === "deny"
                  ? "Tool permission denied"
                  : "Tool permission requires approval",
            detail: decision.reason ?? decision.message ?? decision.actionName,
            toolName: decision.actionName,
            toolUseId: decision.toolUseID,
            status:
              decision.decision === "deny"
                ? "error"
                : decision.decision === "require_approval"
                  ? "running"
                  : "completed",
            timestamp: new Date().toISOString(),
            metadata: {
              decision: decision.decision,
              capability: decision.capability,
            },
          });
        },
      }),
      session: {
        user: { id: input.userId, type: userType },
        platform: "loop",
        expires: new Date(Date.now() + 3600000),
      } as any,
      authToken: userAnthropicConfig?.apiKey,
      skillsConfig: {
        enabled: true,
        userDirEnabled: true,
        appDirEnabled: false,
      },
      aiSoulPrompt: userSettings?.aiSoulPrompt ?? null,
      language: userSettings?.language ?? null,
      timezone:
        typeof input.loop.triggerConfig?.timezone === "string"
          ? input.loop.triggerConfig.timezone
          : null,
      abortController: agentAbortController,
    });

    for await (const message of generator) {
      if (message.type === "text") {
        lastTextContent = messageText(message);
        if (lastTextContent.trim()) {
          traceEvents.push({
            type: "model_text",
            title: "Agent response received",
            detail: compactJson(lastTextContent, 240),
            status: "completed",
            timestamp: new Date().toISOString(),
          });
        }
      } else if (message.type === "tool_use") {
        toolCallCount += 1;
        traceEvents.push({
          type: "tool_used",
          title: message.name ?? "Tool used",
          toolName: message.name,
          toolUseId: message.id,
          detail: compactJson(message.input),
          status: "running",
          timestamp: new Date().toISOString(),
        });
        if (toolCallCount > maxToolCalls) {
          hasError = true;
          errorMessage = `Loop execution budget exceeded: ${toolCallCount} tool calls used, max ${maxToolCalls}`;
          traceEvents.push({
            type: "budget_exceeded",
            title: "Loop execution budget exceeded",
            detail: errorMessage,
            status: "error",
            timestamp: new Date().toISOString(),
            metadata: {
              toolCallCount,
              maxToolCalls,
            },
          });
          agentAbortController.abort(errorMessage);
          break;
        }
      } else if (message.type === "tool_result") {
        traceEvents.push({
          type: "tool_result",
          title: message.isError ? "Tool error" : "Tool completed",
          detail: compactJson(message.output),
          toolUseId: message.toolUseId,
          status: message.isError ? "error" : "completed",
          timestamp: new Date().toISOString(),
        });
      } else if (message.type === "error") {
        hasError = true;
        errorMessage = message.message || "Native loop agent error";
        traceEvents.push({
          type: "error",
          title: "Agent error",
          detail: errorMessage,
          status: "error",
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    hasError = true;
    errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[LoopNativeExecutor] agent execution threw", {
      loopId: input.loop.id,
      runId: input.runId,
      userId: input.userId,
      sessionDir,
      errorName: error instanceof Error ? error.name : typeof error,
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    traceEvents.push({
      type: "error",
      title: "Agent execution threw",
      detail: errorMessage,
      status: "error",
      timestamp: new Date().toISOString(),
    });
  }

  traceEvents.push({
    type: hasError ? "error" : "completed",
    title: hasError ? "Native loop failed" : "Native loop completed",
    detail: hasError ? errorMessage : `Used ${toolCallCount} tool calls`,
    status: hasError ? "error" : "completed",
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  });

  const { data: parsedStructuredData, cleanText } =
    parseStructuredOutput(lastTextContent);
  const structuredReport = buildStructuredExecutionReport({
    structuredData: parsedStructuredData,
    cleanText,
    rawText: lastTextContent,
    taskText: input.loop.goal,
    traceEvents,
    sessionFiles: [],
    hasError,
    errorMessage,
    language: userSettings?.language ?? null,
  });

  const output =
    stripMalformedToolCalls(cleanText).trim() ||
    structuredReport.summary ||
    (hasError ? errorMessage : "Loop completed") ||
    "Loop completed";

  return {
    status: hasError ? "error" : "success",
    output,
    error: hasError ? errorMessage : undefined,
    result: {
      executionMode: "native_agent",
      loopId: input.loop.id,
      runId: input.runId,
      sessionDir,
      executionTrace: {
        events: traceEvents,
        toolCallCount,
        maxToolCalls,
        budgetExceeded: traceEvents.some(
          (event) => event.type === "budget_exceeded",
        ),
        failedToolCallCount: traceEvents.filter(
          (event) => event.type === "tool_result" && event.status === "error",
        ).length,
        permissionDecisionCount: toolGateDecisions.length,
        durationMs: Date.now() - startedAt,
      },
      toolGate: summarizeLoopToolGate(toolGateDecisions),
      structuredReport,
    },
    duration: Date.now() - startedAt,
  };
}
