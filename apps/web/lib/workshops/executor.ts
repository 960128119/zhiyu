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
import type {
  Workshop,
  WorkshopDirective,
  WorkshopEvent,
  WorkshopMemory,
  WorkshopOutboxItem,
  WorkshopSource,
} from "@/lib/db/schema";
import { buildWorkshopPrompt, extractJsonBlock } from "./context-window";
import { createWorkshopMcpServer } from "./mcp-tools";
import { appendWorkshopEvent } from "./service";

type WorkshopStructuredOutput = {
  summary?: string;
  logEvents?: Array<Record<string, unknown>>;
  memoryCandidates?: Array<Record<string, unknown>>;
  outboxDrafts?: Array<Record<string, unknown>>;
  nextWakeupSuggestion?: Record<string, unknown> | null;
};

export type WorkshopExecutionResult = {
  status: "success" | "error";
  output: string;
  structured: WorkshopStructuredOutput | null;
  error?: string;
  toolCallCount: number;
  durationMs: number;
};

function normalizeOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePositiveIntEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getWorkshopAgentEnvConfig() {
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

function messageText(message: AgentMessage): string {
  if (message.type !== "text") return "";
  return typeof message.content === "string" ? message.content : "";
}

function compact(value: unknown, maxLength = 700) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function shouldFlushAgentText(text: string, force = false) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (force) return true;
  if (trimmed.length >= 240) return true;
  return /[銆傦紒锛?!?]\s*$/.test(trimmed);
}

function isEmptyObject(value: unknown) {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0
  );
}

function isWorkshopTool(name: string | undefined) {
  return Boolean(
    name &&
      (name.startsWith("mcp__workshop-tools__") ||
        [
          "workshopLogEvent",
          "workshopListSources",
          "workshopGetDirectives",
          "workshopReadMemory",
          "workshopWriteMemory",
          "workshopCreateOutboxDraft",
          "webReadPage",
        ].includes(name)),
  );
}

function compactToolInput(input: unknown) {
  if (input === undefined || input === null || isEmptyObject(input)) {
    return null;
  }
  return compact(input);
}

function compactToolOutput(output: string | undefined, isError = false) {
  if (!output?.trim()) return null;
  if (isError) return compact(output, 1_200);
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      const rc = parsed.rc;
      const data = parsed.data;
      if (rc !== undefined) {
        return `Tool completed with JSON: rc=${String(rc)}, data=${
          data === null || data === undefined ? "empty" : "returned"
        }.`;
      }
      return `Tool completed with JSON output (${output.length} characters).`;
    }
  } catch {}
  return compact(output, 900);
}

function stripStructuredJson(text: string) {
  return text
    .replace(/```json\s*[\s\S]*?```/gi, "")
    .replace(/^\s*\{[\s\S]*\}\s*$/g, "")
    .trim();
}

export async function executeWorkshopAgent(input: {
  userId: string;
  workshop: Workshop;
  runId: string;
  sources: WorkshopSource[];
  memories: WorkshopMemory[];
  directives: WorkshopDirective[];
  events: WorkshopEvent[];
  outbox: WorkshopOutboxItem[];
  abortController?: AbortController;
}): Promise<WorkshopExecutionResult> {
  const startedAt = Date.now();
  const maxToolCalls = parsePositiveIntEnv("WORKSHOP_MAX_TOOL_CALLS", 30);
  const abortController = input.abortController ?? new AbortController();
  const sessionId = `workshop-${input.workshop.id}`;
  const sessionDir = join(
    homedir(),
    APP_DIR_NAME,
    "sessions",
    "workshops",
    input.workshop.id,
    input.runId,
  );
  mkdirSync(sessionDir, { recursive: true });
  mkdirSync(join(sessionDir, "temp"), { recursive: true });

  const userSettings = await getUserInsightSettings(input.userId);
  const userAnthropicConfig = await getUserLlmProviderConfig({
    userId: input.userId,
    providerType: "anthropic_compatible",
  });
  const envConfig = getWorkshopAgentEnvConfig();
  const agent = createClaudeAgent({
    provider: "claude",
    baseUrl: userAnthropicConfig?.baseUrl ?? envConfig.baseUrl ?? AI_PROXY_BASE_URL,
    apiKey: userAnthropicConfig?.apiKey ?? envConfig.apiKey,
    model: userAnthropicConfig?.model ?? envConfig.model ?? DEFAULT_AI_MODEL,
  });
  const userType = await getUserTypeForService(input.userId);
  const prompt = buildWorkshopPrompt({
    workshop: input.workshop,
    sources: input.sources,
    memories: input.memories,
    directives: input.directives,
    events: input.events,
    outbox: input.outbox,
    maxToolCalls,
  });
  const workshopMcpServer = createWorkshopMcpServer({
    workshopId: input.workshop.id,
    runId: input.runId,
  });

  await appendWorkshopEvent({
    workshopId: input.workshop.id,
    runId: input.runId,
    type: "agent_configured",
    title: "CC SDK executor configured",
    body: "Preparing workshop context and starting one open exploration run.",
    metadata: {
      maxToolCalls,
      sessionDir,
    },
  });

  let accumulatedText = "";
  let loggedTextOffset = 0;
  let toolCallCount = 0;
  let budgetedToolCallCount = 0;
  const toolUseNames = new Map<string, string>();
  let hasError = false;
  let errorMessage: string | undefined;

  const flushAgentText = async (force = false) => {
    const nextText = accumulatedText.slice(loggedTextOffset);
    if (!shouldFlushAgentText(nextText, force)) return;
    loggedTextOffset = accumulatedText.length;
    const displayText = stripStructuredJson(nextText);
    if (!displayText) return;
    await appendWorkshopEvent({
      workshopId: input.workshop.id,
      runId: input.runId,
      type: "agent_text",
      title: force ? "Agent final output" : "Agent partial output",
      body: compact(displayText, 1_200),
    });
  };

  try {
    const generator = agent.run(prompt, {
      sessionId,
      cwd: sessionDir,
      taskId: `workshops/${input.workshop.id}/${input.runId}`,
      conversation: [],
      permissionMode: "bypassPermissions",
      stream: true,
      excludeTools: ["wechatDesktopSendMessage"],
      customMcpServers: {
        "workshop-tools": workshopMcpServer,
      },
      allowedTools: [
        "Read",
        "Edit",
        "Write",
        "Glob",
        "Grep",
        "Bash",
        "WebFetch",
        "WebSearch",
        "Skill",
        "Task",
        "LSP",
        "TodoWrite",
        "workshopLogEvent",
        "workshopListSources",
        "workshopGetDirectives",
        "workshopReadMemory",
        "workshopWriteMemory",
        "workshopCreateOutboxDraft",
        "webReadPage",
        "mcp__workshop-tools__workshopLogEvent",
        "mcp__workshop-tools__workshopListSources",
        "mcp__workshop-tools__workshopGetDirectives",
        "mcp__workshop-tools__workshopReadMemory",
        "mcp__workshop-tools__workshopWriteMemory",
        "mcp__workshop-tools__workshopCreateOutboxDraft",
        "mcp__workshop-tools__webReadPage",
        "searchKnowledgeBase",
        "searchUnifiedMemory",
        "searchMemoryPath",
        "getRawMessages",
        "searchRawMessages",
        "getFullDocumentContent",
        "listKnowledgeBaseDocuments",
        "time",
      ],
      session: {
        user: { id: input.userId, type: userType },
        platform: "workshop",
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
      abortController,
    });

    for await (const message of generator) {
      if (message.type === "text") {
        accumulatedText += messageText(message);
        await flushAgentText(false);
      } else if (message.type === "tool_use") {
        await flushAgentText(false);
        toolCallCount += 1;
        if (message.id && message.name) {
          toolUseNames.set(message.id, message.name);
        }
        const isInternalWorkshopTool = isWorkshopTool(message.name);
        if (!isInternalWorkshopTool) {
          budgetedToolCallCount += 1;
          await appendWorkshopEvent({
            workshopId: input.workshop.id,
            runId: input.runId,
            type: "tool_call",
            title: message.name ?? "Tool call",
            body: compactToolInput(message.input),
            metadata: {
              toolUseId: message.id,
              toolCallCount,
              budgetedToolCallCount,
            },
          });
        }
        if (budgetedToolCallCount > maxToolCalls) {
          hasError = true;
          errorMessage = `Workshop external tool budget exceeded: ${budgetedToolCallCount}/${maxToolCalls}`;
          abortController.abort(errorMessage);
          break;
        }
      } else if (message.type === "tool_result") {
        await flushAgentText(false);
        const toolName = message.toolUseId
          ? toolUseNames.get(message.toolUseId)
          : undefined;
        if (!isWorkshopTool(toolName)) {
          await appendWorkshopEvent({
            workshopId: input.workshop.id,
            runId: input.runId,
            type: message.isError ? "tool_error" : "tool_result",
            title: message.isError ? "Tool returned error" : "Tool completed",
            body: compactToolOutput(message.output, message.isError),
            metadata: {
              toolUseId: message.toolUseId,
              toolName,
            },
          });
        }
      } else if (message.type === "error") {
        await flushAgentText(false);
        hasError = true;
        errorMessage = message.message || "Workshop agent error";
        await appendWorkshopEvent({
          workshopId: input.workshop.id,
          runId: input.runId,
          type: "error",
          title: "Agent runtime error",
          body: errorMessage,
        });
      }
    }
    await flushAgentText(true);
  } catch (error) {
    hasError = true;
    errorMessage = error instanceof Error ? error.message : String(error);
    await appendWorkshopEvent({
      workshopId: input.workshop.id,
      runId: input.runId,
      type: "error",
      title: "CC SDK execution error",
      body: errorMessage,
    });
  }

  const lastText = accumulatedText;
  const structured = extractJsonBlock(lastText) as WorkshopStructuredOutput | null;
  const output =
    structured?.summary ??
    lastText.trim() ??
    (hasError ? errorMessage : "Workshop run completed") ??
    "Workshop run completed";

  return {
    status: hasError ? "error" : "success",
    output,
    structured,
    error: hasError ? errorMessage : undefined,
    toolCallCount: budgetedToolCallCount,
    durationMs: Date.now() - startedAt,
  };
}
