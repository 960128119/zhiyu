export type QuantRuleOperator =
  | "<"
  | "<="
  | ">"
  | ">="
  | "=="
  | "between"
  | "outside";

export type QuantRuleInput = {
  id: string;
  symbol?: string;
  name?: string;
  metric: string;
  actual: number;
  operator: QuantRuleOperator;
  threshold?: number;
  lower?: number;
  upper?: number;
  ruleType?: string;
  source?: string;
};

export type QuantRuleResult = QuantRuleInput & {
  triggered: boolean;
  valid: boolean;
  status: "triggered" | "not_triggered" | "invalid";
  delta: number | null;
  deltaPct: number | null;
  comparisonText: string;
  error?: string;
};

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

function deltaPct(delta: number | null, base: number | undefined) {
  if (delta === null || !finiteNumber(base) || base === 0) return null;
  return Number(((delta / Math.abs(base)) * 100).toFixed(6));
}

export function evaluateQuantRule(rule: QuantRuleInput): QuantRuleResult {
  const invalid = (error: string): QuantRuleResult => ({
    ...rule,
    triggered: false,
    valid: false,
    status: "invalid",
    delta: null,
    deltaPct: null,
    comparisonText: error,
    error,
  });

  if (!finiteNumber(rule.actual)) {
    return invalid(`actual for ${rule.id} is not a finite number`);
  }

  if (rule.operator === "between" || rule.operator === "outside") {
    if (!finiteNumber(rule.lower) || !finiteNumber(rule.upper)) {
      return invalid(`${rule.operator} requires finite lower and upper`);
    }
    const low = Math.min(rule.lower, rule.upper);
    const high = Math.max(rule.lower, rule.upper);
    const inside = rule.actual >= low && rule.actual <= high;
    const triggered = rule.operator === "between" ? inside : !inside;
    const nearestDelta =
      rule.actual < low ? rule.actual - low : rule.actual > high ? rule.actual - high : 0;
    return {
      ...rule,
      lower: low,
      upper: high,
      triggered,
      valid: true,
      status: triggered ? "triggered" : "not_triggered",
      delta: Number(nearestDelta.toFixed(6)),
      deltaPct: deltaPct(nearestDelta, rule.actual < low ? low : high),
      comparisonText: `${formatNumber(rule.actual)} ${rule.operator} [${formatNumber(low)}, ${formatNumber(high)}] is ${triggered}`,
    };
  }

  if (!finiteNumber(rule.threshold)) {
    return invalid(`${rule.operator} requires a finite threshold`);
  }

  const threshold = rule.threshold;
  const triggered =
    rule.operator === "<"
      ? rule.actual < threshold
      : rule.operator === "<="
        ? rule.actual <= threshold
        : rule.operator === ">"
          ? rule.actual > threshold
          : rule.operator === ">="
            ? rule.actual >= threshold
            : rule.actual === threshold;
  const delta = Number((rule.actual - threshold).toFixed(6));

  return {
    ...rule,
    threshold,
    triggered,
    valid: true,
    status: triggered ? "triggered" : "not_triggered",
    delta,
    deltaPct: deltaPct(delta, threshold),
    comparisonText: `${formatNumber(rule.actual)} ${rule.operator} ${formatNumber(threshold)} is ${triggered}`,
  };
}

export function evaluateQuantRules(input: {
  asOf?: string;
  rules: QuantRuleInput[];
}) {
  const results = input.rules.map(evaluateQuantRule);
  return {
    ok: results.every((result) => result.valid),
    tool: "quantRuleEvaluate",
    asOf: input.asOf ?? new Date().toISOString(),
    summary: {
      total: results.length,
      triggered: results.filter((result) => result.status === "triggered").length,
      notTriggered: results.filter((result) => result.status === "not_triggered").length,
      invalid: results.filter((result) => result.status === "invalid").length,
    },
    results,
  };
}
