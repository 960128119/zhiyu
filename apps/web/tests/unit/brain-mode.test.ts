import { afterEach, describe, expect, it } from "vitest";
import {
  getBrainMemoryMode,
  shouldPreferBrainMemory,
  shouldReadLegacyMemoryFallback,
} from "@/lib/brain/mode";

const originalMode = process.env.BRAIN_MEMORY_MODE;

describe("brain memory mode", () => {
  afterEach(() => {
    process.env.BRAIN_MEMORY_MODE = originalMode;
  });

  it("defaults to brain_first", () => {
    delete process.env.BRAIN_MEMORY_MODE;
    expect(getBrainMemoryMode()).toBe("brain_first");
    expect(shouldPreferBrainMemory()).toBe(true);
    expect(shouldReadLegacyMemoryFallback()).toBe(true);
  });

  it("disables legacy fallback in brain_only mode", () => {
    process.env.BRAIN_MEMORY_MODE = "brain_only";
    expect(getBrainMemoryMode()).toBe("brain_only");
    expect(shouldPreferBrainMemory()).toBe(true);
    expect(shouldReadLegacyMemoryFallback()).toBe(false);
  });

  it("allows legacy_first as a migration rollback mode", () => {
    process.env.BRAIN_MEMORY_MODE = "legacy_first";
    expect(getBrainMemoryMode()).toBe("legacy_first");
    expect(shouldPreferBrainMemory()).toBe(false);
    expect(shouldReadLegacyMemoryFallback()).toBe(true);
  });
});
