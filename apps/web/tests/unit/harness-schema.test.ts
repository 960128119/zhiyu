import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import * as pg from "@/lib/db/schema.pg";
import * as sqlite from "@/lib/db/schema-sqlite";

const expected = [
  ["harnessComponents", "harness_components"],
  ["harnessComponentRevisions", "harness_component_revisions"],
  ["workHarnessSnapshots", "work_harness_snapshots"],
  ["workHarnessSnapshotItems", "work_harness_snapshot_items"],
  ["workRunEvidenceBundles", "work_run_evidence_bundles"],
  ["workRunDiagnostics", "work_run_diagnostics"],
  ["workEvaluationSuites", "work_evaluation_suites"],
  ["workEvaluationScenarios", "work_evaluation_scenarios"],
  ["workEvaluationCampaigns", "work_evaluation_campaigns"],
  ["workEvaluationRuns", "work_evaluation_runs"],
  ["workHarnessChangeProposals", "work_harness_change_proposals"],
  ["workHarnessChangeItems", "work_harness_change_items"],
  ["workEvolutionVerdicts", "work_evolution_verdicts"],
] as const;

describe("harness evolution schema", () => {
  it.each(expected)(
    "exports %s with the same table name in both modes",
    (key, name) => {
      expect(getTableName(pg[key])).toBe(name);
      expect(getTableName(sqlite[key])).toBe(name);
    },
  );

  it("exposes the immutable snapshot and optimistic-lock columns", () => {
    expect(pg.workHarnessSnapshots).toHaveProperty("componentSetHash");
    expect(pg.workHarnessSnapshotItems).toHaveProperty("revisionId");
    expect(pg.workRunEvidenceBundles).toHaveProperty("harnessSnapshotId");
    expect(pg.workHarnessChangeProposals).toHaveProperty(
      "baseHarnessSnapshotId",
    );
    expect(pg.workHarnessChangeProposals).toHaveProperty(
      "baseComponentSetHash",
    );
  });
});
