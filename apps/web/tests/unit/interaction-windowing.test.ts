import { describe, expect, it } from "vitest";
import { splitConversationWindows } from "@/lib/interactions/windowing";

describe("splitConversationWindows", () => {
  it("sorts messages and splits after a 30 minute gap", () => {
    const events = [
      { id: "late", messageTime: new Date("2026-01-01T11:00:00Z") },
      { id: "first", messageTime: new Date("2026-01-01T10:00:00Z") },
      { id: "same", messageTime: new Date("2026-01-01T10:20:00Z") },
    ];
    expect(
      splitConversationWindows(events).map((items) =>
        items.map((item) => item.id),
      ),
    ).toEqual([["first", "same"], ["late"]]);
  });
});
