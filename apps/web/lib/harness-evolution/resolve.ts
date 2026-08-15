import { buildAgentToolMatrix } from "@/lib/agent-tools/matrix";
import { loadSkills } from "@/lib/ai/skills/loader";
import type { Workshop } from "@/lib/db/schema";
import { listLoopsForWorkshop } from "@/lib/loops/service";
import {
  createWorkshopWorkVersionSnapshot,
  getWorkshop,
  getWorkshopHeartbeat,
  listWorkshopWorkVersions,
} from "@/lib/workshops/service";
import { buildWorkshopWorkModel } from "@/lib/workshops/work-model";
import { deriveWorkHarnessComponents } from "./component-registry";
import { getHarnessPlatformVersion } from "./feature-flags";
import {
  harnessEvolutionRepository,
  type HarnessEvolutionRepository,
} from "./repository";
import { assembleWorkHarnessSnapshot } from "./snapshot";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export interface ResolveCurrentWorkHarnessInput {
  userId: string;
  workId: string;
  platformVersion?: string;
  persist?: boolean;
  status?: "active" | "candidate";
}

export async function resolveCurrentWorkHarness(
  input: ResolveCurrentWorkHarnessInput,
  repository: HarnessEvolutionRepository = harnessEvolutionRepository,
) {
  const workshop = await getWorkshop(input.userId, input.workId);
  if (!workshop) return null;

  const [loops, heartbeat, existingVersions] = await Promise.all([
    listLoopsForWorkshop({
      userId: input.userId,
      workshopId: input.workId,
      limit: 200,
    }),
    getWorkshopHeartbeat(input.workId),
    listWorkshopWorkVersions(input.userId, input.workId, 1),
  ]);
  const configuredWorkVersion = optionalString(
    asRecord(workshop.modelConfig).workVersion,
  );
  const workVersion =
    existingVersions?.[0] ??
    (input.persist === false
      ? {
          id: `unpersisted:${workshop.id}`,
          version:
            configuredWorkVersion ??
            (workshop.updatedAt instanceof Date
              ? workshop.updatedAt.toISOString()
              : String(workshop.updatedAt)),
        }
      : await createWorkshopWorkVersionSnapshot({
          workshop,
          source: "harness_snapshot_bootstrap",
          createdBy: "harness_snapshot_resolver",
        }));
  const toolMatrix = buildAgentToolMatrix({
    runtime: "workshop",
    workshopId: input.workId,
    workshop,
  });
  const workModel = buildWorkshopWorkModel({
    workshop,
    loops,
    heartbeat,
    toolMatrix,
    availableSkillNames: loadSkills().map((skill) => skill.name),
  });
  const platformVersion = input.platformVersion ?? getHarnessPlatformVersion();
  const modelConfig = asRecord((workshop as Workshop).modelConfig);
  const snapshot = assembleWorkHarnessSnapshot({
    workId: input.workId,
    workVersionId: workVersion.id,
    workVersion: workVersion.version,
    platformVersion,
    modelRuntime: {
      provider: optionalString(modelConfig.provider),
      model:
        optionalString(modelConfig.model) ??
        optionalString(modelConfig.primaryModel),
      reasoningLevel: optionalString(modelConfig.reasoningLevel),
    },
    components: deriveWorkHarnessComponents({
      workshop,
      loops,
      workModel,
      toolMatrix,
      platformVersion,
    }),
    policy: {
      allowedActions: workModel.controlContract.allowedActions,
      approvalRequiredActions:
        workModel.controlContract.approvalRequiredActions,
      deniedActions: workModel.controlContract.deniedActions,
    },
  });

  if (input.persist === false) {
    return { snapshot, persisted: null, workModel };
  }
  const requestedStatus = input.status ?? "active";
  const latest = await repository.getLatestSnapshot(
    input.workId,
    requestedStatus,
  );
  const persisted =
    latest &&
    latest.workVersionId === snapshot.workVersionId &&
    latest.platformVersion === snapshot.platformVersion &&
    latest.componentSetHash === snapshot.componentSetHash
      ? latest
      : await repository.persistSnapshot(snapshot, {
          status: requestedStatus,
          activate: requestedStatus === "active",
        });
  const persistedByKey = new Map(
    persisted.components.map((component) => [component.key, component]),
  );
  return {
    snapshot: {
      ...snapshot,
      snapshotId: persisted.id,
      components: snapshot.components.map((component) => {
        const stored = persistedByKey.get(component.key);
        return stored
          ? {
              ...component,
              id: stored.componentId,
              revisionId: stored.revisionId,
              revision: stored.revision,
              checksum: stored.checksum,
            }
          : component;
      }),
    },
    persisted,
    workModel,
  };
}
