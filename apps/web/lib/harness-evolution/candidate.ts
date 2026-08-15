function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function applyHarnessJsonMergePatch(
  source: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...source };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
    } else if (isRecord(value)) {
      result[key] = applyHarnessJsonMergePatch(
        isRecord(result[key]) ? result[key] : {},
        value,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}
