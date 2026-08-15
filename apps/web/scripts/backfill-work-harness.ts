import Module from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { eq } from "drizzle-orm";

type ModuleLoad = (
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
) => unknown;

type CapturableRun = {
  id: string;
  status: string;
};

const moduleWithLoad = Module as unknown as { _load: ModuleLoad };
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only" || request.includes("server-only")) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((argument) => argument.startsWith("--")));
const apply = flags.has("--apply");
const all = flags.has("--all");

function option(name: string) {
  const prefix = `--${name}=`;
  return argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sameStrings(left: string[], right: string[]) {
  return (
    JSON.stringify([...new Set(left)].sort()) ===
    JSON.stringify([...new Set(right)].sort())
  );
}

async function main() {
  const userId = option("user") ?? process.env.USER_ID;
  const workId = option("work");
  const captureRuns = positiveInteger(option("capture-runs"), apply ? 1 : 0);
  const reportPath = option("report");
  if (!all && !userId && !workId) {
    throw new Error(
      "Usage: pnpm exec tsx scripts/backfill-work-harness.ts --all [--apply] [--capture-runs=1] or --user=<id> or --work=<id>",
    );
  }
  if (captureRuns > 0 && !apply) {
    throw new Error(
      "Run capture requires --apply because it persists evidence.",
    );
  }
  if (apply) process.env.WORK_HARNESS_EVOLUTION_ENABLED = "true";

  const [
    { db },
    schema,
    harness,
    harnessCapture,
    workshopService,
    loopService,
    adapters,
  ] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema"),
    import("@/lib/harness-evolution"),
    import("@/lib/harness-evolution/capture-service"),
    import("@/lib/workshops/service"),
    import("@/lib/loops/service"),
    import("@/lib/db/adapters"),
  ]);
  const conditions = workId
    ? eq(schema.workshops.id, workId)
    : userId
      ? eq(schema.workshops.userId, userId)
      : undefined;
  const rows = await db
    .select()
    .from(schema.workshops)
    .where(conditions)
    .orderBy(schema.workshops.createdAt);
  const report = {
    interfaceVersion: "work-harness-backfill-report.v1",
    mode: apply ? "apply" : "dry_run",
    generatedAt: new Date().toISOString(),
    safety: {
      externalMessagesSent: 0,
      realFundsActions: 0,
      paperAccountMutations: 0,
      productionHarnessPublishes: 0,
    },
    totals: {
      works: rows.length,
      snapshotsResolved: 0,
      snapshotsPersisted: 0,
      evidenceCaptured: 0,
      dualReadMismatches: 0,
      errors: 0,
    },
    works: [] as Array<Record<string, unknown>>,
  };

  for (const workshop of rows as any[]) {
    const item: Record<string, unknown> = {
      workId: workshop.id,
      name: workshop.name,
      role:
        typeof asRecord(workshop.modelConfig).role === "string"
          ? asRecord(workshop.modelConfig).role
          : "general_workshop",
      snapshotId: null,
      componentSetHash: null,
      componentCount: 0,
      evidenceCaptured: 0,
      dualReadIssues: [],
      errors: [],
    };
    try {
      const resolved = await harness.resolveCurrentWorkHarness({
        userId: workshop.userId,
        workId: workshop.id,
        persist: apply,
      });
      if (!resolved) throw new Error("Work could not be resolved.");
      report.totals.snapshotsResolved += 1;
      item.snapshotId = resolved.persisted?.id ?? resolved.snapshot.snapshotId;
      item.componentSetHash = resolved.snapshot.componentSetHash;
      item.componentCount = resolved.snapshot.components.length;
      if (resolved.persisted) report.totals.snapshotsPersisted += 1;

      if (resolved.persisted) {
        const persisted =
          await harness.harnessEvolutionRepository.getResolvedSnapshot(
            workshop.id,
            resolved.persisted.id,
          );
        const issues: string[] = [];
        if (!persisted) {
          issues.push("persisted_snapshot_missing");
        } else {
          if (
            persisted.componentSetHash !== resolved.snapshot.componentSetHash
          ) {
            issues.push("component_set_hash_mismatch");
          }
          if (
            persisted.components.length !== resolved.snapshot.components.length
          ) {
            issues.push("component_count_mismatch");
          }
          if (
            !sameStrings(
              persisted.policySummary.allowedActions,
              resolved.workModel.controlContract.allowedActions,
            )
          ) {
            issues.push("allowed_actions_mismatch");
          }
          if (
            !sameStrings(
              persisted.policySummary.approvalRequiredActions,
              resolved.workModel.controlContract.approvalRequiredActions,
            )
          ) {
            issues.push("approval_actions_mismatch");
          }
          if (
            !sameStrings(
              persisted.policySummary.deniedActions,
              resolved.workModel.controlContract.deniedActions,
            )
          ) {
            issues.push("denied_actions_mismatch");
          }
          const persistedKeys = persisted.components.map(
            (component) => component.key,
          );
          const resolvedKeys = resolved.snapshot.components.map(
            (component) => component.key,
          );
          if (!sameStrings(persistedKeys, resolvedKeys)) {
            issues.push("component_key_mismatch");
          }
        }
        item.dualReadIssues = issues;
        report.totals.dualReadMismatches += issues.length;
      }

      if (captureRuns > 0) {
        const workRuns = (
          (await workshopService.listWorkshopRuns(
            workshop.id,
            captureRuns,
          )) as CapturableRun[]
        ).filter((run) => run.status !== "running");
        const loops = await loopService.listLoopsForWorkshop({
          userId: workshop.userId,
          workshopId: workshop.id,
          limit: 200,
        });
        const loopRuns: CapturableRun[] = [];
        for (const loop of loops) {
          loopRuns.push(
            ...(
              (await loopService.listLoopRuns(loop.id, {
                limit: captureRuns,
              })) as CapturableRun[]
            ).filter((run) => run.status !== "running"),
          );
        }
        let captured = 0;
        for (const run of workRuns) {
          if (
            await harnessCapture.captureCompletedWorkshopRunEvidence(run.id)
          ) {
            captured += 1;
          }
        }
        for (const run of loopRuns) {
          if (await harnessCapture.captureCompletedLoopRunEvidence(run.id)) {
            captured += 1;
          }
        }
        item.evidenceCaptured = captured;
        report.totals.evidenceCaptured += captured;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      item.errors = [message];
      report.totals.errors += 1;
    }
    report.works.push(item);
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (reportPath) {
    const absolutePath = resolve(reportPath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, serialized, "utf8");
  }
  console.log(serialized);
  await adapters.closeDb();
  if (report.totals.errors > 0 || report.totals.dualReadMismatches > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error("[WorkHarnessBackfill] failed", error);
  process.exit(1);
});
