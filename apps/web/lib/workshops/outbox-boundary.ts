import type { Workshop, WorkshopOutboxItem } from "@/lib/db/schema";

export type WorkshopOutboxBoundaryResult = {
  allowed: boolean;
  requiresApproval: boolean;
  status: "passed" | "blocked";
  violations: string[];
  warnings: string[];
  checkedAt: string;
};

function parseAllowedRecipients() {
  const raw = process.env.WECHAT_DESKTOP_ALLOWED_RECIPIENTS ?? "";
  return raw
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasTradingOrderLanguage(message: string) {
  return /(\b下单\b|立即买入|马上买入|帮我买|帮我卖|全仓|清仓|做多|做空|挂单|市价单|限价单)/i.test(
    message,
  );
}

function hasFinancialSignalLanguage(message: string) {
  return /(股票|股价|财报|买入|卖出|加仓|减仓|目标价|止损|止盈|做多|做空|NVDA|TSLA|AAPL|MSFT|TSM|AMD)/i.test(
    message,
  );
}

export function evaluateWorkshopOutboxBoundary(input: {
  workshop: Workshop;
  outbox: WorkshopOutboxItem;
}): WorkshopOutboxBoundaryResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  const recipient = input.outbox.recipientName?.trim();
  const message = input.outbox.message.trim();
  const allowedRecipients = parseAllowedRecipients();

  if (input.outbox.channel !== "wechat_desktop") {
    violations.push("只支持微信桌面 outbox。");
  }
  if (!recipient) {
    violations.push("缺少微信收件人。");
  }
  if (!message) {
    violations.push("消息为空。");
  }
  if (message.length > 2000) {
    violations.push("消息超过 2000 字，先压缩再发送。");
  }
  if (
    recipient &&
    allowedRecipients.length > 0 &&
    !allowedRecipients.includes(recipient)
  ) {
    violations.push("收件人不在 WECHAT_DESKTOP_ALLOWED_RECIPIENTS 白名单内。");
  }
  if (hasTradingOrderLanguage(message)) {
    violations.push("消息像交易指令，工坊不允许通过微信发送交易下单/操作指令。");
  }

  if (hasFinancialSignalLanguage(message)) {
    warnings.push("金融相关提醒需要包含来源、置信度和反方风险。");
  }
  if (input.outbox.confidence < 60) {
    warnings.push("置信度低于 60%，建议只保留为草稿或补充来源。");
  }
  if (!input.outbox.sourceEventIds || input.outbox.sourceEventIds.length === 0) {
    warnings.push("草稿未关联 sourceEventIds，请确认消息内已经写清来源。");
  }
  if (input.workshop.autonomyLevel !== "auto") {
    warnings.push("当前车间不是 auto 模式，需要用户确认后发送。");
  }

  return {
    allowed: violations.length === 0,
    requiresApproval: true,
    status: violations.length === 0 ? "passed" : "blocked",
    violations,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}
