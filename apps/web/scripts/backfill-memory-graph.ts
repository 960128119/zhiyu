import Module from "node:module";
import { inArray } from "drizzle-orm";

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

const statuses = ["confirmed"];
const args = new Set(process.argv.slice(2));
const explicitUserId: string | undefined =
  process.env.USER_ID ??
  process.argv
    .slice(2)
    .find((arg) => !arg.startsWith("--") && arg.trim().length > 0);

async function listUserIds(): Promise<string[]> {
  const [{ db }, { interactionMemories }] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema"),
  ]);
  const rows = (await db
    .select({ userId: interactionMemories.userId })
    .from(interactionMemories)
    .where(inArray(interactionMemories.status, statuses))) as Array<{
    userId: string | null;
  }>;
  return [
    ...new Set(
      rows
        .map((row) => row.userId)
        .filter((userId): userId is string => Boolean(userId)),
    ),
  ];
}

async function main() {
  const { indexInteractionMemoriesToGraph } = await import(
    "@/lib/interactions/graph"
  );
  const userIds: string[] = args.has("--all")
    ? await listUserIds()
    : explicitUserId
      ? [explicitUserId]
      : [];

  if (args.has("--all") && userIds.length === 0) {
    console.log("[MemoryGraphBackfill] no confirmed interaction memories found");
    return;
  }

  if (userIds.length === 0) {
    throw new Error(
      "Usage: pnpm exec tsx scripts/backfill-memory-graph.ts --all or USER_ID=<id> pnpm exec tsx scripts/backfill-memory-graph.ts",
    );
  }

  for (const userId of userIds) {
    const result = await indexInteractionMemoriesToGraph({
      userId,
      statuses,
      limit: 1_000,
    });
    console.log(
      `[MemoryGraphBackfill] user=${userId} scanned=${result.scanned} entities=${result.entities.length} relations=${result.relations.length} evidence=${result.evidence.length}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[MemoryGraphBackfill] failed", error);
    process.exit(1);
  });
