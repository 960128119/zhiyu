/**
 * Native Loop task tools.
 *
 * These replace the legacy scheduled_jobs tools for chat and external app
 * agents. All new timed/background tasks should be represented as rows in the
 * loops table and executed by the native loop scheduler.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Session } from "next-auth";

function summarizeLoop(loop: any) {
  return {
    id: loop.id,
    name: loop.name,
    description: loop.description,
    goal: loop.goal,
    status: loop.status,
    trigger: loop.triggerConfig,
    updatedAt: loop.updatedAt,
    createdAt: loop.createdAt,
  };
}

export function createLoopTaskTools(session: Session) {
  return [
    tool(
      "createLoopTask",
      [
        "Create a native OpenZhiyu Loop task from the user's natural-language automation request.",
        "",
        "Use this for ALL recurring, scheduled, reminder, monitor, background, or timed tasks.",
        "Do not use legacy scheduled jobs. New tasks must be native loops.",
        "",
        "Examples:",
        "- User: '每天早上 9 点给文件传输助手发北京天气预报'",
        "- intent: '每天早上 9 点给文件传输助手发北京天气预报'",
        "",
        "Parameters:",
        "- intent: the user's original request. Preserve platform, recipient, time, and content.",
        "- timezone: user's timezone, default Asia/Shanghai.",
        "- externalWriteMode: loop_approved lets the background loop perform external writes when the task explicitly asks for it; manual_approval requires review.",
      ].join("\n"),
      {
        intent: z
          .string()
          .min(4)
          .describe(
            "The user's original automation request, preserving all details.",
          ),
        timezone: z
          .string()
          .optional()
          .default("Asia/Shanghai")
          .describe("Timezone for the schedule."),
        externalWriteMode: z
          .enum(["manual_approval", "loop_approved"])
          .optional()
          .default("loop_approved")
          .describe(
            "Whether the created loop can execute explicit external writes in the background.",
          ),
      },
      async ({ intent, timezone = "Asia/Shanghai", externalWriteMode }) => {
        try {
          const { createLoopFromNaturalLanguage } = await import(
            "@/lib/loops/natural-language"
          );

          const result = await createLoopFromNaturalLanguage({
            userId: session.user.id,
            intent,
            timezone,
            externalWriteMode,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Created native loop task: ${result.loop.name}`,
                    loop: summarizeLoop(result.loop),
                    draft: {
                      planner: result.draft.planner,
                      extracted: result.draft.extracted,
                    },
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
                    success: false,
                    message: `Failed to create loop task: ${
                      error instanceof Error ? error.message : String(error)
                    }`,
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

    tool(
      "listLoopTasks",
      "List native OpenZhiyu Loop tasks for the current user.",
      {
        includeArchived: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include archived loop tasks."),
        limit: z.coerce.number().optional().default(50),
      },
      async ({ includeArchived = false, limit = 50 }) => {
        try {
          const { listLoops } = await import("@/lib/loops");
          const loops = await listLoops(session.user.id, { limit });
          const visibleLoops = includeArchived
            ? loops
            : loops.filter((loop: any) => loop.status !== "archived");

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    loops: visibleLoops.map(summarizeLoop),
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
                    success: false,
                    message: `Failed to list loop tasks: ${
                      error instanceof Error ? error.message : String(error)
                    }`,
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

    tool(
      "setLoopTaskStatus",
      "Pause, resume, or archive a native OpenZhiyu Loop task.",
      {
        loopId: z.string().min(1),
        status: z.enum(["active", "paused", "archived"]),
      },
      async ({ loopId, status }) => {
        try {
          const { updateLoop } = await import("@/lib/loops");
          const loop = await updateLoop(session.user.id, loopId, { status });
          if (!loop) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { success: false, message: `Loop not found: ${loopId}` },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Loop task is now ${status}.`,
                    loop: summarizeLoop(loop),
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
                    success: false,
                    message: `Failed to update loop task: ${
                      error instanceof Error ? error.message : String(error)
                    }`,
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

    tool(
      "deleteLoopTask",
      "Delete a native OpenZhiyu Loop task permanently.",
      {
        loopId: z.string().min(1),
      },
      async ({ loopId }) => {
        try {
          const { deleteLoop } = await import("@/lib/loops");
          const deleted = await deleteLoop(session.user.id, loopId);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: deleted,
                    message: deleted
                      ? `Deleted loop task: ${loopId}`
                      : `Loop not found: ${loopId}`,
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: !deleted,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: false,
                    message: `Failed to delete loop task: ${
                      error instanceof Error ? error.message : String(error)
                    }`,
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
