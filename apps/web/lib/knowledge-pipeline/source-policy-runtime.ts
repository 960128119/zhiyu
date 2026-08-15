import type { InteractionEvent } from "@/lib/db/schema";
import type { InteractionSourcePolicyValue } from "./source-policies";

export type InteractionProcessingMode = "full" | "summary_only";

const MENTION_FLAG_KEYS = [
  "atMe",
  "isAtMe",
  "is_at_me",
  "mentionedMe",
  "isMentioned",
  "mentionMe",
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isTruthyFlag(value: unknown) {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  return ["true", "1", "yes"].includes(value.trim().toLowerCase());
}

function sourceMarksExplicitMention(sourceRaw: unknown) {
  const raw = asRecord(sourceRaw);
  const nested = [raw, asRecord(raw.meta), asRecord(raw.metadata)];
  return nested.some((record) =>
    MENTION_FLAG_KEYS.some((key) => isTruthyFlag(record[key])),
  );
}

function contentMentionsAlias(content: string, aliases: string[]) {
  const normalizedContent = content.normalize("NFKC").toLocaleLowerCase();
  return aliases.some((alias) => {
    const normalizedAlias = alias
      .normalize("NFKC")
      .trim()
      .replace(/^@+/, "")
      .toLocaleLowerCase();
    return normalizedAlias.length > 0 && normalizedContent.includes(`@${normalizedAlias}`);
  });
}

export function isInteractionEventAllowedBySourcePolicy(input: {
  policy: InteractionSourcePolicyValue;
  event: Pick<InteractionEvent, "content" | "contentPreview" | "sourceRaw">;
  mentionAliases?: string[];
}) {
  if (input.policy === "ignore") return false;
  if (input.policy !== "mention_only") return true;
  return (
    sourceMarksExplicitMention(input.event.sourceRaw) ||
    contentMentionsAlias(
      input.event.content || input.event.contentPreview,
      input.mentionAliases ?? [],
    )
  );
}

export function processingModeForSourcePolicy(
  policy: InteractionSourcePolicyValue,
) {
  return policy === "summary" ? ("summary_only" as const) : ("full" as const);
}

export function applyInteractionProcessingMode<
  T extends { tasks: unknown[]; memories: unknown[] },
>(plan: T, mode: InteractionProcessingMode): T {
  if (mode === "full") return plan;
  return {
    ...plan,
    tasks: [],
    memories: [],
  };
}

export function sourcePolicyMentionAliases(input: {
  userName?: string | null;
  displayName?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const configured = input.metadata?.mentionAliases;
  const aliases = [
    input.userName,
    input.displayName,
    ...(Array.isArray(configured) ? configured : []),
  ];
  return [
    ...new Set(
      aliases
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}
