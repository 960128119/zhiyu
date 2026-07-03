export type WorkshopStatus = "active" | "paused" | "archived";

export type WorkshopAutonomyLevel = "observe" | "draft" | "auto";

export type WorkshopRunStatus =
  | "running"
  | "completed"
  | "paused"
  | "failed"
  | "cancelled";

export type WorkshopSourceType =
  | "url"
  | "rss"
  | "file"
  | "manual"
  | "knowledge"
  | "connector";

export type WorkshopDirectiveScope = "current_run" | "persistent";

export type WorkshopDirectiveStatus = "active" | "consumed" | "archived";

export type WorkshopMemoryKind =
  | "finding"
  | "hypothesis"
  | "watchlist"
  | "preference"
  | "boundary"
  | "source_note"
  | "mistake"
  | "outbox_summary";

export type WorkshopOutboxStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "sent"
  | "rejected"
  | "blocked"
  | "failed";

export type WorkshopEventVisibility = "user" | "debug";

export type WorkshopJson = Record<string, unknown>;

export interface CreateWorkshopInput {
  userId: string;
  name: string;
  mission: string;
  status?: WorkshopStatus;
  autonomyLevel?: WorkshopAutonomyLevel;
  boundaryPolicy?: WorkshopJson;
  modelConfig?: WorkshopJson;
}

export interface UpdateWorkshopInput {
  name?: string;
  mission?: string;
  status?: WorkshopStatus;
  autonomyLevel?: WorkshopAutonomyLevel;
  boundaryPolicy?: WorkshopJson;
  modelConfig?: WorkshopJson;
}

export interface CreateWorkshopRunInput {
  workshopId: string;
  triggerReason?: WorkshopJson;
  ccSessionId?: string | null;
  inputSnapshot?: WorkshopJson;
}

export interface CompleteWorkshopRunInput {
  runId: string;
  status: WorkshopRunStatus;
  outputSummary?: string | null;
  error?: string | null;
}

export interface AppendWorkshopEventInput {
  workshopId: string;
  runId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  metadata?: WorkshopJson;
  visibility?: WorkshopEventVisibility;
}

export interface AddWorkshopSourceInput {
  workshopId: string;
  type: WorkshopSourceType;
  name: string;
  uri?: string | null;
  content?: string | null;
  config?: WorkshopJson;
  enabled?: boolean;
}

export interface AddWorkshopDirectiveInput {
  workshopId: string;
  runId?: string | null;
  content: string;
  priority?: number;
  scope?: WorkshopDirectiveScope;
}

export interface AddWorkshopMemoryInput {
  workshopId: string;
  kind: WorkshopMemoryKind;
  content: string;
  confidence?: number;
  tags?: string[];
  sourceEventIds?: string[];
  expiresAt?: Date | null;
}

export interface CreateWorkshopOutboxDraftInput {
  workshopId: string;
  runId?: string | null;
  channel?: "wechat_desktop";
  recipientName?: string | null;
  message: string;
  status?: WorkshopOutboxStatus;
  confidence?: number;
  riskLevel?: "low" | "medium" | "high";
  sourceEventIds?: string[];
  boundaryResult?: WorkshopJson;
}
