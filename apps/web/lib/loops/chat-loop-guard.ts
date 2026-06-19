import type { Loop } from "@/lib/db/schema";
import { evaluateLoopActionGuard, type LoopActionGuardResult } from "./action-guard";
import { getLoop } from "./service";

export interface ChatLoopGuardContext {
  loopId: string;
  loopName: string;
  actionPolicy: Record<string, unknown>;
  approvalPolicy: Record<string, unknown>;
}

export async function resolveChatLoopGuardContext(input: {
  userId: string;
  loopId?: string | null;
}): Promise<ChatLoopGuardContext | null> {
  if (!input.loopId) return null;
  const loop = await getLoop(input.userId, input.loopId);
  if (!loop) return null;

  return chatLoopGuardContextFromLoop(loop);
}

export function chatLoopGuardContextFromLoop(
  loop: Pick<Loop, "id" | "name" | "actionPolicy" | "approvalPolicy">,
): ChatLoopGuardContext {
  return {
    loopId: loop.id,
    loopName: loop.name,
    actionPolicy: loop.actionPolicy,
    approvalPolicy: loop.approvalPolicy,
  };
}

export function evaluateChatToolActionGuard(input: {
  context: ChatLoopGuardContext;
  toolName: string;
}): LoopActionGuardResult {
  return evaluateLoopActionGuard({
    mode: "advisory",
    actionNames: [input.toolName],
    actionPolicy: input.context.actionPolicy,
    approvalPolicy: input.context.approvalPolicy,
  });
}
