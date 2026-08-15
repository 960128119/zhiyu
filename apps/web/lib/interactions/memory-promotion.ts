export const INTERACTION_MEMORY_AUTO_PROMOTION_POLICY_VERSION =
  "owner-context-auto-promotion.v1";

export type InteractionMemoryPromotionCandidate = {
  id?: string;
  memoryType: string;
  subject: string;
  content: string;
  status?: string;
  confidence?: number | null;
  tags?: string[];
  sourceEventIds?: string[];
  expiresAt?: Date | string | null;
};

export type InteractionMemoryPromotionDecision = {
  decision: "promote" | "review";
  riskLevel: "low" | "medium" | "high";
  reasons: string[];
};

const LOW_RISK_MEMORY_TYPES = new Set([
  "person",
  "preference",
  "routine",
  "project",
  "relationship",
]);

const HIGH_RISK_MEMORY_TYPES = new Set(["commitment", "boundary", "mistake"]);

const HIGH_RISK_PATTERNS = [
  /转账|收款|付款|借钱|欠款|结算|押金|金额|账单|银行卡|支付宝|微信支付/,
  /身份证|实名|手机号|电话|地址|住址|密码|验证码|账号|隐私/,
  /买入|卖出|加仓|减仓|清仓|股票|交易|止损|建仓|仓位|市值|资金/,
  /诊断|病|药|医院|医生|手术|法律|合同|诉讼|仲裁/,
  /心理|社恐|抑郁|焦虑|精神状态|情绪状态|创伤/,
  /必须|一定要|承诺|保证|负责|惩罚|拉黑|举报/,
];

function normalizedText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function hasFutureExpiry(value: Date | string | null | undefined) {
  if (!value) return true;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

function evidenceCount(candidate: InteractionMemoryPromotionCandidate) {
  return Array.isArray(candidate.sourceEventIds)
    ? new Set(candidate.sourceEventIds.filter(Boolean)).size
    : 0;
}

function containsHighRiskText(candidate: InteractionMemoryPromotionCandidate) {
  const haystack = [
    candidate.memoryType,
    candidate.subject,
    candidate.content,
    ...(candidate.tags ?? []),
  ].join(" ");
  return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(haystack));
}

function requiredConfidence(candidate: InteractionMemoryPromotionCandidate) {
  const memoryType = normalizedText(candidate.memoryType);
  if (memoryType === "project" || memoryType === "relationship") {
    return evidenceCount(candidate) >= 2 ? 85 : 90;
  }
  return 85;
}

export function evaluateInteractionMemoryPromotion(
  candidate: InteractionMemoryPromotionCandidate,
): InteractionMemoryPromotionDecision {
  const reasons: string[] = [];
  const memoryType = normalizedText(candidate.memoryType);
  const confidence =
    typeof candidate.confidence === "number" &&
    Number.isFinite(candidate.confidence)
      ? candidate.confidence
      : 0;
  const sourceCount = evidenceCount(candidate);
  const content = normalizedText(candidate.content);
  const subject = normalizedText(candidate.subject);
  let riskLevel: InteractionMemoryPromotionDecision["riskLevel"] = "low";

  if (candidate.status && candidate.status !== "candidate") {
    return {
      decision: "review",
      riskLevel: "medium",
      reasons: [`status_${candidate.status}_not_candidate`],
    };
  }

  if (!LOW_RISK_MEMORY_TYPES.has(memoryType)) {
    riskLevel = HIGH_RISK_MEMORY_TYPES.has(memoryType) ? "high" : "medium";
    reasons.push(`memory_type_${memoryType || "unknown"}_requires_review`);
  }

  if (containsHighRiskText(candidate)) {
    riskLevel = "high";
    reasons.push("contains_high_risk_terms");
  }

  if (sourceCount < 1) {
    reasons.push("missing_source_evidence");
  }

  if (content.length < 12 || subject.length < 2) {
    reasons.push("too_short_or_ambiguous");
  }

  if (!hasFutureExpiry(candidate.expiresAt)) {
    reasons.push("expired_memory");
  }

  const minConfidence = requiredConfidence(candidate);
  if (confidence < minConfidence) {
    reasons.push(`confidence_below_${minConfidence}`);
  }

  if (riskLevel !== "low" || reasons.length > 0) {
    return {
      decision: "review",
      riskLevel,
      reasons,
    };
  }

  return {
    decision: "promote",
    riskLevel: "low",
    reasons: [
      "low_risk_memory_type",
      `confidence_at_least_${minConfidence}`,
      "source_evidence_present",
    ],
  };
}
