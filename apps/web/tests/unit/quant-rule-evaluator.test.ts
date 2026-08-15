import { describe, expect, it } from "vitest";
import { evaluateQuantRules } from "@/lib/quant/rule-evaluator";

describe("quant rule evaluator", () => {
  it("does not trigger an invalidation rule when actual is above the invalid line", () => {
    const result = evaluateQuantRules({
      asOf: "2026-08-14T09:35:00+08:00",
      rules: [
        {
          id: "000977_buy_invalid_line",
          symbol: "000977",
          name: "Inspur",
          metric: "lastPrice",
          actual: 77.66,
          operator: "<",
          threshold: 77.61,
          ruleType: "plan_invalid",
        },
      ],
    });

    expect(result.results[0]).toMatchObject({
      triggered: false,
      valid: true,
      status: "not_triggered",
      delta: 0.05,
      comparisonText: "77.66 < 77.61 is false",
    });
  });

  it("evaluates mixed batch rules with stable rule ids", () => {
    const result = evaluateQuantRules({
      rules: [
        {
          id: "stop_loss",
          metric: "lastPrice",
          actual: 35.4,
          operator: "<=",
          threshold: 35.816,
        },
        {
          id: "cash_guard",
          metric: "cashPct",
          actual: 61.4,
          operator: ">=",
          threshold: 20,
        },
        {
          id: "range_check",
          metric: "positionPct",
          actual: 12,
          operator: "between",
          lower: 8,
          upper: 15,
        },
      ],
    });

    expect(result.summary).toEqual({
      total: 3,
      triggered: 3,
      notTriggered: 0,
      invalid: 0,
    });
    expect(result.results.map((item) => item.id)).toEqual([
      "stop_loss",
      "cash_guard",
      "range_check",
    ]);
  });
});
