import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deserializeJson, serializeJson } from "@/lib/db/serialization";
import {
  quantTrendStrategySamples,
  type InsertQuantTrendStrategySample,
  type QuantTrendStrategySample,
} from "@/lib/db/schema";
import type {
  QuantPaperAccount,
  QuantPaperFill,
  QuantPaperPosition,
} from "@/lib/quant/types";
import type { TrendStateSnapshotView } from "./trend-state-snapshots";

type JsonRecord = Record<string, unknown>;

export type TrendStrategyOutcomeStatus = "open" | "closed" | "watch_only";

export type TrendStrategySampleView = {
  id: string;
  workshopId: string;
  snapshotId: string;
  sourceEventId: string | null;
  code: string;
  name: string | null;
  tradeDate: string | null;
  lifecycleState: string;
  trendPhase: string | null;
  controlAction: string | null;
  observedPrice: number | null;
  observedAt: Date;
  evaluationAt: Date | null;
  latestPrice: number | null;
  returnPct: number | null;
  horizonDays: number;
  holdingQuantity: number;
  realizedPnl: number;
  outcomeStatus: TrendStrategyOutcomeStatus;
  exitReason: string | null;
  result: JsonRecord;
  createdAt: Date;
  updatedAt: Date;
};

export type TrendStrategyStats = {
  sampleSize: number;
  evaluableSize: number;
  avgReturnPct: number | null;
  winRatePct: number | null;
  openCount: number;
  closedCount: number;
  watchOnlyCount: number;
  byLifecycleState: Array<{
    lifecycleState: string;
    sampleSize: number;
    evaluableSize: number;
    avgReturnPct: number | null;
    winRatePct: number | null;
    openCount: number;
    closedCount: number;
    watchOnlyCount: number;
  }>;
};

export async function createTrendStrategySamplesFromSnapshots(input: {
  snapshots: TrendStateSnapshotView[];
}) {
  if (input.snapshots.length === 0) {
    return { inserted: 0 };
  }

  const values = input.snapshots.map(snapshotToInsertRow);
  const inserted = await db
    .insert(quantTrendStrategySamples)
    .values(values)
    .onConflictDoNothing()
    .returning();

  return { inserted: inserted.length };
}

export async function evaluateTrendStrategySamples(input: {
  workshopId: string;
  account: QuantPaperAccount;
  fills?: QuantPaperFill[];
  codes?: string[];
  limit?: number;
}) {
  const samples = await listTrendStrategySamples({
    workshopId: input.workshopId,
    codes: input.codes,
    limit: input.limit ?? 200,
  });
  const positionsByCode = new Map(
    input.account.positions.map((position) => [position.code, position]),
  );
  const fillsByCode = groupFillsByCode(input.fills ?? input.account.recent_fills);
  let updated = 0;

  for (const sample of samples) {
    const evaluation = evaluateSample(sample, {
      position: positionsByCode.get(sample.code) ?? null,
      fills: fillsByCode.get(sample.code) ?? [],
      accountUpdatedAt: input.account.updated_at,
    });
    if (!evaluation) continue;
    await db
      .update(quantTrendStrategySamples)
      .set({
        evaluationAt: evaluation.evaluationAt,
        latestPrice: evaluation.latestPrice,
        returnPct: evaluation.returnPct,
        horizonDays: evaluation.horizonDays,
        holdingQuantity: evaluation.holdingQuantity,
        realizedPnl: evaluation.realizedPnl,
        outcomeStatus: evaluation.outcomeStatus,
        exitReason: evaluation.exitReason,
        result: serializeJson(evaluation.result) as JsonRecord,
        updatedAt: new Date(),
      })
      .where(eq(quantTrendStrategySamples.id, sample.id));
    updated += 1;
  }

  const refreshed = await listTrendStrategySamples({
    workshopId: input.workshopId,
    codes: input.codes,
    limit: input.limit ?? 200,
  });
  return {
    evaluated: samples.length,
    updated,
    stats: summarizeTrendStrategySamples(refreshed),
    samples: refreshed,
  };
}

export async function listTrendStrategySamples(input: {
  workshopId: string;
  codes?: string[];
  lifecycleStates?: string[];
  limit?: number;
}) {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const codes = uniqueStrings(input.codes ?? []);
  const lifecycleStates = uniqueStrings(input.lifecycleStates ?? []);
  const conditions = [eq(quantTrendStrategySamples.workshopId, input.workshopId)];
  if (codes.length > 0) {
    conditions.push(inArray(quantTrendStrategySamples.code, codes));
  }
  if (lifecycleStates.length > 0) {
    conditions.push(
      inArray(quantTrendStrategySamples.lifecycleState, lifecycleStates),
    );
  }

  const rows = await db
    .select()
    .from(quantTrendStrategySamples)
    .where(and(...conditions))
    .orderBy(desc(quantTrendStrategySamples.observedAt))
    .limit(limit);

  return rows.map((row: unknown) =>
    normalizeSample(row as QuantTrendStrategySample),
  );
}

export function summarizeTrendStrategySamples(
  samples: TrendStrategySampleView[],
): TrendStrategyStats {
  const groups = new Map<string, TrendStrategySampleView[]>();
  for (const sample of samples) {
    groups.set(sample.lifecycleState, [
      ...(groups.get(sample.lifecycleState) ?? []),
      sample,
    ]);
  }
  return {
    ...summarizeGroup(samples),
    byLifecycleState: Array.from(groups.entries())
      .map(([lifecycleState, group]) => ({
        lifecycleState,
        ...summarizeGroup(group),
      }))
      .sort((a, b) => b.sampleSize - a.sampleSize),
  };
}

function snapshotToInsertRow(
  snapshot: TrendStateSnapshotView,
): InsertQuantTrendStrategySample {
  const trend = asRecord(snapshot.snapshot.trend);
  const latest = asRecord(trend.latest);
  const observedPrice = numberOrNull(latest.close);
  return {
    id: crypto.randomUUID(),
    workshopId: snapshot.workshopId,
    snapshotId: snapshot.id,
    sourceEventId: snapshot.sourceEventId,
    code: snapshot.code,
    name: snapshot.name,
    tradeDate: snapshot.tradeDate,
    lifecycleState: snapshot.lifecycleState,
    trendPhase: snapshot.trendPhase,
    controlAction: snapshot.controlAction,
    observedPrice,
    observedAt: snapshot.createdAt,
    evaluationAt: null,
    latestPrice: null,
    returnPct: null,
    horizonDays: 0,
    holdingQuantity: 0,
    realizedPnl: 0,
    outcomeStatus: "watch_only",
    exitReason: null,
    result: serializeJson({
      observedPrice,
      observedAt: snapshot.createdAt.toISOString(),
      dataQualityStatus: snapshot.dataQualityStatus,
      sourceEventId: snapshot.sourceEventId,
    }) as JsonRecord,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as InsertQuantTrendStrategySample;
}

function evaluateSample(
  sample: TrendStrategySampleView,
  input: {
    position: QuantPaperPosition | null;
    fills: QuantPaperFill[];
    accountUpdatedAt: string;
  },
) {
  const evaluationAt = safeDate(input.accountUpdatedAt) ?? new Date();
  const observedPrice = sample.observedPrice;
  const sellFills = input.fills.filter((fill) => {
    const filledAt = safeDate(fill.filled_at);
    return (
      fill.side === "sell" &&
      filledAt !== null &&
      filledAt >= sample.observedAt
    );
  });
  const latestSell = sellFills.at(0) ?? null;
  const holdingQuantity = input.position?.quantity ?? 0;
  const latestPrice =
    numberOrNull(input.position?.price) ?? numberOrNull(latestSell?.price);
  const returnPct =
    observedPrice && latestPrice
      ? Number((((latestPrice - observedPrice) / observedPrice) * 100).toFixed(2))
      : null;
  const realizedPnl = Number(
    sellFills
      .reduce((sum, fill) => sum + (numberOrNull(fill.realized_pnl) ?? 0), 0)
      .toFixed(2),
  );
  const outcomeStatus: TrendStrategyOutcomeStatus =
    holdingQuantity > 0 ? "open" : latestSell ? "closed" : "watch_only";
  const exitReason =
    outcomeStatus === "closed"
      ? latestSell?.note || "样本后出现卖出成交"
      : null;

  return {
    evaluationAt,
    latestPrice,
    returnPct,
    horizonDays: Math.max(
      0,
      Math.floor(
        (evaluationAt.getTime() - sample.observedAt.getTime()) /
          (24 * 60 * 60 * 1000),
      ),
    ),
    holdingQuantity,
    realizedPnl,
    outcomeStatus,
    exitReason,
    result: {
      accountUpdatedAt: input.accountUpdatedAt,
      observedPrice,
      latestPrice,
      returnPct,
      holdingQuantity,
      realizedPnl,
      sellFillIds: sellFills.map((fill) => fill.id),
    },
  };
}

function summarizeGroup(samples: TrendStrategySampleView[]) {
  const evaluable = samples.filter((sample) => sample.returnPct !== null);
  const wins = evaluable.filter((sample) => (sample.returnPct ?? 0) > 0);
  const avgReturnPct =
    evaluable.length > 0
      ? round2(
          evaluable.reduce((sum, sample) => sum + (sample.returnPct ?? 0), 0) /
            evaluable.length,
        )
      : null;
  return {
    sampleSize: samples.length,
    evaluableSize: evaluable.length,
    avgReturnPct,
    winRatePct:
      evaluable.length > 0 ? round2((wins.length / evaluable.length) * 100) : null,
    openCount: samples.filter((sample) => sample.outcomeStatus === "open")
      .length,
    closedCount: samples.filter((sample) => sample.outcomeStatus === "closed")
      .length,
    watchOnlyCount: samples.filter(
      (sample) => sample.outcomeStatus === "watch_only",
    ).length,
  };
}

function normalizeSample(
  row: QuantTrendStrategySample,
): TrendStrategySampleView {
  return {
    id: row.id,
    workshopId: row.workshopId,
    snapshotId: row.snapshotId,
    sourceEventId: row.sourceEventId,
    code: row.code,
    name: row.name,
    tradeDate: row.tradeDate,
    lifecycleState: row.lifecycleState,
    trendPhase: row.trendPhase,
    controlAction: row.controlAction,
    observedPrice: numberOrNull(row.observedPrice),
    observedAt:
      row.observedAt instanceof Date ? row.observedAt : new Date(row.observedAt),
    evaluationAt: row.evaluationAt
      ? row.evaluationAt instanceof Date
        ? row.evaluationAt
        : new Date(row.evaluationAt)
      : null,
    latestPrice: numberOrNull(row.latestPrice),
    returnPct: numberOrNull(row.returnPct),
    horizonDays: Math.max(0, Math.trunc(numberOrNull(row.horizonDays) ?? 0)),
    holdingQuantity: Math.max(
      0,
      Math.trunc(numberOrNull(row.holdingQuantity) ?? 0),
    ),
    realizedPnl: numberOrNull(row.realizedPnl) ?? 0,
    outcomeStatus: normalizeOutcomeStatus(row.outcomeStatus),
    exitReason: row.exitReason,
    result: asRecord(deserializeJson(row.result as never)),
    createdAt:
      row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
  };
}

function groupFillsByCode(fills: QuantPaperFill[]) {
  const sorted = [...fills].sort((a, b) =>
    String(b.filled_at).localeCompare(String(a.filled_at)),
  );
  const grouped = new Map<string, QuantPaperFill[]>();
  for (const fill of sorted) {
    grouped.set(fill.code, [...(grouped.get(fill.code) ?? []), fill]);
  }
  return grouped;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeOutcomeStatus(value: unknown): TrendStrategyOutcomeStatus {
  return value === "open" || value === "closed" || value === "watch_only"
    ? value
    : "watch_only";
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date : null;
}

function round2(value: number) {
  return Number(value.toFixed(2));
}
