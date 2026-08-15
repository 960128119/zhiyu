import Module from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";

type ModuleLoad = (
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
) => unknown;

const moduleWithLoad = Module as unknown as { _load: ModuleLoad };
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only" || request.includes("server-only")) return {};
  return originalLoad.call(this, request, parent, isMain);
};

function option(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
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

async function main() {
  process.env.WORK_HARNESS_EVOLUTION_ENABLED = "true";
  const [{ db }, schema, manifestService, harness, adapters] =
    await Promise.all([
      import("@/lib/db/client"),
      import("@/lib/db/schema"),
      import("@/lib/workshops/manifest"),
      import("@/lib/harness-evolution"),
      import("@/lib/db/adapters"),
    ]);
  const requestedUserId = option("user") ?? process.env.USER_ID;
  const ownerOfWorkId = option("owner-of-work");
  const ownerRows = await db
    .select({ id: schema.workshops.id, userId: schema.workshops.userId })
    .from(schema.workshops);
  const ownerIds = [
    ...new Set(ownerRows.map((row: any) => String(row.userId))),
  ];
  const userId =
    requestedUserId ??
    (ownerOfWorkId
      ? ownerRows.find((row: any) => String(row.id) === ownerOfWorkId)?.userId
      : null) ??
    (ownerIds.length === 1 ? ownerIds[0] : null);
  if (!userId || !ownerIds.includes(userId)) {
    throw new Error(
      "Specify --user=<id> when existing Works belong to multiple owners.",
    );
  }
  const existingRows = await db
    .select()
    .from(schema.workshops)
    .where(eq(schema.workshops.userId, userId));
  const existing = (existingRows as any[]).find(
    (workshop) =>
      asRecord(workshop.modelConfig).manifestName === "harness-quality-steward",
  );
  if (existing) {
    console.log(
      JSON.stringify({
        ok: true,
        created: false,
        workshopId: existing.id,
        reason: "already_exists",
      }),
    );
    await adapters.closeDb();
    return;
  }
  const manifestPath = resolve(
    process.cwd(),
    "..",
    "..",
    "manifests",
    "workshops",
    "harness-quality-steward.workshop.yaml",
  );
  const manifestYaml = await readFile(manifestPath, "utf8");
  const applied = await manifestService.applyWorkshopManifest({
    userId,
    manifestYaml,
  });
  const resolved = await harness.resolveCurrentWorkHarness({
    userId,
    workId: applied.workshop.id,
  });
  console.log(
    JSON.stringify({
      ok: true,
      created: true,
      workshopId: applied.workshop.id,
      loopCount: applied.created.loops,
      sourceCount: applied.created.sources,
      snapshotId: resolved?.persisted?.id ?? null,
      componentSetHash: resolved?.snapshot.componentSetHash ?? null,
    }),
  );
  await adapters.closeDb();
}

main().catch((error) => {
  console.error("[HarnessQualityStewardSeed] failed", error);
  process.exit(1);
});
