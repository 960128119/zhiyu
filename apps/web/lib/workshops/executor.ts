import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentMessage } from "@openzhiyu/ai/agent/types";
import { createClaudeAgent } from "@/lib/ai/extensions";
import { getUserLlmProviderConfig } from "@/lib/ai/user-llm-api-settings";
import { getUserInsightSettings } from "@/lib/db/insight-queries";
import { getUserTypeForService } from "@/lib/db/user-queries";
import { getAppDir } from "@/lib/env/config/constants";
import { AI_PROXY_BASE_URL, DEFAULT_AI_MODEL } from "@/lib/env/constants";
import { buildBrainContextPackFromStore } from "@/lib/brain/repository";
import { parseBrainRecallProfilesFromModelConfig } from "@/lib/brain/recall-profiles";
import {
  brainContextPackToWorkshopMemoryContextPack,
  createWorkshopBrainRequester,
} from "@/lib/brain/workshop-memory";
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
import { workDisplayLabel } from "./display-labels";
import { appendWorkshopEvent } from "./service";
import { resolveWorkshopSdkAllowedTools } from "./tool-access";

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
        "workshopReadLinkedWorkshopEvents",
        "workshopReadMemory",
        "workshopSearchMemory",
        "workshopRecordMemoryRecallFeedback",
        "workshopInspectMemoryRecallQuality",
        "workshopGetMemoryEvidence",
        "workshopListMemoryCandidates",
        "workshopReviewMemory",
        "workshopWriteMemory",
        "workshopCreateLoopTask",
        "workshopCreateOutboxDraft",
        "wechatLocalHealth",
        "wechatRecordNewMessages",
        "wechatListRecordedMessages",
        "wechatMarkMessagesProcessed",
        "interactionProcessRecordedMessages",
        "interactionCreateWikiNote",
        "interactionCreateTaskCandidate",
        "interactionCreateMemoryCandidate",
        "interactionListWiki",
        "wechatLocalCheckNewMessages",
        "wechatLocalSessions",
        "wechatLocalHistory",
        "wechatLocalSearch",
        "wechatCreateReplyDraft",
        "webReadPage",
        "aStockQuote",
        "aStockResearch",
        "aStockSignals",
        "aStockTrend",
        "aStockTrendSystem",
        "aStockTrendStateHistory",
        "aStockTrendStrategyStats",
        "aStockFundamentals",
        "aStockNewsAndFilings",
        "aStockMarketMood",
        "quantPaperGetAccount",
        "quantRuleEvaluate",
        "watchlistFollowupTaskUpsert",
        "watchlistFollowupTaskList",
        "watchlistCandidateAgeReview",
        "watchlistChangeHistory",
        "watchlistPerformanceReview",
        "quantMarketDiscoverCandidates",
        "quantPaperGetWatchlist",
        "quantPaperProposeWatchlistChange",
        "quantPaperPlaceOrder",
        "quantPaperCancelOrder",
        "videoRenderInvestmentBrief",
        "videoGenerateInvestmentBrief",
        "douyinCheckAccount",
        "douyinCreatePublishDraft",
        "douyinPrepareUpload",
        "douyinPublishApprovedDraft",
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
        return `工具已返回 JSON：rc=${String(rc)}，data=${
          data === null || data === undefined ? "为空" : "已返回"
        }。`;
      }
      return `工具已返回 JSON 输出（${output.length} 个字符）。`;
    }
  } catch {}
  return compact(output, 900);
}

function isTraceableFallbackTool(name: string | undefined) {
  return Boolean(name && ["Bash", "WebSearch", "WebFetch"].includes(name));
}

function fallbackSourceTitle(name: string | undefined, input: unknown) {
  const inputText = compact(input, 500).toLowerCase();
  if (name === "Bash" && inputText.includes("reportapi.eastmoney.com")) {
    return "备用数据源：通过命令读取东财研报接口";
  }
  if (name === "Bash" && inputText.includes("eastmoney.com")) {
    return "备用数据源：通过命令读取东财";
  }
  if (name === "Bash") return "备用数据源：命令执行结果";
  return `备用数据源：${name ? workDisplayLabel(name) : "通用工具"}`;
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
    getAppDir(),
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
    baseUrl:
      userAnthropicConfig?.baseUrl ?? envConfig.baseUrl ?? AI_PROXY_BASE_URL,
    apiKey: userAnthropicConfig?.apiKey ?? envConfig.apiKey,
    model: userAnthropicConfig?.model ?? envConfig.model ?? DEFAULT_AI_MODEL,
  });
  const userType = await getUserTypeForService(input.userId);
  let memoryContext:
    | Parameters<typeof buildWorkshopPrompt>[0]["memoryContext"]
    | undefined;
  let brainContextError: string | null = null;
  try {
    const recallProfileResult = parseBrainRecallProfilesFromModelConfig(
      input.workshop.modelConfig,
    );
    const taskIntent = [
      input.workshop.name,
      input.workshop.mission,
      ...input.directives.slice(0, 6).map((directive) => directive.content),
    ]
      .filter(Boolean)
      .join("\n");
    const brainContext = await buildBrainContextPackFromStore({
      requester: createWorkshopBrainRequester(input.workshop),
      taskIntent,
      maxItems: 12,
      memoryLimit: 200,
      recallProfiles: recallProfileResult.profiles,
      metadata: {
        source: "workshop_prompt",
        workshopId: input.workshop.id,
        runId: input.runId,
        recallProfileIds: recallProfileResult.profiles.map(
          (profile) => profile.id,
        ),
        recallProfileIssueCodes: recallProfileResult.issues.map(
          (issue) => issue.code,
        ),
      },
    });
    if (brainContext.items.length > 0) {
      memoryContext = brainContextPackToWorkshopMemoryContextPack({
        taskIntent,
        pack: brainContext,
      });
    }
  } catch (error) {
    brainContextError = error instanceof Error ? error.message : String(error);
  }
  const prompt = buildWorkshopPrompt({
    workshop: input.workshop,
    sources: input.sources,
    memories: input.memories,
    directives: input.directives,
    events: input.events,
    outbox: input.outbox,
    maxToolCalls,
    memoryContext,
  });
  const workshopMcpServer = createWorkshopMcpServer({
    workshop: input.workshop,
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
      memoryBackend: memoryContext ? "brain" : "legacy",
      brainContextError,
    },
  });

  let accumulatedText = "";
  let loggedTextOffset = 0;
  let toolCallCount = 0;
  let budgetedToolCallCount = 0;
  const toolUseNames = new Map<string, string>();
  const toolUseInputs = new Map<string, unknown>();
  let hasError = false;
  let errorMessage: string | undefined;

  const flushAgentText = async (force = false) => {
    if (!force) return;
    const nextText = accumulatedText.slice(loggedTextOffset);
    if (!shouldFlushAgentText(nextText, force)) return;
    loggedTextOffset = accumulatedText.length;
    const displayText = stripStructuredJson(nextText);
    if (!displayText) return;
    await appendWorkshopEvent({
      workshopId: input.workshop.id,
      runId: input.runId,
      type: "agent_text",
      title: "Agent final output",
      body: compact(displayText, 4_000),
      metadata: {
        final: true,
      },
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
      excludeTools: [
        "wechatDesktopPreviewMessage",
        "wechatDesktopSendMessage",
        "mcp__business-tools__wechatDesktopPreviewMessage",
        "mcp__business-tools__wechatDesktopSendMessage",
      ],
      customMcpServers: {
        "workshop-tools": workshopMcpServer,
      },
      allowedTools: resolveWorkshopSdkAllowedTools(input.workshop, [
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
        "workshopReadLinkedWorkshopEvents",
        "workshopReadMemory",
        "workshopSearchMemory",
        "workshopRecordMemoryRecallFeedback",
        "workshopInspectMemoryRecallQuality",
        "workshopInspectHarnessQuality",
        "workshopCreateHarnessProposal",
        "workshopCreateHarnessEvaluationCampaign",
        "workshopRunHarnessEvaluation",
        "workshopGetMemoryEvidence",
        "workshopListMemoryCandidates",
        "workshopReviewMemory",
        "workshopWriteMemory",
        "workshopCreateLoopTask",
        "workshopCreateOutboxDraft",
        "wechatLocalHealth",
        "wechatRecordNewMessages",
        "wechatListRecordedMessages",
        "wechatMarkMessagesProcessed",
        "interactionProcessRecordedMessages",
        "interactionCreateWikiNote",
        "interactionCreateTaskCandidate",
        "interactionCreateMemoryCandidate",
        "interactionListWiki",
        "wechatLocalCheckNewMessages",
        "wechatLocalSessions",
        "wechatLocalHistory",
        "wechatLocalSearch",
        "wechatCreateReplyDraft",
        "webReadPage",
        "aStockQuote",
        "aStockResearch",
        "aStockSignals",
        "aStockTrend",
        "aStockFundamentals",
        "aStockNewsAndFilings",
        "aStockMarketMood",
        "quantPaperGetAccount",
        "quantRuleEvaluate",
        "quantMarketDiscoverCandidates",
        "quantPaperGetWatchlist",
        "quantPaperProposeWatchlistChange",
        "quantPaperPlaceOrder",
        "quantPaperCancelOrder",
        "videoRenderInvestmentBrief",
        "videoGenerateInvestmentBrief",
        "douyinCheckAccount",
        "douyinCreatePublishDraft",
        "douyinPrepareUpload",
        "douyinPublishApprovedDraft",
        "mcp__workshop-tools__workshopLogEvent",
        "mcp__workshop-tools__workshopListSources",
        "mcp__workshop-tools__workshopGetDirectives",
        "mcp__workshop-tools__workshopReadLinkedWorkshopEvents",
        "mcp__workshop-tools__workshopReadMemory",
        "mcp__workshop-tools__workshopSearchMemory",
        "mcp__workshop-tools__workshopRecordMemoryRecallFeedback",
        "mcp__workshop-tools__workshopInspectMemoryRecallQuality",
        "mcp__workshop-tools__workshopInspectHarnessQuality",
        "mcp__workshop-tools__workshopCreateHarnessProposal",
        "mcp__workshop-tools__workshopCreateHarnessEvaluationCampaign",
        "mcp__workshop-tools__workshopRunHarnessEvaluation",
        "mcp__workshop-tools__workshopGetMemoryEvidence",
        "mcp__workshop-tools__workshopListMemoryCandidates",
        "mcp__workshop-tools__workshopReviewMemory",
        "mcp__workshop-tools__workshopWriteMemory",
        "mcp__workshop-tools__workshopCreateLoopTask",
        "mcp__workshop-tools__workshopCreateOutboxDraft",
        "mcp__workshop-tools__wechatLocalHealth",
        "mcp__workshop-tools__wechatRecordNewMessages",
        "mcp__workshop-tools__wechatListRecordedMessages",
        "mcp__workshop-tools__wechatMarkMessagesProcessed",
        "mcp__workshop-tools__interactionProcessRecordedMessages",
        "mcp__workshop-tools__interactionCreateWikiNote",
        "mcp__workshop-tools__interactionCreateTaskCandidate",
        "mcp__workshop-tools__interactionCreateMemoryCandidate",
        "mcp__workshop-tools__interactionListWiki",
        "mcp__workshop-tools__wechatLocalCheckNewMessages",
        "mcp__workshop-tools__wechatLocalSessions",
        "mcp__workshop-tools__wechatLocalHistory",
        "mcp__workshop-tools__wechatLocalSearch",
        "mcp__workshop-tools__wechatCreateReplyDraft",
        "mcp__workshop-tools__webReadPage",
        "mcp__workshop-tools__aStockQuote",
        "mcp__workshop-tools__aStockResearch",
        "mcp__workshop-tools__aStockSignals",
        "mcp__workshop-tools__aStockTrend",
        "mcp__workshop-tools__aStockTrendSystem",
        "mcp__workshop-tools__aStockTrendStateHistory",
        "mcp__workshop-tools__aStockTrendStrategyStats",
        "mcp__workshop-tools__aStockFundamentals",
        "mcp__workshop-tools__aStockNewsAndFilings",
        "mcp__workshop-tools__aStockMarketMood",
        "mcp__workshop-tools__quantPaperGetAccount",
        "mcp__workshop-tools__quantTradePlanList",
        "mcp__workshop-tools__quantTradePlanUpsert",
        "mcp__workshop-tools__quantTradePlanReview",
        "mcp__workshop-tools__quantRuleEvaluate",
        "mcp__workshop-tools__watchlistFollowupTaskUpsert",
        "mcp__workshop-tools__watchlistFollowupTaskList",
        "mcp__workshop-tools__watchlistCandidateAgeReview",
        "mcp__workshop-tools__watchlistChangeHistory",
        "mcp__workshop-tools__watchlistPerformanceReview",
        "mcp__workshop-tools__quantMarketDiscoverCandidates",
        "mcp__workshop-tools__quantPaperGetWatchlist",
        "mcp__workshop-tools__quantPaperProposeWatchlistChange",
        "mcp__workshop-tools__quantPaperPlaceOrder",
        "mcp__workshop-tools__quantPaperCancelOrder",
        "mcp__workshop-tools__videoRenderInvestmentBrief",
        "mcp__workshop-tools__videoGenerateInvestmentBrief",
        "mcp__workshop-tools__douyinCheckAccount",
        "mcp__workshop-tools__douyinCreatePublishDraft",
        "mcp__workshop-tools__douyinPrepareUpload",
        "mcp__workshop-tools__douyinPublishApprovedDraft",
        "searchKnowledgeBase",
        "searchUnifiedMemory",
        "searchMemoryPath",
        "getRawMessages",
        "searchRawMessages",
        "getFullDocumentContent",
        "listKnowledgeBaseDocuments",
        "time",
      ]),
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
          toolUseInputs.set(message.id, message.input);
        }
        const isInternalWorkshopTool = isWorkshopTool(message.name);
        if (!isInternalWorkshopTool) {
          budgetedToolCallCount += 1;
          await appendWorkshopEvent({
            workshopId: input.workshop.id,
            runId: input.runId,
            type: "tool_call",
            title: message.name
              ? `调用工具：${workDisplayLabel(message.name)}`
              : "调用工具",
            body: compactToolInput(message.input),
            metadata: {
              toolName: message.name,
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
          const body = compactToolOutput(message.output, message.isError);
          const toolResultEvent = await appendWorkshopEvent({
            workshopId: input.workshop.id,
            runId: input.runId,
            type: message.isError ? "tool_error" : "tool_result",
            title: message.isError
              ? `工具失败：${workDisplayLabel(toolName ?? "通用工具")}`
              : `工具完成：${workDisplayLabel(toolName ?? "通用工具")}`,
            body,
            metadata: {
              toolUseId: message.toolUseId,
              toolName,
            },
          });

          if (!message.isError && isTraceableFallbackTool(toolName)) {
            const toolInput = message.toolUseId
              ? toolUseInputs.get(message.toolUseId)
              : undefined;
            await appendWorkshopEvent({
              workshopId: input.workshop.id,
              runId: input.runId,
              type: "source_checked",
              title: fallbackSourceTitle(toolName, toolInput),
              body:
                body ??
                "Generic tool returned data and was captured as a traceable source.",
              metadata: {
                provider: "agent-fallback-tool",
                toolName,
                toolUseId: message.toolUseId,
                toolInput: toolInput ? compact(toolInput, 1_000) : null,
                toolResultEventId: toolResultEvent.id,
                fallback: true,
                note: "Generic tools are allowed when they produce the best result; this event makes that result citable by memories and outbox drafts.",
              },
            });
          }
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
  const structured = extractJsonBlock(
    lastText,
  ) as WorkshopStructuredOutput | null;
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
