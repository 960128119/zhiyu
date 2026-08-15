import { describe, expect, it } from "vitest";
import {
  clearAIUserContext,
  getAIUserContext,
  setAIUserContext,
  type AIUserContext,
} from "@openzhiyu/ai/agent/model";

function context(id: string): AIUserContext {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    type: "regular",
  };
}

async function observeContextAfterYield(
  value: AIUserContext,
  release: Promise<void>,
) {
  setAIUserContext(value);
  await release;
  const observed = getAIUserContext();
  clearAIUserContext();
  return observed;
}

describe("AI user context isolation", () => {
  it("keeps concurrent asynchronous request chains isolated", async () => {
    clearAIUserContext();
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });

    const first = observeContextAfterYield(context("user-a"), firstGate);
    const second = observeContextAfterYield(context("user-b"), secondGate);
    releaseSecond();
    releaseFirst();

    const [firstObserved, secondObserved] = await Promise.all([first, second]);
    expect(firstObserved?.id).toBe("user-a");
    expect(secondObserved?.id).toBe("user-b");
    clearAIUserContext();
  });
});
