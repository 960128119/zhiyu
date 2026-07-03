import {
  createSdkMcpServer,
  tool,
  type SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  addWorkshopMemory,
  appendWorkshopEvent,
  createOutboxDraft,
  listActiveDirectives,
  listWorkshopMemories,
  listWorkshopSources,
} from "./service";

const WEB_READ_TIMEOUT_MS = 15_000;
const WEB_READ_DEFAULT_MAX_CHARS = 12_000;

function jsonText(value: unknown) {
  return JSON.stringify(value, null, 2);
}

const WORKSHOP_EVENT_TYPES = new Set([
  "observation",
  "source_checked",
  "hypothesis",
  "decision",
  "plan",
  "blocked",
  "error",
]);

function cleanToolString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  let text = value.trim();
  const jsonTailIndex = text.search(/",\s*\n\s*"[a-zA-Z_]+":/);
  if (jsonTailIndex > 0) {
    text = text.slice(0, jsonTailIndex);
  }
  return text.replace(/^"+|"+$/g, "").trim() || fallback;
}

function cleanEventType(value: unknown) {
  const type = cleanToolString(value, "observation")
    .toLowerCase()
    .replace(/[^a-z0-9_:-]/g, "_");
  return WORKSHOP_EVENT_TYPES.has(type) ? type : "observation";
}

function truncateText(value: string, maxChars: number) {
  return value.length > maxChars
    ? `${value.slice(0, maxChars)}\n\n[truncated]`
    : value;
}

function safeHost(url: URL) {
  return url.hostname.toLowerCase();
}

function assertReadableWebUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("webReadPage only supports http and https URLs.");
  }

  const host = safeHost(url);
  const blocked =
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

  if (blocked) {
    throw new Error("webReadPage refuses local or private-network URLs.");
  }

  return url;
}

function normalizeCharset(value: string | null | undefined) {
  const charset = value?.trim().replace(/^["']|["']$/g, "").toLowerCase();
  if (!charset) return null;
  if (["utf8", "utf-8", "unicode-1-1-utf-8"].includes(charset)) {
    return "utf-8";
  }
  if (["gb2312", "gbk", "gb18030"].includes(charset)) return "gb18030";
  if (charset === "big5") return "big5";
  return charset;
}

function detectCharset(headers: Headers, buffer: ArrayBuffer) {
  const contentType = headers.get("content-type") ?? "";
  const headerMatch = contentType.match(/charset=([^;]+)/i);
  if (headerMatch?.[1]) return normalizeCharset(headerMatch[1]);

  const head = new TextDecoder("latin1").decode(buffer.slice(0, 4096));
  const metaMatch =
    head.match(/<meta[^>]+charset=["']?([^"'>\s/]+)/i) ??
    head.match(/<meta[^>]+content=["'][^"']*charset=([^"'>\s;]+)/i);
  return normalizeCharset(metaMatch?.[1]);
}

function mojibakeScore(text: string) {
  const replacementChars = (text.match(/\uFFFD/g) ?? []).length;
  const suspicious = (text.match(/[ÃÂ�]|鏂|鎵|涓|锛|銆|鐨|鍙/g) ?? [])
    .length;
  const questionRuns = (text.match(/\?{3,}/g) ?? []).length;
  return replacementChars * 3 + suspicious * 2 + questionRuns * 5;
}

function decodeWebBuffer(buffer: ArrayBuffer, charset: string | null) {
  const candidates = [charset, "utf-8", "gb18030"].filter(
    (value, index, values): value is string =>
      Boolean(value) && values.indexOf(value) === index,
  );

  let best = "";
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    try {
      const decoded = new TextDecoder(candidate, { fatal: false }).decode(buffer);
      const score = mojibakeScore(decoded);
      if (score < bestScore) {
        best = decoded;
        bestScore = score;
      }
    } catch {
      // Ignore unsupported charset labels and try the next candidate.
    }
  }

  return best || new TextDecoder().decode(buffer);
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return null;
  return match[1].replace(/\s+/g, " ").trim() || null;
}

function removeHtmlNoise(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "");
}

function cleanReadableText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function assessReadQuality(content: string) {
  const warnings: string[] = [];
  let qualityScore = 100;
  const trimmedLength = content.trim().length;
  const mojibake = mojibakeScore(content);

  if (trimmedLength < 800) {
    qualityScore -= 35;
    warnings.push("content_too_short");
  }
  if (mojibake > 10) {
    qualityScore -= Math.min(45, mojibake);
    warnings.push("possible_encoding_damage");
  }
  if ((content.match(/\n/g) ?? []).length < 3 && trimmedLength > 1000) {
    qualityScore -= 15;
    warnings.push("poor_structure");
  }

  return {
    qualityScore: Math.max(0, Math.min(100, qualityScore)),
    warnings,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEB_READ_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function htmlToMarkdown(html: string) {
  const module = await import("turndown");
  const TurndownService = module.default;
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  return cleanReadableText(turndown.turndown(removeHtmlNoise(html)));
}

function parseJinaTitle(content: string) {
  const title = content.match(/^Title:\s*(.+)$/im)?.[1]?.trim();
  return title || null;
}

async function readDirectPage(url: URL, maxChars: number) {
  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; ZhiyuWorkshop/1.0; +https://github.com/openzhiyu)",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.7",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Direct fetch failed with HTTP ${response.status}.`);
  }

  const buffer = await response.arrayBuffer();
  const charset = detectCharset(response.headers, buffer);
  const html = decodeWebBuffer(buffer, charset);
  const contentType = response.headers.get("content-type") ?? "";
  const isHtml = /html|xml/i.test(contentType) || /<html[\s>]/i.test(html);
  const content = isHtml ? await htmlToMarkdown(html) : cleanReadableText(html);
  const quality = assessReadQuality(content);
  const finalUrl = response.url || url.toString();

  return {
    url: url.toString(),
    finalUrl,
    site: safeHost(new URL(finalUrl)),
    title: extractTitle(html),
    method: "direct_fetch",
    content: truncateText(content, maxChars),
    qualityScore: quality.qualityScore,
    warnings: quality.warnings,
    fetchedAt: new Date().toISOString(),
  };
}

async function readJinaPage(url: URL, maxChars: number) {
  const readerUrl = `https://r.jina.ai/${url.toString()}`;
  const headers: Record<string, string> = {
    accept: "text/plain",
    "user-agent": "ZhiyuWorkshop/1.0",
  };
  const apiKey = process.env.JINA_API_KEY?.trim();
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const response = await fetchWithTimeout(readerUrl, {
    headers,
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Jina Reader failed with HTTP ${response.status}.`);
  }

  const raw = cleanReadableText(await response.text());
  const quality = assessReadQuality(raw);
  return {
    url: url.toString(),
    finalUrl: url.toString(),
    site: safeHost(url),
    title: parseJinaTitle(raw),
    method: "jina_reader",
    content: truncateText(raw, maxChars),
    qualityScore: quality.qualityScore,
    warnings: quality.warnings,
    fetchedAt: new Date().toISOString(),
  };
}

export function createWorkshopMcpServer(input: {
  workshopId: string;
  runId: string;
}) {
  const tools: SdkMcpToolDefinition<any>[] = [
    tool(
      "workshopLogEvent",
      [
        "Write a concise user-visible event to the current workshop log.",
        "Use this during the run when you inspect a source, make an observation, form a hypothesis, decide not to notify, or become blocked.",
        "Do not include hidden chain-of-thought. Write only a clear summary the owner can read.",
      ].join("\n"),
      {
        type: z
          .string()
          .min(1)
          .default("observation")
          .describe(
            "Event type such as observation, source_checked, hypothesis, decision, plan, blocked.",
          ),
        title: z.string().min(1).describe("Short event title."),
        body: z.string().optional().describe("User-visible event details."),
        metadata: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Small structured metadata object."),
      },
      async ({ type, title, body, metadata }) => {
        const event = await appendWorkshopEvent({
          workshopId: input.workshopId,
          runId: input.runId,
          type: cleanEventType(type),
          title: cleanToolString(title, "车间观察"),
          body: body ? cleanToolString(body) : null,
          metadata: metadata ?? {},
        });
        return {
          content: [{ type: "text" as const, text: jsonText({ event }) }],
          data: event,
        };
      },
    ),
    tool(
      "webReadPage",
      [
        "Read a public web page into clean Markdown/text for workshop analysis.",
        "Use this when WebFetch returns garbled, damaged, dynamic, or hard-to-read page content.",
        "The tool tries direct fetch with charset repair first and can fall back to Jina Reader.",
      ].join("\n"),
      {
        url: z.string().url().describe("Public http(s) page URL to read."),
        maxChars: z.coerce
          .number()
          .int()
          .min(1_000)
          .max(30_000)
          .default(WEB_READ_DEFAULT_MAX_CHARS)
          .describe("Maximum characters of readable content to return."),
        preferReader: z
          .boolean()
          .default(false)
          .describe("Use Jina Reader first instead of direct fetch."),
      },
      async ({ url, maxChars, preferReader }) => {
        const parsedUrl = assertReadableWebUrl(url);
        const errors: string[] = [];
        let page:
          | Awaited<ReturnType<typeof readDirectPage>>
          | Awaited<ReturnType<typeof readJinaPage>>;

        if (preferReader) {
          try {
            page = await readJinaPage(parsedUrl, maxChars);
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
            page = await readDirectPage(parsedUrl, maxChars);
          }
        } else {
          try {
            page = await readDirectPage(parsedUrl, maxChars);
            if (page.qualityScore < 55 || page.content.length < 800) {
              try {
                const readerPage = await readJinaPage(parsedUrl, maxChars);
                if (readerPage.qualityScore >= page.qualityScore) {
                  page = readerPage;
                }
              } catch (error) {
                errors.push(
                  error instanceof Error ? error.message : String(error),
                );
              }
            }
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
            page = await readJinaPage(parsedUrl, maxChars);
          }
        }

        const event = await appendWorkshopEvent({
          workshopId: input.workshopId,
          runId: input.runId,
          type: "source_checked",
          title: page.title ? `读取网页：${page.title}` : `读取网页：${page.site}`,
          body: `${page.method} ${page.url}，质量 ${page.qualityScore}/100`,
          metadata: {
            url: page.url,
            finalUrl: page.finalUrl,
            site: page.site,
            method: page.method,
            qualityScore: page.qualityScore,
            warnings: page.warnings,
            fallbackErrors: errors,
          },
        });

        const result = {
          ...page,
          fallbackErrors: errors,
          sourceEventId: event.id,
        };
        return {
          content: [{ type: "text" as const, text: jsonText(result) }],
          data: result,
        };
      },
    ),
    tool(
      "workshopListSources",
      "List sources that the owner has made available to this workshop.",
      {},
      async () => {
        const sources = await listWorkshopSources(input.workshopId, 100);
        return {
          content: [{ type: "text" as const, text: jsonText({ sources }) }],
          data: { sources },
        };
      },
    ),
    tool(
      "workshopGetDirectives",
      "Read active mid-run or persistent owner directions for this workshop.",
      {},
      async () => {
        const directives = await listActiveDirectives(input.workshopId, 50);
        return {
          content: [{ type: "text" as const, text: jsonText({ directives }) }],
          data: { directives },
        };
      },
    ),
    tool(
      "workshopReadMemory",
      "Read recent durable memories for this workshop.",
      {
        limit: z.coerce.number().int().min(1).max(50).default(20),
      },
      async ({ limit }) => {
        const memories = await listWorkshopMemories(input.workshopId, limit);
        return {
          content: [{ type: "text" as const, text: jsonText({ memories }) }],
          data: { memories },
        };
      },
    ),
    tool(
      "workshopWriteMemory",
      [
        "Persist a durable memory for this workshop.",
        "Use this only for facts, preferences, boundaries, findings, hypotheses, or mistakes likely to matter in future runs.",
        "Do not store every transient log line.",
      ].join("\n"),
      {
        kind: z
          .enum([
            "finding",
            "hypothesis",
            "watchlist",
            "preference",
            "boundary",
            "source_note",
            "mistake",
            "outbox_summary",
          ])
          .default("finding"),
        content: z.string().min(1),
        confidence: z.coerce.number().min(0).max(100).default(50),
        tags: z.array(z.string()).default([]),
        sourceEventIds: z.array(z.string()).default([]),
      },
      async ({ kind, content, confidence, tags, sourceEventIds }) => {
        const memory = await addWorkshopMemory({
          workshopId: input.workshopId,
          kind,
          content,
          confidence,
          tags,
          sourceEventIds,
        });
        return {
          content: [{ type: "text" as const, text: jsonText({ memory }) }],
          data: { memory },
        };
      },
    ),
    tool(
      "workshopCreateOutboxDraft",
      [
        "Create an outbound message draft for this workshop.",
        "This never sends anything. It only writes a draft for boundary review and user confirmation.",
        "For market or financial alerts, include source context, confidence, and opposing risk in the message.",
      ].join("\n"),
      {
        channel: z.literal("wechat_desktop").default("wechat_desktop"),
        recipientName: z.string().optional(),
        message: z.string().min(1),
        confidence: z.coerce.number().min(0).max(100).default(50),
        riskLevel: z.enum(["low", "medium", "high"]).default("medium"),
        sourceEventIds: z.array(z.string()).default([]),
        boundaryResult: z.record(z.string(), z.unknown()).default({}),
      },
      async ({
        channel,
        recipientName,
        message,
        confidence,
        riskLevel,
        sourceEventIds,
        boundaryResult,
      }) => {
        const outbox = await createOutboxDraft({
          workshopId: input.workshopId,
          runId: input.runId,
          channel,
          recipientName: recipientName ?? null,
          message,
          confidence,
          riskLevel,
          sourceEventIds,
          boundaryResult: {
            status: "draft_only",
            reason: "Workshop MCP tool creates drafts only.",
            ...boundaryResult,
          },
        });
        return {
          content: [{ type: "text" as const, text: jsonText({ outbox }) }],
          data: { outbox },
        };
      },
    ),
  ];

  return createSdkMcpServer({
    name: "workshop-tools",
    version: "1.0.0",
    tools,
  });
}
