import Module from "node:module";
import { eq, inArray } from "drizzle-orm";

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

const args = new Set(process.argv.slice(2));
const explicitUserId =
  process.env.USER_ID ??
  process.argv
    .slice(2)
    .find((arg) => !arg.startsWith("--") && arg.trim().length > 0);

async function listUserIds() {
  const [{ db }, { interactionEvents }] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema"),
  ]);
  const rows = (await db
    .select({ userId: interactionEvents.userId })
    .from(interactionEvents)) as Array<{ userId: string | null }>;
  return [
    ...new Set(
      rows
        .map((row) => row.userId)
        .filter((userId): userId is string => Boolean(userId)),
    ),
  ];
}

async function backfillUser(userId: string) {
  const [
    {
      emptyBrainBackfillReport,
      interactionMemoryRowToBrainBackfill,
      trackBackfilledMemory,
      workshopMemoryRowToBrainBackfill,
    },
    { createBrainObservation },
    { upsertBrainMemory },
  ] = await Promise.all([
    import("@/lib/brain/backfill"),
    import("@/lib/brain/service"),
    import("@/lib/brain/repository"),
  ]);
  const report = emptyBrainBackfillReport();
  const [{ db }, schema] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema"),
  ]);

  const [interactionMemoryRows, eventRows, workshopRows] = await Promise.all([
    db
      .select()
      .from(schema.interactionMemories)
      .where(eq(schema.interactionMemories.userId, userId)),
    db
      .select()
      .from(schema.interactionEvents)
      .where(eq(schema.interactionEvents.userId, userId)),
    db
      .select()
      .from(schema.workshops)
      .where(eq(schema.workshops.userId, userId)),
  ]);

  for (const row of interactionMemoryRows as any[]) {
    try {
      const memory = interactionMemoryRowToBrainBackfill(row);
      trackBackfilledMemory(report, memory);
      if (memory) await upsertBrainMemory(memory);
    } catch (error) {
      report.errors.push({
        id: String(row.id ?? "unknown"),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const workshops = new Map<string, { id: string; userId: string }>(
    (workshopRows as any[]).map((workshop) => [
      String(workshop.id),
      { id: String(workshop.id), userId: String(workshop.userId) },
    ]),
  );
  if (workshops.size > 0) {
    const workshopMemoryRows = await db
      .select()
      .from(schema.workshopMemories)
      .where(inArray(schema.workshopMemories.workshopId, [...workshops.keys()]));
    for (const row of workshopMemoryRows as any[]) {
      try {
        const workshop = workshops.get(String(row.workshopId));
        if (!workshop) {
          report.skipped += 1;
          continue;
        }
        const memory = workshopMemoryRowToBrainBackfill({ workshop, memory: row });
        trackBackfilledMemory(report, memory);
        await upsertBrainMemory(memory);
      } catch (error) {
        report.errors.push({
          id: String(row.id ?? "unknown"),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  for (const event of eventRows as any[]) {
    try {
      report.scanned += 1;
      await createBrainObservation({
        userId,
        sourceType: "interaction_event",
        sourceId: String(event.id),
        sourceEventId: String(event.id),
        observedAt: event.messageTime,
        content: String(event.content ?? event.contentPreview ?? ""),
        metadata: {
          platform: event.platform,
          source: event.source,
          conversationId: event.conversationId,
          conversationName: event.conversationName,
          senderName: event.senderName,
          direction: event.direction,
          dedupeKey: event.dedupeKey,
        },
      });
      report.observations += 1;
    } catch (error) {
      report.errors.push({
        id: String(event.id ?? "unknown"),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}

async function main() {
  const userIds = args.has("--all")
    ? await listUserIds()
    : explicitUserId
      ? [explicitUserId]
      : [];
  if (userIds.length === 0) {
    throw new Error(
      "Usage: pnpm exec tsx scripts/backfill-brain-memory.ts --all or USER_ID=<id> pnpm exec tsx scripts/backfill-brain-memory.ts",
    );
  }

  for (const userId of userIds) {
    const report = await backfillUser(userId);
    console.log(`[BrainBackfill] user=${userId} ${JSON.stringify(report)}`);
  }
}

main().catch((error) => {
  console.error("[BrainBackfill] failed", error);
  process.exit(1);
});
