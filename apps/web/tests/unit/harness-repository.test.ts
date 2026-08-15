import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";
import * as tables from "@/lib/db/schema-sqlite";
import {
  assembleWorkHarnessSnapshot,
  createHarnessEvolutionRepository,
  type HarnessComponentDefinition,
} from "@/lib/harness-evolution";

function createDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    create table User (id text primary key not null);
    create table workshops (id text primary key not null, user_id text not null);
    create table workshop_work_versions (
      id text primary key not null,
      workshop_id text not null,
      version text not null
    );
    create table workshop_runs (id text primary key not null);
    create table loops (id text primary key not null);
    create table loop_runs (id text primary key not null);
  `);
  sqlite.exec(
    readFileSync(
      "lib/db/migrations-sqlite/0119_add_harness_evolution.sql",
      "utf8",
    ),
  );
  sqlite.exec(`
    insert into User (id) values ('user-1');
    insert into workshops (id, user_id) values ('work-1', 'user-1');
    insert into workshop_work_versions (id, workshop_id, version)
      values ('version-1', 'work-1', 'work-v1');
  `);
  return { sqlite, database: drizzle(sqlite) };
}

function definitions(mission: string): HarnessComponentDefinition[] {
  return [
    {
      key: "work.prompt",
      type: "prompt",
      scope: { type: "work", id: "work-1" },
      owner: "work",
      mutability: "proposal_only",
      riskLevel: "medium",
      sourceKind: "database",
      sourceRef: "workshops:work-1:mission",
      sourceVersion: "work-v1",
      content: { mission },
    },
    {
      key: "tool.read.implementation",
      type: "tool_implementation",
      scope: { type: "platform", id: null },
      owner: "platform",
      mutability: "system_protected",
      riskLevel: "protected",
      sourceKind: "code_registry",
      sourceRef: "agent-tools:read",
      sourceVersion: "build-1",
      content: { name: "read" },
    },
  ];
}

function snapshot(mission: string) {
  return assembleWorkHarnessSnapshot({
    workId: "work-1",
    workVersionId: "version-1",
    workVersion: "work-v1",
    platformVersion: "build-1",
    modelRuntime: { provider: null, model: null, reasoningLevel: null },
    policy: {
      allowedActions: ["read"],
      approvalRequiredActions: [],
      deniedActions: [],
    },
    components: definitions(mission),
    resolvedAt: "2026-08-12T00:00:00.000Z",
  });
}

describe("harness evolution repository", () => {
  it("reuses component revisions and snapshots by checksum", async () => {
    const { sqlite, database } = createDatabase();
    const repository = createHarnessEvolutionRepository({
      database,
      dialect: "sqlite",
      tables,
    });

    const first = await repository.persistSnapshot(snapshot("Mission one"));
    const repeated = await repository.persistSnapshot(snapshot("Mission one"));
    const changed = await repository.persistSnapshot(snapshot("Mission two"));

    expect(repeated.id).toBe(first.id);
    expect(changed.id).not.toBe(first.id);
    expect(
      sqlite.prepare("select count(*) as count from harness_components").get(),
    ).toEqual({ count: 2 });
    expect(
      sqlite
        .prepare("select count(*) as count from harness_component_revisions")
        .get(),
    ).toEqual({ count: 3 });
    expect(
      sqlite
        .prepare("select count(*) as count from work_harness_snapshots")
        .get(),
    ).toEqual({ count: 2 });
    expect(
      sqlite
        .prepare("select count(*) as count from work_harness_snapshot_items")
        .get(),
    ).toEqual({ count: 4 });

    sqlite.close();
  });
});
