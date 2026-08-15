import { describe, expect, it } from "vitest";
import { isWorkHarnessEvolutionEnabled } from "@/lib/harness-evolution";

describe("work harness evolution feature flag", () => {
  it("is disabled when the flag is absent", () => {
    expect(isWorkHarnessEvolutionEnabled({})).toBe(false);
  });

  it.each(["true", "TRUE", "1", "yes", "on"])(
    "accepts %s as enabled",
    (value) => {
      expect(
        isWorkHarnessEvolutionEnabled({
          WORK_HARNESS_EVOLUTION_ENABLED: value,
        }),
      ).toBe(true);
    },
  );

  it.each(["false", "0", "off", "unexpected"])("keeps %s disabled", (value) => {
    expect(
      isWorkHarnessEvolutionEnabled({
        WORK_HARNESS_EVOLUTION_ENABLED: value,
      }),
    ).toBe(false);
  });
});
