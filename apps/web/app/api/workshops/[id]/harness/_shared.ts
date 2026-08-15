export function parseHarnessListLimit(
  value: string | null,
  fallback = 20,
  maximum = 100,
) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}
