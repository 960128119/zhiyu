const A_SHARE_TIMEZONE = "Asia/Shanghai";

type ClosedRange = {
  start: string;
  end: string;
  reason: string;
};

export type AShareTradingDayDecision = {
  isTradingDay: boolean;
  date: string;
  reason: string;
  source: string;
};

const SSE_2026_CLOSED_RANGES: ClosedRange[] = [
  { start: "2026-01-01", end: "2026-01-03", reason: "元旦休市" },
  { start: "2026-02-15", end: "2026-02-23", reason: "春节休市" },
  { start: "2026-04-04", end: "2026-04-06", reason: "清明节休市" },
  { start: "2026-05-01", end: "2026-05-05", reason: "劳动节休市" },
  { start: "2026-06-19", end: "2026-06-21", reason: "端午节休市" },
  { start: "2026-09-25", end: "2026-09-27", reason: "中秋节休市" },
  { start: "2026-10-01", end: "2026-10-07", reason: "国庆节休市" },
];

const CLOSED_RANGES_BY_YEAR: Record<number, ClosedRange[]> = {
  2026: SSE_2026_CLOSED_RANGES,
};

const OFFICIAL_SOURCE_BY_YEAR: Record<number, string> = {
  2026: "上海证券交易所 2026 年部分节假日休市安排",
};

function shanghaiDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: A_SHARE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    year: Number(get("year")),
    weekday: get("weekday"),
  };
}

function isWeekend(weekday: string) {
  return weekday === "Sat" || weekday === "Sun";
}

function inClosedRange(date: string, ranges: ClosedRange[]) {
  return ranges.find((range) => range.start <= date && date <= range.end);
}

export function isAShareTradingDay(
  date: Date = new Date(),
): AShareTradingDayDecision {
  const parts = shanghaiDateParts(date);
  const ranges = CLOSED_RANGES_BY_YEAR[parts.year] ?? [];
  const source =
    OFFICIAL_SOURCE_BY_YEAR[parts.year] ??
    "weekday fallback; official exchange holiday calendar not configured";

  if (isWeekend(parts.weekday)) {
    return {
      isTradingDay: false,
      date: parts.date,
      reason: "周末休市",
      source,
    };
  }

  const closed = inClosedRange(parts.date, ranges);
  if (closed) {
    return {
      isTradingDay: false,
      date: parts.date,
      reason: closed.reason,
      source,
    };
  }

  return {
    isTradingDay: true,
    date: parts.date,
    reason: ranges.length > 0 ? "交易日" : "按工作日兜底判断为交易日",
    source,
  };
}

export function getAShareTradingCalendarSource(year: number) {
  return OFFICIAL_SOURCE_BY_YEAR[year] ?? null;
}
