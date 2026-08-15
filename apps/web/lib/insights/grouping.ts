export function normalizeMessagesInput(input: unknown): unknown[] {
  return Array.isArray(input) ? input : input == null ? [] : [input];
}

export function groupMessagesByChannel() {
  return new Map<string, unknown[]>();
}

export function filterInsightsByGroup<T>(insights: T[]): T[] {
  return insights;
}

export function mergeIMessageMessagesBySender<T>(messages: T[]): T[] {
  return messages;
}

export function estimateTokensForMessages(messages: unknown[]): number {
  return JSON.stringify(messages ?? []).length / 4;
}
