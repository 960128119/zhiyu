import { tool } from "@anthropic-ai/claude-agent-sdk";
import type { Session } from "next-auth";
import { z } from "zod";
import type { Workshop } from "@/lib/db/schema";
import { proposeWorkshopAgentChange } from "@/lib/workshops/agent-change-proposals";
import { getWorkModelSnapshot, listWorks } from "@/lib/work-runtime";

function compactWorkshopForAgent(workshop: Workshop) {
  return {
    id: workshop.id,
    name: workshop.name,
    mission: workshop.mission,
    status: workshop.status,
    autonomyLevel: workshop.autonomyLevel,
    boundaryPolicy: workshop.boundaryPolicy,
    modelConfig: workshop.modelConfig,
    updatedAt: workshop.updatedAt,
  };
}

const jsonRecordSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    "A JSON object. Omit this field unless the user explicitly asks to change it.",
  );

export function createWorkshopAgentConfigTools(session: Session) {
  return [
    tool(
      "inspectWorkshopAgent",
      [
        "Inspect the owner's Workshop Work model before proposing any configuration change.",
        "Use this before changing an agent. It is read-only.",
        "If workshopId is unknown, use workshopName to find the closest match.",
        "The returned work field is the control contract: controlled objects, observations, skills, loops, boundaries, feedback, and missing pieces.",
      ].join("\n"),
      {
        workshopId: z.string().optional(),
        workshopName: z.string().optional(),
      },
      async ({ workshopId, workshopName }) => {
        const workList = await listWorks({
          userId: session.user.id,
          limit: 100,
        });
        const workshops = workList.works.map((item) => item.workshop) as Workshop[];
        const target =
          workshops.find((item) => item.id === workshopId) ??
          workshops.find((item) => item.name === workshopName) ??
          (workshopName
            ? workshops.find((item) => item.name.includes(workshopName))
            : null);
        const work = target
          ? (await getWorkModelSnapshot({
              userId: session.user.id,
              workId: target.id,
            }))?.work ?? null
          : null;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  target: target ? compactWorkshopForAgent(target) : null,
                  work,
                  workshops: workshops.map((item) => ({
                    id: item.id,
                    name: item.name,
                    status: item.status,
                    autonomyLevel: item.autonomyLevel,
                  })),
                  instruction:
                    "修改智能体前必须先阅读 work.controlContract、work.skillBindings、work.loopBindings 和 work.changeControl。修改时调用 proposeWorkshopAgentChange，只提交窄 patch；会影响边界、工具、自动化、真实外部动作的变更必须进入主人审核。",
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    ),
    tool(
      "proposeWorkshopAgentChange",
      [
        "Create an owner-reviewable proposal to change a Workshop Work configuration.",
        "This does not directly apply changes. It writes a proposal to the Workshop review queue.",
        "Use small, explicit patches. Do not propose deleting history, bypassing approvals, enabling real-money trading, or silently expanding external-write powers.",
      ].join("\n"),
      {
        workshopId: z.string().min(1),
        reason: z.string().min(6),
        riskLevel: z.enum(["low", "medium", "high"]).optional(),
        patch: z.object({
          name: z.string().optional(),
          mission: z.string().optional(),
          status: z.enum(["active", "paused", "archived"]).optional(),
          autonomyLevel: z.enum(["observe", "draft", "auto"]).optional(),
          boundaryPolicy: jsonRecordSchema,
          modelConfig: jsonRecordSchema,
        }),
      },
      async ({ workshopId, reason, riskLevel, patch }) => {
        try {
          const proposal = await proposeWorkshopAgentChange({
            userId: session.user.id,
            workshopId,
            patch,
            reason,
            riskLevel,
            proposedBy: "chat_agent",
            source: {
              surface: "workbench_chat",
              tool: "proposeWorkshopAgentChange",
            },
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    ok: true,
                    message:
                      "已创建智能体修改提案，等待主人在车间审核中确认。",
                    proposalEventId: proposal.id,
                    workshopId,
                    title: proposal.title,
                    diff: proposal.metadata?.diff ?? [],
                    riskLevel: proposal.metadata?.riskLevel ?? riskLevel ?? null,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    ok: false,
                    message:
                      error instanceof Error
                        ? error.message
                        : "创建智能体修改提案失败。",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    ),
  ];
}
