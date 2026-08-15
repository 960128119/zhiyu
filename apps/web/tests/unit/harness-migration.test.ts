import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

describe("harness evolution migrations", () => {
  it("creates the complete SQLite schema on an empty database", () => {
    const sqlite = new Database(":memory:");
    const migration = readFileSync(
      "lib/db/migrations-sqlite/0119_add_harness_evolution.sql",
      "utf8",
    );

    sqlite.exec(migration);

    const tables = sqlite
      .prepare(
        "select name from sqlite_master where type = 'table' and name like '%harness%' or type = 'table' and name like 'work_%'",
      )
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "harness_components",
        "harness_component_revisions",
        "work_harness_snapshots",
        "work_harness_snapshot_items",
        "work_run_evidence_bundles",
        "work_run_diagnostics",
        "work_evaluation_suites",
        "work_evaluation_scenarios",
        "work_evaluation_campaigns",
        "work_evaluation_runs",
        "work_harness_change_proposals",
        "work_harness_change_items",
        "work_evolution_verdicts",
      ]),
    );
    sqlite.close();
  });

  it("registers the brain and harness migrations after the previous baseline", () => {
    const pgJournal = JSON.parse(
      readFileSync("lib/db/migrations/meta/_journal.json", "utf8"),
    ) as { entries: Array<{ tag: string }> };
    const sqliteJournal = JSON.parse(
      readFileSync("lib/db/migrations-sqlite/meta/_journal.json", "utf8"),
    ) as { entries: Array<{ tag: string }> };

    expect(pgJournal.entries.slice(-2).map((entry) => entry.tag)).toEqual([
      "0120_add_brain_memory_tables",
      "0121_add_harness_evolution",
    ]);
    expect(sqliteJournal.entries.slice(-2).map((entry) => entry.tag)).toEqual([
      "0118_add_brain_memory_tables",
      "0119_add_harness_evolution",
    ]);
  });
});
