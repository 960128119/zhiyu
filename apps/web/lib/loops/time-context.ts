export interface LoopCurrentTimeContext {
  timezone: string;
  utcIso: string;
  localDate: string;
  localTime: string;
  weekday: string;
  localDateWithWeekday: string;
}

function partValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function buildLoopCurrentTimeContext(input: {
  now?: Date;
  timezone?: string | null;
}): LoopCurrentTimeContext {
  const now = input.now ?? new Date();
  const timezone = input.timezone?.trim() || "Asia/Shanghai";
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const year = partValue(dateParts, "year");
  const month = partValue(dateParts, "month");
  const day = partValue(dateParts, "day");
  const hour = partValue(dateParts, "hour");
  const minute = partValue(dateParts, "minute");
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    weekday: "short",
  }).format(now);
  const localDate = `${year}-${month}-${day}`;

  return {
    timezone,
    utcIso: now.toISOString(),
    localDate,
    localTime: `${hour}:${minute}`,
    weekday,
    localDateWithWeekday: `${localDate}（${weekday}）`,
  };
}
