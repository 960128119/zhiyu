import { auth } from "@/app/(auth)/auth";
import { assertWorkAccess, listWorkEvents } from "@/lib/work-runtime";
import { subscribeWorkshopEvents } from "@/lib/workshops/event-bus";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

const ACTIVE_POLL_INTERVAL_MS = 1000;
const IDLE_POLL_INTERVAL_MS = 5000;

function parseAfterSeq(value: string | null) {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  try {
    await assertWorkAccess({ userId: session.user.id, workId: id });
  } catch {
    return new Response("Workshop not found", { status: 404 });
  }

  const afterSeq = parseAfterSeq(request.nextUrl.searchParams.get("after"));
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let unsubscribe: (() => void) | undefined;
      let closed = false;
      let lastSentSeq = afterSeq;
      const sentIds = new Set<string>();
      const pendingBySeq = new Map<number, unknown>();
      const sendNow = (event: unknown) => {
        if (closed) return;
        const workshopEvent = event as { id?: unknown; seq?: unknown };
        if (typeof workshopEvent.id === "string") {
          if (sentIds.has(workshopEvent.id)) return;
          sentIds.add(workshopEvent.id);
        }
        if (typeof workshopEvent.seq === "number") {
          lastSentSeq = Math.max(lastSentSeq, workshopEvent.seq);
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };
      const flushPending = () => {
        while (pendingBySeq.has(lastSentSeq + 1)) {
          const next = pendingBySeq.get(lastSentSeq + 1);
          pendingBySeq.delete(lastSentSeq + 1);
          sendNow(next);
        }
      };
      const send = (event: unknown) => {
        const workshopEvent = event as { seq?: unknown };
        if (typeof workshopEvent.seq !== "number") {
          sendNow(event);
          return;
        }
        if (workshopEvent.seq <= lastSentSeq) {
          sendNow(event);
          return;
        }
        pendingBySeq.set(workshopEvent.seq, event);
        flushPending();
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(pollTimer);
        unsubscribe?.();
        try {
          controller.close();
        } catch {}
      };
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {}
      }, 30000);
      let pollTimer: ReturnType<typeof setTimeout>;
      const poll = async () => {
        let nextInterval = IDLE_POLL_INTERVAL_MS;
        try {
          const events = await listWorkEvents({
            userId: session.user.id,
            workId: id,
            afterSeq: lastSentSeq,
            limit: 100,
          });
          if (events.length > 0) nextInterval = ACTIVE_POLL_INTERVAL_MS;
          for (const event of events) {
            send(event);
          }
        } catch (error) {
          send({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "Workshop stream poll failed",
          });
        } finally {
          if (!closed) pollTimer = setTimeout(poll, nextInterval);
        }
      };
      pollTimer = setTimeout(poll, ACTIVE_POLL_INTERVAL_MS);

      try {
        const history = await listWorkEvents({
          userId: session.user.id,
          workId: id,
          afterSeq: afterSeq || undefined,
          limit: 100,
        });
        for (const event of history) {
          send(event);
        }

        unsubscribe = subscribeWorkshopEvents(id, send);
        request.signal.addEventListener("abort", close);
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof Error ? error.message : "Workshop stream failed",
        });
        close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
