import { z } from "zod";
import type { CreateLoopInput, LoopJson } from "./types";

const loopContextSourceSchema = z
  .object({
    type: z.enum(["insight", "memory", "connector", "file", "channel"]),
    id: z.string().optional(),
    name: z.string().optional(),
    filter: z.string().optional(),
    query: z.string().optional(),
    platform: z.string().optional(),
    project: z.string().optional(),
    path: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const loopTriggerSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("manual"),
    })
    .strict(),
  z
    .object({
      type: z.literal("cron"),
      expression: z.string().min(1),
      timezone: z.string().min(1).default("UTC"),
    })
    .strict(),
  z
    .object({
      type: z.literal("interval"),
      minutes: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal("once"),
      at: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("scheduled_job"),
      scheduledJobId: z.string().min(1),
    })
    .passthrough(),
]);

export const loopContextSchema = z
  .object({
    sources: z.array(loopContextSourceSchema).default([]),
    instructions: z.string().optional(),
  })
  .strict();

export const loopActionPolicySchema = z
  .object({
    allowed: z.array(z.string().min(1)).default([]),
    requiresApproval: z.array(z.string().min(1)).default([]),
    denied: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const loopVerificationSchema = z
  .object({
    type: z
      .enum(["structured_check", "legacy_status"])
      .default("structured_check"),
    successCriteria: z.array(z.string().min(1)).default([]),
    requiredFields: z.array(z.string().min(1)).default([]),
    requiredSources: z.array(z.string().min(1)).default([]),
    modelChecker: z
      .object({
        enabled: z.boolean().default(false),
        provider: z.string().min(1).optional(),
        model: z.string().min(1).optional(),
        maxInputChars: z.number().int().min(2_000).max(50_000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const loopRetryPolicySchema = z
  .object({
    maxAttempts: z.number().int().min(0).max(10).default(1),
    onFailure: z
      .enum(["summarize_and_block", "mark_failed", "ask_human"])
      .default("summarize_and_block"),
  })
  .strict();

export const loopApprovalPolicySchema = z
  .object({
    defaultMode: z.enum(["allow", "require_approval", "deny"]).default("allow"),
    externalWrites: z
      .enum(["allow", "require_approval", "deny"])
      .default("require_approval"),
  })
  .strict();

export const loopEscalationPolicySchema = z
  .object({
    onBlocked: z.enum(["none", "notify_user"]).default("notify_user"),
    onNeedsApproval: z.enum(["none", "notify_user"]).default("notify_user"),
  })
  .strict();

export const loopSpecSchema = z
  .object({
    version: z.literal(1).default(1),
    templateId: z.string().optional(),
    goal: z.string().min(1),
    trigger: loopTriggerSchema,
    context: loopContextSchema.default({ sources: [] }),
    actions: loopActionPolicySchema.default({
      allowed: [],
      requiresApproval: [],
      denied: [],
    }),
    verification: loopVerificationSchema.default({
      type: "structured_check",
      successCriteria: [],
      requiredFields: [],
      requiredSources: [],
    }),
    retry: loopRetryPolicySchema.default({
      maxAttempts: 1,
      onFailure: "summarize_and_block",
    }),
    approval: loopApprovalPolicySchema.default({
      defaultMode: "allow",
      externalWrites: "require_approval",
    }),
    escalation: loopEscalationPolicySchema.default({
      onBlocked: "notify_user",
      onNeedsApproval: "notify_user",
    }),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type LoopSpec = z.infer<typeof loopSpecSchema>;
export type LoopTrigger = z.infer<typeof loopTriggerSchema>;
export type LoopContext = z.infer<typeof loopContextSchema>;

export function parseLoopSpec(input: unknown): LoopSpec {
  return loopSpecSchema.parse(input);
}

export function safeParseLoopSpec(input: unknown) {
  return loopSpecSchema.safeParse(input);
}

export function loopSpecToCreateLoopInput(input: {
  userId: string;
  name: string;
  description?: string | null;
  spec: LoopSpec;
}): CreateLoopInput {
  const specJson = input.spec as unknown as LoopJson;

  return {
    userId: input.userId,
    name: input.name,
    description: input.description ?? null,
    goal: input.spec.goal,
    status: "active",
    triggerConfig: input.spec.trigger as unknown as LoopJson,
    contextConfig: input.spec.context as unknown as LoopJson,
    actionPolicy: input.spec.actions as unknown as LoopJson,
    verificationConfig: input.spec.verification as unknown as LoopJson,
    approvalPolicy: input.spec.approval as unknown as LoopJson,
    retryPolicy: input.spec.retry as unknown as LoopJson,
    escalationPolicy: input.spec.escalation as unknown as LoopJson,
    initialState: {
      currentPhase: "idle",
      stateJson: {
        loopSpec: specJson,
        templateId: input.spec.templateId,
      },
    },
  };
}
