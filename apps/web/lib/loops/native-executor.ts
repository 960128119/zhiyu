import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "@openloomi/ai/agent/types";
import { createClaudeAgent } from "@/lib/ai/extensions";
import { getUserLlmProviderConfig } from "@/lib/ai/user-llm-api-settings";
import {
  getUserInsightSettings,
  getUserTypeForService,
} from "@/lib/db/queries";
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
}

function asPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
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
  state: LoopState | null;
  loopSpec: ReturnType<typeof parseLoopSpec>;
  sessionDir: string;
  language: string | null;
}): string {
  const outputLanguage = input.language?.toLowerCase().startsWith("en")
    ? "English"
    : "Simplified Chinese";

  return `You are executing an OpenLoomi Loop Engineering loop.

Output language: ${outputLanguage}

Loop name:
${input.loop.name}

Loop goal:
${input.loop.goal}

Loop spec:
${asPrettyJson(input.loopSpec)}

Current durable state:
${asPrettyJson({
  currentPhase: input.state?.currentPhase ?? "idle",
  memorySummary: input.state?.memorySummary ?? null,
  openQuestions: input.state?.openQuestions ?? [],
  lastObservation: input.state?.lastObservation ?? null,
  nextAction: input.state?.nextAction ?? null,
  blockedReason: input.state?.blockedReason ?? null,
  stateJson: input.state?.stateJson ?? {},
})}

Execution workspace:
${input.sessionDir}

Execution rules:
- Collect context using the loop spec context sources when tools are available.
- Do not perform external writes such as sending messages, emails, calendar invites, or ticket updates.
- If an external write would be useful, return it as a suggested action only.
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

export async function executeNativeLoopAgent(
  input: ExecuteNativeLoopAgentInput,
): Promise<JobExecutionResult> {
  const startedAt = Date.now();
  const userSettings = await getUserInsightSettings(input.userId);
  const loopSpec = extractLoopSpec(input.loop, input.previousState);
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
  const agent = createClaudeAgent({
    provider: "claude",
    baseUrl: userAnthropicConfig?.baseUrl ?? AI_PROXY_BASE_URL,
    apiKey: userAnthropicConfig?.apiKey,
    model: userAnthropicConfig?.model ?? process.env.LLM_MODEL ?? DEFAULT_AI_MODEL,
  });

  const userType = await getUserTypeForService(input.userId);
  const prompt = buildNativeLoopPrompt({
    loop: input.loop,
    state: input.previousState,
    loopSpec,
    sessionDir,
    language: userSettings?.language ?? null,
  });
  const traceEvents: ExecutionTraceEvent[] = [
    {
      type: "task_received",
      title: "Native loop received",
      detail: input.loop.name,
      timestamp: new Date().toISOString(),
    },
  ];

  let lastTextContent = "";
  let hasError = false;
  let errorMessage: string | undefined;
  let toolCallCount = 0;
  const toolGateDecisions: LoopToolGateDecision[] = [];

  try {
    const generator = agent.run(prompt, {
      sessionId,
      cwd: sessionDir,
      taskId: `loops/${input.loop.id}/${input.runId}`,
      conversation: [],
      permissionMode: "default",
      stream: false,
      excludeTools: ["createScheduledJob"],
      onPermissionRequest: createLoopToolPermissionHandler({
        actionPolicy: input.loop.actionPolicy,
        approvalPolicy: input.loop.approvalPolicy,
        onDecision: (decision) => {
          toolGateDecisions.push(decision);
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
      abortController: input.abortController,
    });

    for await (const message of generator) {
      if (message.type === "text") {
        lastTextContent = messageText(message);
      } else if (message.type === "tool_use") {
        toolCallCount += 1;
        traceEvents.push({
          type: "tool_used",
          title: message.name ?? "Tool used",
          toolName: message.name,
          timestamp: new Date().toISOString(),
        });
      } else if (message.type === "tool_result") {
        traceEvents.push({
          type: "tool_result",
          title: message.isError ? "Tool error" : "Tool completed",
          status: message.isError ? "error" : "completed",
          timestamp: new Date().toISOString(),
        });
      } else if (message.type === "error") {
        hasError = true;
        errorMessage = message.message || "Native loop agent error";
      }
    }
  } catch (error) {
    hasError = true;
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  traceEvents.push({
    type: hasError ? "error" : "completed",
    title: hasError ? "Native loop failed" : "Native loop completed",
    detail: hasError ? errorMessage : `Used ${toolCallCount} tool calls`,
    timestamp: new Date().toISOString(),
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
      toolGate: summarizeLoopToolGate(toolGateDecisions),
      structuredReport,
    },
    duration: Date.now() - startedAt,
  };
}
