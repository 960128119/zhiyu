import type {
  QuantDashboard,
  QuantMarketCandidatesResponse,
} from "@/lib/quant/types";

function lowerText(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function includesUnsafeSource(value: string): boolean {
  return (
    value.includes("fallback") ||
    value.includes("sample") ||
    value.includes("mock") ||
    value.includes("default") ||
    value.includes("local_theme_seed")
  );
}

export function assertQuantDashboardUsableForControl(
  dashboard: QuantDashboard,
  controlName = "Quant control",
) {
  if (dashboard.service_mode !== "live") {
    const detail =
      dashboard.provider_error ??
      dashboard.data_source_detail ??
      dashboard.watchlist_source ??
      "live quant observations unavailable";
    throw new Error(
      `${controlName} blocked: quant dashboard is not live (${detail}).`,
    );
  }
  if (dashboard.watchlist_source === "configured_unavailable") {
    throw new Error(
      `${controlName} blocked: configured watchlist quotes are unavailable.`,
    );
  }
}

export function assertQuantCandidatesUsableForControl(
  candidates: QuantMarketCandidatesResponse,
  controlName = "Candidate pool persistence",
) {
  const provider = lowerText(candidates.provider);
  const detail = lowerText(candidates.data_source_detail);
  const conceptSourceText = (candidates.concept_sources ?? [])
    .map((source) => Object.values(source).map(lowerText).join(" "))
    .join(" ");

  if (
    includesUnsafeSource(provider) ||
    includesUnsafeSource(detail) ||
    includesUnsafeSource(conceptSourceText)
  ) {
    const sourceDetail =
      candidates.data_source_detail ??
      candidates.provider ??
      "degraded market candidate source";
    throw new Error(
      `${controlName} blocked: market candidates were produced from degraded data (${sourceDetail}).`,
    );
  }
}
