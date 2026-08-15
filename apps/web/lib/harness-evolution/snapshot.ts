import { sha256Canonical } from "./canonical-json";
import {
  HARNESS_COMPONENT_TYPES,
  type AssembleWorkHarnessSnapshotInput,
  type HarnessComponentDefinition,
  type HarnessComponentSnapshot,
  type WorkHarnessSnapshot,
} from "./types";

const componentTypeOrder = new Map(
  HARNESS_COMPONENT_TYPES.map((type, index) => [type, index]),
);

function uniqueSorted(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function componentId(component: HarnessComponentDefinition) {
  const scopeId = component.scope.id ?? "platform";
  return `harness:${component.scope.type}:${scopeId}:${component.type}:${component.key}`;
}

function materializeComponent(
  component: HarnessComponentDefinition,
): HarnessComponentSnapshot {
  const id = componentId(component);
  const checksum = sha256Canonical({
    key: component.key,
    type: component.type,
    scope: component.scope,
    sourceKind: component.sourceKind,
    sourceRef: component.sourceRef,
    sourceVersion: component.sourceVersion,
    content: component.content,
  });

  return {
    ...component,
    id,
    revisionId: `${id}@${checksum.slice(0, 24)}`,
    revision: 1,
    checksum,
  };
}

function compareComponents(
  left: HarnessComponentSnapshot,
  right: HarnessComponentSnapshot,
) {
  const typeDifference =
    (componentTypeOrder.get(left.type) ?? Number.MAX_SAFE_INTEGER) -
    (componentTypeOrder.get(right.type) ?? Number.MAX_SAFE_INTEGER);
  return (
    typeDifference ||
    left.key.localeCompare(right.key) ||
    left.id.localeCompare(right.id)
  );
}

export function assembleWorkHarnessSnapshot(
  input: AssembleWorkHarnessSnapshotInput,
): WorkHarnessSnapshot {
  const deniedActions = uniqueSorted(input.policy.deniedActions);
  const denied = new Set(deniedActions);
  const components = input.components
    .map(materializeComponent)
    .sort(compareComponents);
  const componentSetHash = sha256Canonical(
    components.map((component) => ({
      id: component.id,
      checksum: component.checksum,
    })),
  );

  return {
    interfaceVersion: "work-harness.v1",
    snapshotId: `harness-snapshot:${componentSetHash.slice(0, 24)}`,
    workId: input.workId,
    workVersionId: input.workVersionId,
    workVersion: input.workVersion,
    platformVersion: input.platformVersion,
    componentSetHash,
    modelRuntime: input.modelRuntime,
    components,
    policySummary: {
      allowedActions: uniqueSorted(input.policy.allowedActions).filter(
        (action) => !denied.has(action),
      ),
      approvalRequiredActions: uniqueSorted(
        input.policy.approvalRequiredActions,
      ).filter((action) => !denied.has(action)),
      deniedActions,
      protectedComponentIds: components
        .filter(
          (component) =>
            component.mutability === "system_protected" ||
            component.riskLevel === "protected",
        )
        .map((component) => component.id),
    },
    resolvedAt: input.resolvedAt ?? new Date().toISOString(),
  };
}
