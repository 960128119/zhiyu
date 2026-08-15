import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAppDataDir, getAppDataSubPath, joinPath } from "@/lib/utils/path";
import { expandHomePath } from "@/lib/env/config/constants";

describe("runtime path helpers", () => {
  it("uses one cross-platform application data root", () => {
    expect(getAppDataDir()).toBe(join(homedir(), ".openzhiyu"));
    expect(getAppDataSubPath("sessions", "work-1")).toBe(
      join(homedir(), ".openzhiyu", "sessions", "work-1"),
    );
  });

  it("joins runtime path segments without changing path semantics", () => {
    expect(joinPath("root", "nested", "file.txt")).toBe(
      join("root", "nested", "file.txt"),
    );
  });

  it("expands only home-relative paths", () => {
    expect(expandHomePath("~")).toBe(homedir());
    expect(expandHomePath("~/workspace")).toBe(join(homedir(), "workspace"));
    expect(expandHomePath("C:\\workspace")).toBe("C:\\workspace");
  });
});
