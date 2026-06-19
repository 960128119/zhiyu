import {
  evaluateChatToolActionGuard,
  type ChatLoopGuardContext,
} from "./chat-loop-guard";

export interface NativeAgentPermissionRequestEvent {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseID: string;
  decisionReason?: string;
  blockedPath?: string;
  loopGuardDecision?: string;
  loopGuardReason?: string;
  loopGuardLoopId?: string;
}

export function withNativeAgentLoopGuardMetadata(input: {
  context: ChatLoopGuardContext | null;
  request: NativeAgentPermissionRequestEvent;
}): NativeAgentPermissionRequestEvent {
  if (!input.context) {
    return input.request;
  }

  const guard = evaluateChatToolActionGuard({
    context: input.context,
    toolName: input.request.toolName,
  });
  const nonAllowDecision = guard.decisions.find(
    (decision) => decision.decision !== "allow",
  );

  if (!nonAllowDecision) {
    return input.request;
  }

  return {
    ...input.request,
    decisionReason:
      input.request.decisionReason ??
      `Loop "${input.context.loopName}" policy: ${nonAllowDecision.reason}`,
    loopGuardDecision: nonAllowDecision.decision,
    loopGuardReason: nonAllowDecision.reason,
    loopGuardLoopId: input.context.loopId,
  };
}
