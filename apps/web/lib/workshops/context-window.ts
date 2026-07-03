import type {
  Workshop,
  WorkshopDirective,
  WorkshopEvent,
  WorkshopMemory,
  WorkshopOutboxItem,
  WorkshopSource,
} from "@/lib/db/schema";

const MAX_TEXT = 24_000;

function truncate(value: string, max = 1_200) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function eventLine(event: WorkshopEvent) {
  const body = event.body ? ` - ${truncate(event.body, 300)}` : "";
  return `#${event.seq} ${event.type}: ${event.title}${body}`;
}

function sourceLine(source: WorkshopSource) {
  const ref = source.uri ?? source.content ?? "";
  return `- [${source.type}] ${source.name}${ref ? `: ${truncate(ref, 500)}` : ""}`;
}

function memoryLine(memory: WorkshopMemory) {
  const tags = Array.isArray(memory.tags) && memory.tags.length > 0
    ? ` tags=${memory.tags.join(",")}`
    : "";
  return `- [${memory.kind}, ${memory.confidence}%${tags}] ${truncate(memory.content, 700)}`;
}

function directiveLine(directive: WorkshopDirective) {
  return `- (${directive.scope}, priority=${directive.priority}) ${truncate(directive.content, 800)}`;
}

function outboxLine(item: WorkshopOutboxItem) {
  return `- [${item.status}, ${item.riskLevel}, ${item.confidence}%] ${truncate(item.message, 500)}`;
}

export function buildWorkshopPrompt(input: {
  workshop: Workshop;
  sources: WorkshopSource[];
  memories: WorkshopMemory[];
  directives: WorkshopDirective[];
  events: WorkshopEvent[];
  outbox: WorkshopOutboxItem[];
  maxToolCalls: number;
}) {
  const prompt = [
    "You are working inside an open-ended Work Workshop.",
    "",
    "Core behavior:",
    "- Explore autonomously within the workshop mission.",
    "- Decide what to inspect next, but keep the run bounded and useful.",
    "- Use available memory/search/knowledge tools when useful.",
    "- Use webReadPage for finance/news/company pages, old pages, or any web page where WebFetch returns garbled or incomplete content.",
    "- Use workshopLogEvent during the run to make your work visible.",
    "- Use workshopReadMemory/workshopWriteMemory for durable workshop memory.",
    "- Use workshopListSources and workshopGetDirectives when you need the latest workshop inputs.",
    "- Do not send external messages. If something is worth notifying the owner about, use workshopCreateOutboxDraft. It only creates a draft.",
    "- Do not provide trading instructions. For market analysis, include confidence, sources, and opposing risks.",
    "- Do not reveal hidden reasoning. Logs should be concise user-visible summaries.",
    "",
    `Workshop: ${input.workshop.name}`,
    `Autonomy level: ${input.workshop.autonomyLevel}`,
    `Mission: ${input.workshop.mission}`,
    `Max tool calls for this run: ${input.maxToolCalls}`,
    "",
    "Current sources:",
    input.sources.length > 0
      ? input.sources.map(sourceLine).join("\n")
      : "- No explicit sources yet.",
    "",
    "Active user directives:",
    input.directives.length > 0
      ? input.directives.map(directiveLine).join("\n")
      : "- No active directives.",
    "",
    "Durable workshop memory:",
    input.memories.length > 0
      ? input.memories.map(memoryLine).join("\n")
      : "- No durable workshop memory yet.",
    "",
    "Recent events:",
    input.events.length > 0
      ? input.events.slice(-30).map(eventLine).join("\n")
      : "- No prior events.",
    "",
    "Recent outbox:",
    input.outbox.length > 0
      ? input.outbox.slice(0, 10).map(outboxLine).join("\n")
      : "- No recent outbox drafts.",
    "",
    "At the end, return a compact strict JSON summary inside a single ```json fenced block with this shape. If you already wrote logs/memories/outbox via tools, avoid duplicating them here:",
    JSON.stringify(
      {
        summary: "short run summary for the owner",
        logEvents: [
          {
            type: "observation|source_checked|hypothesis|decision|plan|blocked",
            title: "short title",
            body: "what happened, user-visible, no hidden reasoning",
            metadata: {},
          },
        ],
        memoryCandidates: [
          {
            kind: "finding|hypothesis|watchlist|preference|boundary|source_note|mistake|outbox_summary",
            content: "durable memory worth retaining",
            confidence: 0,
            tags: ["optional"],
          },
        ],
        outboxDrafts: [
          {
            channel: "wechat_desktop",
            recipientName: "optional exact recipient",
            message: "draft message, do not send",
            confidence: 0,
            riskLevel: "low|medium|high",
            sourceEventIds: [],
          },
        ],
        nextWakeupSuggestion: {
          reason: "why to wake up again",
          delayMinutes: 0,
        },
      },
      null,
      2,
    ),
  ].join("\n");

  return prompt.length > MAX_TEXT
    ? `${prompt.slice(0, MAX_TEXT)}\n\n[Context truncated to fit workshop run budget.]`
    : prompt;
}

export function extractJsonBlock(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
