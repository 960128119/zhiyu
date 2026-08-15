import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deserializeJson, serializeJson } from "@/lib/db/serialization";
import {
  quantTrendStateSnapshots,
  type InsertQuantTrendStateSnapshot,
  type QuantTrendStateSnapshot,
} from "@/lib/db/schema";

type JsonRecord = Record<string, unknown>;

export type TrendStateSnapshotRow = {
  workshopId: string;
  runId?: string | null;
  loopId?: string | null;
  loopRunId?: string | null;
  sourceEventId?: string | null;
  code: string;
  name: string | null;
  tradeDate: string | null;
  benchmarkCode: string | null;
  lifecycleState: string;
  trendPhase: string | null;
  trendScore: number | null;
  rsRank: number | null;
  rsPercentile: number | null;
  rsScore: number | null;
  relativeReturn60d: number | null;
  trailingStop: number | null;
  hardStop: number | null;
  stopAction: string | null;
  controlAction: string | null;
  tradeAllowed: boolean;
  dataQualityStatus: string;
  snapshot: JsonRecord;
};

export type TrendStateSnapshotView = TrendStateSnapshotRow & {
  id: string;
  createdAt: Date;
};

export function extractTrendStateSnapshots(input: {
  workshopId: string;
  runId?: string | null;
  loopId?: string | null;
  loopRunId?: string | null;
  sourceEventId?: string | null;
  result: unknown;
}): TrendStateSnapshotRow[] {
  const result = asRecord(input.result);
  if (result.ok !== true) return [];
  if (result.action && result.action !== "trend_system") return [];

  const data = asRecord(result.data);
  const items = asRecordList(data.items);
  const benchmark = asRecord(data.benchmark);
  const fetchedAt = stringOrNull(result.fetchedAt);

  return items
    .map((item): TrendStateSnapshotRow | null => {
      const trend = asRecord(item.trend);
      const latest = asRecord(trend.latest);
      const rs = asRecord(item.relativeStrength);
      const stopEngine = asRecord(item.stopEngine);
      const controlSuggestion = asRecord(item.controlSuggestion);
      const dataQuality = asRecord(item.dataQuality);
      const code = stringOrNull(item.code);
      if (!code) return null;

      return {
        workshopId: input.workshopId,
        runId: input.runId ?? null,
        loopId: input.loopId ?? null,
        loopRunId: input.loopRunId ?? null,
        sourceEventId: input.sourceEventId ?? null,
        code,
        name: stringOrNull(trend.name),
        tradeDate: stringOrNull(latest.date) ?? fetchedAt?.slice(0, 10) ?? null,
        benchmarkCode: stringOrNull(benchmark.code),
        lifecycleState: stringOrNull(item.lifecycleState) ?? "unknown",
        trendPhase: stringOrNull(trend.phase),
        trendScore: numberOrNull(trend.trendScore),
        rsRank: integerOrNull(rs.rank),
        rsPercentile: numberOrNull(rs.percentile),
        rsScore: numberOrNull(rs.score),
        relativeReturn60d: numberOrNull(rs.relativeReturn60d),
        trailingStop: numberOrNull(stopEngine.trailingStop),
        hardStop: numberOrNull(stopEngine.hardStop),
        stopAction: stringOrNull(stopEngine.action),
        controlAction: stringOrNull(controlSuggestion.action),
        tradeAllowed: controlSuggestion.tradeAllowed === true,
        dataQualityStatus: stringOrNull(dataQuality.status) ?? "unknown",
        snapshot: {
          trend,
          relativeStrength: rs,
          lifecycleState: item.lifecycleState,
          stopEngine,
          controlSuggestion,
          position: item.position ?? null,
          dataQuality,
          warnings: Array.isArray(item.warnings) ? item.warnings : [],
          benchmark,
          sourceEventId: input.sourceEventId ?? null,
          fetchedAt: result.fetchedAt ?? null,
        },
      };
    })
    .filter((row): row is TrendStateSnapshotRow => row !== null);
}

export async function recordTrendStateSnapshots(input: {
  workshopId: string;
  runId?: string | null;
  loopId?: string | null;
  loopRunId?: string | null;
  sourceEventId?: string | null;
  result: unknown;
}) {
  const rows = extractTrendStateSnapshots(input);
  if (rows.length === 0) {
    return {
      inserted: 0,
      rows: [] as TrendStateSnapshotRow[],
      snapshots: [] as TrendStateSnapshotView[],
    };
  }

  const values = rows.map(toInsertRow);
  const inserted = await db
    .insert(quantTrendStateSnapshots)
    .values(values)
    .onConflictDoNothing()
    .returning();

  return {
    inserted: inserted.length,
    rows,
    snapshots: inserted.map((row: unknown) =>
      normalizeSnapshot(row as QuantTrendStateSnapshot),
    ),
  };
}

export async function listTrendStateSnapshots(input: {
  workshopId: string;
  codes?: string[];
  limit?: number;
}) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const normalizedCodes = Array.from(
    new Set((input.codes ?? []).map((code) => code.trim()).filter(Boolean)),
  );
  const where =
    normalizedCodes.length > 0
      ? and(
          eq(quantTrendStateSnapshots.workshopId, input.workshopId),
          inArray(quantTrendStateSnapshots.code, normalizedCodes),
        )
      : eq(quantTrendStateSnapshots.workshopId, input.workshopId);

  const rows = await db
    .select()
    .from(quantTrendStateSnapshots)
    .where(where)
    .orderBy(desc(quantTrendStateSnapshots.createdAt))
    .limit(limit);

  return rows.map((row: unknown) =>
    normalizeSnapshot(row as QuantTrendStateSnapshot),
  );
}

function toInsertRow(
  row: TrendStateSnapshotRow,
): InsertQuantTrendStateSnapshot {
  return {
    id: crypto.randomUUID(),
    workshopId: row.workshopId,
    runId: row.runId ?? null,
    loopId: row.loopId ?? null,
    loopRunId: row.loopRunId ?? null,
    sourceEventId: row.sourceEventId ?? null,
    code: row.code,
    name: row.name,
    tradeDate: row.tradeDate,
    benchmarkCode: row.benchmarkCode,
    lifecycleState: row.lifecycleState,
    trendPhase: row.trendPhase,
    trendScore: row.trendScore,
    rsRank: row.rsRank,
    rsPercentile: row.rsPercentile,
    rsScore: row.rsScore,
    relativeReturn60d: row.relativeReturn60d,
    trailingStop: row.trailingStop,
    hardStop: row.hardStop,
    stopAction: row.stopAction,
    controlAction: row.controlAction,
    tradeAllowed: row.tradeAllowed,
    dataQualityStatus: row.dataQualityStatus,
    snapshot: serializeJson(row.snapshot) as JsonRecord,
    createdAt: new Date(),
  } as InsertQuantTrendStateSnapshot;
}

function normalizeSnapshot(
  row: QuantTrendStateSnapshot,
): TrendStateSnapshotView {
  return {
    id: row.id,
    workshopId: row.workshopId,
    runId: row.runId,
    loopId: row.loopId,
    loopRunId: row.loopRunId,
    sourceEventId: row.sourceEventId,
    code: row.code,
    name: row.name,
    tradeDate: row.tradeDate,
    benchmarkCode: row.benchmarkCode,
    lifecycleState: row.lifecycleState,
    trendPhase: row.trendPhase,
    trendScore: numberOrNull(row.trendScore),
    rsRank: integerOrNull(row.rsRank),
    rsPercentile: numberOrNull(row.rsPercentile),
    rsScore: numberOrNull(row.rsScore),
    relativeReturn60d: numberOrNull(row.relativeReturn60d),
    trailingStop: numberOrNull(row.trailingStop),
    hardStop: numberOrNull(row.hardStop),
    stopAction: row.stopAction,
    controlAction: row.controlAction,
    tradeAllowed: row.tradeAllowed === true,
    dataQualityStatus: row.dataQualityStatus,
    snapshot: asRecord(deserializeJson(row.snapshot as never)),
    createdAt:
      row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
  };
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function asRecordList(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringOrNull(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value: unknown) {
  const number = numberOrNull(value);
  return number === null ? null : Math.trunc(number);
}
