export function normalizeHubId(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function buildHubspotInsightPayload() {
  return null;
}

export function buildGoogleDocInsight() {
  return null;
}

export function buildOutlookCalendarInsight() {
  return null;
}
