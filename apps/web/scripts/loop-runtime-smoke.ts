import { mkdirSync } from "node:fs";
import Module from "node:module";
import { dirname, resolve } from "node:path";
import { eq } from "drizzle-orm";

process.env.IS_TAURI ??= "true";
process.env.TAURI_DB_PATH ??= resolve(
  process.cwd(),
  "../../.codex-logs/loop-runtime-smoke.sqlite",
);
process.env.TAURI_DATA_DIR ??= dirname(process.env.TAURI_DB_PATH);
process.env.TAURI_STORAGE_PATH ??= resolve(
  process.env.TAURI_DATA_DIR,
  "storage",
);
process.env.TAURI_LOGS_PATH ??= resolve(process.env.TAURI_DATA_DIR, "logs");

mkdirSync(dirname(process.env.TAURI_DB_PATH), { recursive: true });

type ModuleLoad = (
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
) => unknown;

const moduleWithLoad = Module as unknown as { _load: ModuleLoad };
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only" || request.includes("server-only")) {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

const userId = "loop-runtime-smoke-user";
const now = new Date();

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Loop runtime smoke failed: ${message}`);
  }
}

const [
  { db },
  { user, loops, loopRuns, loopStates, loopApprovalRequests },
  {
    createLoop,
    createLoopFromTemplate,
    DAILY_BRIEF_TEMPLATE_ID,
    getLoopDashboardDetail,
    listLoopDashboard,
    loopSpecToCreateLoopInput,
    parseLoopSpec,
    runNativeLoopOnce,
    upsertLoopState,
  },
  { runDueNativeLoops },
] = await Promise.all([
  import("../lib/db/queries"),
  import("../lib/db/schema"),
  import("../lib/loops"),
  import("../lib/loops/native-scheduler"),
]);

const loopIds: string[] = [];

try {
  await db
    .insert(user)
    .values({
      id: userId,
      email: "loop-runtime-smoke@example.test",
      password: null,
      name: "Loop Runtime Smoke",
      createdAt: now,
      updatedAt: now,
      sessionVersion: 1,
    })
    .onConflictDoNothing();

  const loop = await createLoopFromTemplate({
    userId,
    templateId: DAILY_BRIEF_TEMPLATE_ID,
    timezone: "UTC",
    modelChecker: {
      enabled: false,
      maxInputChars: 8_000,
    },
  });
  loopIds.push(loop.id);

  assertSmoke(loop.triggerConfig.type === "cron", "template trigger persisted");
  assertSmoke(
    loop.verificationConfig.type === "structured_check",
    "template verification persisted",
  );

  const execution = await runNativeLoopOnce({
    userId,
    loopId: loop.id,
    triggeredBy: "manual",
    reason: { source: "loop_runtime_smoke" },
  });

  assertSmoke(execution.status === "success", "dry run returned success");

  const detail = await getLoopDashboardDetail(userId, loop.id);
  assertSmoke(detail, "dashboard detail exists");
  assertSmoke(detail.runs.length === 1, "dashboard includes the dry-run run");
  assertSmoke(
    typeof detail.latestRun?.verificationPassed === "boolean",
    "verification result is surfaced as a boolean",
  );
  assertSmoke(
    detail.stateJson.lastExecutionMode === "dry_run",
    "loop state records dry-run mode",
  );

  const dashboard = await listLoopDashboard(userId);
  assertSmoke(
    dashboard.loops.some((summary) => summary.id === loop.id),
    "loop appears in dashboard list",
  );

  const scheduledLoop = await createLoop(
    loopSpecToCreateLoopInput({
      userId,
      name: "Loop Scheduler Smoke",
      spec: parseLoopSpec({
        goal: "Verify native loop scheduler persistence",
        trigger: { type: "once", at: "2026-06-16T00:00:00.000Z" },
        verification: {
          type: "legacy_status",
          successCriteria: ["Dry-run scheduler execution returns success"],
        },
      }),
    }),
  );
  loopIds.push(scheduledLoop.id);
  await upsertLoopState(scheduledLoop.id, {
    stateJson: {
      nextScheduledRunAt: "2026-06-16T00:00:00.000Z",
      schedulerStatus: "idle",
    },
  });

  const schedulerResult = await runDueNativeLoops({
    userId,
    now: new Date("2026-06-16T00:01:00.000Z"),
    executionMode: "dry_run",
    awaitCompletion: true,
  });
  assertSmoke(schedulerResult.launched >= 1, "scheduler launched a due loop");

  const scheduledDetail = await getLoopDashboardDetail(userId, scheduledLoop.id);
  assertSmoke(scheduledDetail, "scheduled loop dashboard detail exists");
  assertSmoke(
    scheduledDetail.runs.length === 1,
    "scheduled loop persisted one run",
  );
  assertSmoke(
    scheduledDetail.stateJson.schedulerStatus === "completed_once",
    "one-time scheduled loop records completed scheduler status",
  );
  assertSmoke(
    typeof scheduledDetail.stateJson.lastScheduledRunAt === "string",
    "scheduled loop records last scheduled run time",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        userId,
        loopId: loop.id,
        runId: detail.latestRun?.id,
        dashboardStatus: detail.dashboardStatus,
        verificationPassed: detail.latestRun?.verificationPassed,
        checkerAction: detail.latestRun?.checkerAction,
        scheduledLoopId: scheduledLoop.id,
        scheduledRunId: scheduledDetail.latestRun?.id,
        scheduledStatus: scheduledDetail.stateJson.schedulerStatus,
      },
      null,
      2,
    ),
  );
} finally {
  for (const loopId of loopIds) {
    await db
      .delete(loopApprovalRequests)
      .where(eq(loopApprovalRequests.loopId, loopId));
    await db.delete(loopRuns).where(eq(loopRuns.loopId, loopId));
    await db.delete(loopStates).where(eq(loopStates.loopId, loopId));
    await db.delete(loops).where(eq(loops.id, loopId));
  }
  await db.delete(user).where(eq(user.id, userId));
}
