import { describe, expect, it } from "vitest";
import { loadSkills } from "@/lib/ai/skills/loader";

describe("skills loader", () => {
  it("parses unquoted YAML frontmatter skill names from repository skills", () => {
    const skills = loadSkills();
    const names = skills.map((skill) => skill.name);

    expect(names).toContain("watchlist-selection-control");
    expect(names).toContain("paper-trading-pre-market-plan");
  });
});
