export type ExtractEmailInfo = Record<string, any>;

export function buildEmailDetailContent(email: ExtractEmailInfo) {
  return String(email.content ?? email.text ?? email.body ?? "");
}

export function formatEmailAddresses(value: any): string {
  if (Array.isArray(value)) return value.map((item) => item?.email ?? item?.name ?? String(item)).join(", ");
  if (typeof value === "string") return value;
  return "";
}

export function collectEmailParticipants(_email: ExtractEmailInfo): string[] {
  return [];
}

export function truncateSubject(subject: string, maxLength = 30): string {
  return subject.length > maxLength
    ? `${subject.slice(0, maxLength)}...`
    : subject;
}

export function buildMergedEmailDescription() {
  return "";
}

export function buildEmailInsightPayload() {
  return null;
}

export function groupEmailsBySender() {
  return new Map<string, ExtractEmailInfo[]>();
}

export function extractHistoricalEmailsBySender() {
  return [];
}

export function buildMergedEmailInsightPayload() {
  return null;
}
