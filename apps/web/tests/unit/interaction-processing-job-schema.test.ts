import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  interactionProcessingJobs as pgJobs,
} from "@/lib/db/schema.pg";
import {
  interactionProcessingJobs as sqliteJobs,
} from "@/lib/db/schema-sqlite";

describe("interaction processing job schema", () => {
  it("keeps PostgreSQL and SQLite job columns aligned", () => {
    expect(Object.keys(getTableColumns(pgJobs))).toEqual(
      Object.keys(getTableColumns(sqliteJobs)),
    );
  });
});
