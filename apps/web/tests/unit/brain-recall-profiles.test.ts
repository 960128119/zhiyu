import { describe, expect, it } from "vitest";
import { parseBrainRecallProfiles } from "@/lib/brain";

describe("brain recall profiles", () => {
  it("parses bounded work-scoped recall profiles", () => {
    const result = parseBrainRecallProfiles([
      {
        id: "paper-trading",
        matchTerms: ["stop-loss", "drawdown", "stop-loss"],
        memoryTypeBoosts: {
          insight: 80,
          plan: 30,
        },
      },
    ]);

    expect(result.issues).toEqual([]);
    expect(result.profiles).toEqual([
      {
        id: "paper-trading",
        matchTerms: ["stop-loss", "drawdown"],
        memoryTypeBoosts: {
          insight: 80,
          plan: 30,
        },
      },
    ]);
  });

  it("rejects malformed or unbounded profile configuration", () => {
    const result = parseBrainRecallProfiles([
      {
        id: "Trading Profile",
        matchTerms: ["x"],
        memoryTypeBoosts: {
          unknown: 20,
          insight: 999,
        },
      },
    ]);

    expect(result.profiles).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "invalid_id",
        "invalid_match_term",
        "invalid_memory_type",
        "invalid_boost",
      ]),
    );
  });

  it("treats absent configuration as no domain profile", () => {
    expect(parseBrainRecallProfiles(undefined)).toEqual({
      profiles: [],
      issues: [],
    });
  });
});
