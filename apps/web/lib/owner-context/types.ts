export type OwnerContextScene =
  | "chat"
  | "workshop"
  | "loop"
  | "task"
  | "quant"
  | "dashboard";

export type OwnerContextState =
  | "raw"
  | "candidate"
  | "confirmed"
  | "dismissed"
  | "deleted";

export type OwnerContextSource = "wechat" | "interaction_wiki" | "graph";

export type OwnerContextKind =
  | "task"
  | "memory"
  | "note"
  | "person"
  | "project"
  | "relation"
  | "raw_event";

export type OwnerContextRequest = {
  userId: string;
  scene?: OwnerContextScene;
  query?: string;
  conversationId?: string;
  relatedPeople?: string[];
  relatedEntities?: string[];
  maxItems?: number;
};

export type OwnerContextItem = {
  id: string;
  kind: OwnerContextKind;
  title: string;
  body: string;
  state: OwnerContextState;
  source: OwnerContextSource;
  confidence?: number | null;
  tags?: string[];
  sourceEventIds?: string[];
  metadata?: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type OwnerContextConversation = {
  conversationId: string;
  conversationName: string;
  conversationType: string;
  lastMessageAt: string | null;
  messageCount: number;
};

export type OwnerContextGraphSummary = {
  entityCount: number;
  relationCount: number;
  activeRelationCount: number;
  evidenceCount: number;
  people: OwnerContextItem[];
  projects: OwnerContextItem[];
  relations: OwnerContextItem[];
};

export type OwnerContextStats = {
  rawEventCount: number;
  taskCount: number;
  candidateCount: number;
  confirmedMemoryCount: number;
  noteCount: number;
  graphEntityCount: number;
  graphRelationCount: number;
};

export type OwnerContextSnapshot = {
  scene: OwnerContextScene;
  generatedAt: string;
  stats: OwnerContextStats;
  tasks: OwnerContextItem[];
  candidates: OwnerContextItem[];
  confirmedMemories: OwnerContextItem[];
  notes: OwnerContextItem[];
  recentEvents: OwnerContextItem[];
  conversations: OwnerContextConversation[];
  graph: OwnerContextGraphSummary;
  warnings: string[];
};

export type OwnerKnowledgeDashboard = OwnerContextSnapshot & {
  interfaceVersion: "owner-context.v1";
};

export type OwnerKnowledgeResetResult = {
  deletedNotes: number;
  deletedTasks: number;
  deletedMemories: number;
  deletedGraphEntities: number;
  deletedGraphRelations: number;
  deletedGraphEvidence: number;
  deletedGraphCount: number;
  deletedCount: number;
};

export type OwnerContextCandidateKind = "task" | "memory";

export type OwnerContextCandidateDecision = "confirmed" | "dismissed";

export type OwnerContextCandidateListResult = {
  generatedAt: string;
  statuses: string[];
  candidates: OwnerContextItem[];
  stats: {
    taskCount: number;
    memoryCount: number;
    totalCount: number;
  };
};

export type OwnerContextCandidateReviewResult = {
  kind: OwnerContextCandidateKind;
  decision: OwnerContextCandidateDecision;
  item: OwnerContextItem;
};
