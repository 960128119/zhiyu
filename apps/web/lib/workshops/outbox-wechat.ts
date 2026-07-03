import {
  previewWechatDesktopMessage,
  sendWechatDesktopMessage,
} from "@/lib/wechat-desktop/client";
import type { Workshop, WorkshopOutboxItem } from "@/lib/db/schema";
import { appendWorkshopEvent, updateWorkshopOutboxItem } from "./service";
import { evaluateWorkshopOutboxBoundary } from "./outbox-boundary";

type PreviewState = {
  confirmToken?: string;
  expiresAt?: string;
  preview?: unknown;
};

function getPreviewState(boundaryResult: Record<string, unknown>): PreviewState {
  const preview = boundaryResult.wechatPreview;
  return preview && typeof preview === "object"
    ? (preview as PreviewState)
    : {};
}

function firstAllowedWechatRecipient() {
  return (process.env.WECHAT_DESKTOP_ALLOWED_RECIPIENTS ?? "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .find(Boolean);
}

function resolveRecipientName(outbox: WorkshopOutboxItem) {
  return (
    outbox.recipientName?.trim() ||
    process.env.WORKSHOP_DEFAULT_WECHAT_RECIPIENT?.trim() ||
    process.env.WECHAT_DESKTOP_DEFAULT_RECIPIENT?.trim() ||
    firstAllowedWechatRecipient() ||
    "文件传输助手"
  );
}

function withRecipient(
  outbox: WorkshopOutboxItem,
  recipientName: string,
): WorkshopOutboxItem {
  return {
    ...outbox,
    recipientName,
  };
}

export async function previewWorkshopOutboxWechat(input: {
  workshop: Workshop;
  outbox: WorkshopOutboxItem;
}) {
  const recipientName = resolveRecipientName(input.outbox);
  const effectiveOutbox = withRecipient(input.outbox, recipientName);
  const boundary = evaluateWorkshopOutboxBoundary({
    workshop: input.workshop,
    outbox: effectiveOutbox,
  });
  const baseBoundaryResult = {
    ...(input.outbox.boundaryResult ?? {}),
    boundary,
  };

  if (!boundary.allowed) {
    const updated = await updateWorkshopOutboxItem(
      input.workshop.id,
      input.outbox.id,
      {
        status: "blocked",
        recipientName,
        boundaryResult: baseBoundaryResult,
      },
    );
    await appendWorkshopEvent({
      workshopId: input.workshop.id,
      runId: input.outbox.runId,
      type: "outbox_blocked",
      title: "Outbox draft blocked by boundary",
      body: boundary.violations.join("\n"),
      metadata: { outboxId: input.outbox.id, boundary },
    });
    return { ok: false, outbox: updated, boundary };
  }

  const preview = await previewWechatDesktopMessage({
    recipientName,
    message: input.outbox.message,
  });
  const expiresAt = new Date(
    Date.now() + preview.expiresInSeconds * 1000,
  ).toISOString();
  const boundaryResult = {
    ...baseBoundaryResult,
    wechatPreview: {
      confirmToken: preview.confirmToken,
      expiresAt,
      preview: preview.preview,
    },
  };

  const updated = await updateWorkshopOutboxItem(
    input.workshop.id,
    input.outbox.id,
    {
      status: "pending_approval",
      recipientName,
      boundaryResult,
    },
  );
  await appendWorkshopEvent({
    workshopId: input.workshop.id,
    runId: input.outbox.runId,
    type: "outbox_preview_ready",
    title: "WeChat preview ready",
    body: `Waiting for confirmation to send to: ${recipientName}`,
    metadata: {
      outboxId: input.outbox.id,
      preview: preview.preview,
      warnings: boundary.warnings,
    },
  });

  return { ok: true, outbox: updated, boundary, preview };
}

export async function sendWorkshopOutboxWechat(input: {
  workshop: Workshop;
  outbox: WorkshopOutboxItem;
}) {
  const recipientName = resolveRecipientName(input.outbox);
  const effectiveOutbox = withRecipient(input.outbox, recipientName);
  const boundary = evaluateWorkshopOutboxBoundary({
    workshop: input.workshop,
    outbox: effectiveOutbox,
  });
  if (!boundary.allowed) {
    const updated = await updateWorkshopOutboxItem(
      input.workshop.id,
      input.outbox.id,
      {
        status: "blocked",
        recipientName,
        boundaryResult: {
          ...(input.outbox.boundaryResult ?? {}),
          boundary,
        },
      },
    );
    return { ok: false, outbox: updated, boundary };
  }

  const previewState = getPreviewState(input.outbox.boundaryResult ?? {});
  let confirmToken = previewState.confirmToken;
  const expiresAtMs = previewState.expiresAt
    ? new Date(previewState.expiresAt).getTime()
    : 0;

  if (!confirmToken || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    const refreshed = await previewWechatDesktopMessage({
      recipientName,
      message: input.outbox.message,
    });
    confirmToken = refreshed.confirmToken;
  }

  const sent = await sendWechatDesktopMessage({
    recipientName,
    message: input.outbox.message,
    confirmToken,
  });

  const updated = await updateWorkshopOutboxItem(
    input.workshop.id,
    input.outbox.id,
    {
      status: "sent",
      recipientName,
      sentAt: new Date(),
      boundaryResult: {
        ...(input.outbox.boundaryResult ?? {}),
        boundary,
        sent,
      },
    },
  );
  await appendWorkshopEvent({
    workshopId: input.workshop.id,
    runId: input.outbox.runId,
    type: "outbox_sent",
    title: "WeChat message sent",
    body: `Sent to: ${recipientName}`,
    metadata: {
      outboxId: input.outbox.id,
      sent,
    },
  });

  return { ok: true, outbox: updated, boundary, sent };
}
