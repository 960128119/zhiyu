import Module from "node:module";

type ModuleLoad = (
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
) => unknown;

const moduleWithLoad = Module as unknown as { _load: ModuleLoad };
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only" || request.includes("server-only")) {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

const [
  { closeDb },
  { computeNextLoopRun, createLoop, listLoopsForWorkshop, updateLoop, upsertLoopState },
  { appendWorkshopEvent, getWorkshop, updateWorkshop },
] = await Promise.all([
  import("@/lib/db/adapters"),
  import("@/lib/loops"),
  import("@/lib/workshops/service"),
]);

type JsonRecord = Record<string, unknown>;

const USER_ID =
  process.env.DEV_AUTH_USER_ID ?? "dcb1985e-3fe2-42fd-8978-7b04d1772850";

const TRADER_WORKSHOP_ID = "57246c6d-7362-42ff-acb9-dd14257b3aff";
const WATCHLIST_WORKSHOP_ID = "3153b95e-df02-4d31-9949-04f19e4eb8d4";

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function appendMissing(value: unknown, additions: string[]) {
  return unique([...stringArray(value), ...additions]);
}

function removeItems(value: unknown, removals: string[]) {
  const removalSet = new Set(removals.map((item) => item.toLowerCase()));
  return stringArray(value).filter((item) => !removalSet.has(item.toLowerCase()));
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function tradingDayCron(expression: string) {
  return {
    type: "cron",
    expression,
    timezone: "Asia/Shanghai",
    tradingCalendar: "a-share",
    tradingDayOnly: true,
  };
}

function commonTraderReadTools() {
  return [
    "quantPaperGetAccount",
    "quantPaperGetWatchlist",
    "aStockTrendStateHistory",
    "aStockTrendSystem",
    "aStockTrendStrategyStats",
    "aStockQuote",
    "aStockSignals",
    "aStockMarketMood",
    "aStockNewsAndFilings",
    "workshopReadMemory",
    "workshopSearchMemory",
    "workshopGetMemoryEvidence",
    "workshopReadLinkedWorkshopEvents",
    "workshopLogEvent",
    "workshopWriteMemory",
  ];
}

async function upsertLoop(input: {
  workshopId: string;
  name: string;
  description: string;
  goal: string;
  triggerConfig: JsonRecord;
  contextConfig: JsonRecord;
  actionPolicy: JsonRecord;
  verificationConfig: JsonRecord;
  approvalPolicy: JsonRecord;
  retryPolicy: JsonRecord;
  escalationPolicy: JsonRecord;
}) {
  const loops = await listLoopsForWorkshop({
    userId: USER_ID,
    workshopId: input.workshopId,
    limit: 100,
  });
  const existing = loops.find((loop: { name: string }) => loop.name === input.name);
  const payload = {
    userId: USER_ID,
    workshopId: input.workshopId,
    name: input.name,
    description: input.description,
    goal: input.goal,
    status: "active" as const,
    triggerConfig: input.triggerConfig,
    contextConfig: input.contextConfig,
    actionPolicy: input.actionPolicy,
    verificationConfig: input.verificationConfig,
    approvalPolicy: input.approvalPolicy,
    retryPolicy: input.retryPolicy,
    escalationPolicy: input.escalationPolicy,
  };

  const loop = existing
    ? await updateLoop(USER_ID, existing.id, payload)
    : await createLoop({
        ...payload,
        initialState: {
          currentPhase: "idle",
          lastObservation: `${input.name} has been configured for quant learning control.`,
          nextAction: "Waiting for the next scheduled A-share trading-day run.",
          stateJson: {
            workshopId: input.workshopId,
            createdFrom: "repair_quant_learning_control_loops",
          },
        },
      });
  if (!loop) throw new Error(`Loop upsert failed: ${input.name}`);

  const nextRun = computeNextLoopRun({
    triggerConfig: input.triggerConfig,
    from: new Date(),
  });
  await upsertLoopState(loop.id, {
    currentPhase: "idle",
    lastObservation: `${input.name} configured or refreshed.`,
    nextAction: nextRun
      ? `Next scheduled run: ${nextRun.toISOString()}`
      : "Waiting for scheduler.",
    stateJson: {
      workshopId: input.workshopId,
      nextScheduledRunAt: nextRun?.toISOString() ?? null,
      repairedBy: "repair_quant_learning_control_loops",
    },
  });

  return {
    id: loop.id,
    name: loop.name,
    action: existing ? "updated" : "created",
    nextScheduledRunAt: nextRun?.toISOString() ?? null,
  };
}

async function repairTraderWorkshop() {
  const workshop = await getWorkshop(USER_ID, TRADER_WORKSHOP_ID);
  if (!workshop) throw new Error("Trader workshop not found");

  const modelConfig = { ...asRecord(workshop.modelConfig) };
  const boundaryPolicy = { ...asRecord(workshop.boundaryPolicy) };
  const loopSkillMap = { ...asRecord(modelConfig.loopSkillMap) };

  const patchedModelConfig = {
    ...modelConfig,
    role: "paper_trader",
    tradingStyle: "learning_by_small_paper_trades",
    allowedTools: appendMissing(modelConfig.allowedTools, [
      "quantPaperGetAccount",
      "quantPaperGetWatchlist",
      "quantPaperPlaceOrder",
      "quantPaperCancelOrder",
      "aStockTrendSystem",
      "aStockTrendStateHistory",
      "aStockTrendStrategyStats",
    ]),
    disallowedTools: appendMissing(modelConfig.disallowedTools, [
      "quantMarketDiscoverCandidates",
      "quantPaperProposeWatchlistChange",
    ]),
    primarySkills: appendMissing(modelConfig.primarySkills, [
      "paper-trading-pre-market-plan",
      "paper-trading-intraday-check",
      "paper-trading-post-market-review",
      "paper-trading-trend-following",
    ]),
    observationTools: appendMissing(modelConfig.observationTools, [
      "aStockTrendSystem",
      "aStockTrendStateHistory",
      "aStockTrendStrategyStats",
    ]),
    loopSkillMap: {
      ...loopSkillMap,
      "盘前交易计划": "paper-trading-pre-market-plan",
      "盘中学习型模拟交易巡检": "paper-trading-intraday-check",
      "盘后交易复盘": "paper-trading-post-market-review",
    },
    learningTradePolicy: {
      mode: "paper_only",
      objective: "learn from observable small simulated trades, not prove profit",
      intradayExperimentAllowed: true,
      preferSmallPositionPct: "3%-8%",
      requireNoActionBlocker: true,
      requireTradeThesis: true,
      maxBuyDeviationPct: 2,
    },
  };
  const patchedBoundaryPolicy = {
    ...boundaryPolicy,
    mode: "auto",
    externalMessages: "blocked",
    hardDeniedActions: appendMissing(
      removeItems(boundaryPolicy.hardDeniedActions, [
        "quantPaperPlaceOrder",
        "quantPaperCancelOrder",
      ]),
      [
        "bash",
        "shell",
        "exec",
        "Bash",
        "Edit",
        "Write",
        "rm",
        "delete",
        "remove",
        "drop",
        "truncate",
        "placeOrder",
        "executeOrder",
        "submitOrder",
        "buy",
        "sell",
        "trade",
        "makePayment",
        "payInvoice",
        "transferMoney",
        "wireTransfer",
        "wechatDesktopSendMessage",
        "douyinPublishApprovedDraft",
        "quantMarketDiscoverCandidates",
        "quantPaperProposeWatchlistChange",
        "deleteLoopTask",
      ],
    ),
    customInstructions: [
      "这是模拟盘操盘车间。允许自主调用内部模拟盘读取、模拟限价下单/撤单和 A 股研究行情工具。",
      "quantPaperPlaceOrder 和 quantPaperCancelOrder 只操作内部 paper-trading simulator，不是真实券商交易，不属于真实资金动作。",
      "禁止任何真实交易、真实资金划转、真实券商连接或对外发送交易指令。",
      "禁止发现、加入、移除、替换或提议调整自选股；自选股池维护交给自选股猎手车间。",
      "不得调用 quantMarketDiscoverCandidates 或 quantPaperProposeWatchlistChange。",
      "为了在交易中学习，盘中 loop 在边界允许时应优先提交小仓位模拟实验单；不能交易时必须写清楚具体 blocker。",
      "对外消息默认禁止。",
    ].join("\n"),
  };

  if (
    !sameJson(patchedModelConfig, workshop.modelConfig) ||
    !sameJson(patchedBoundaryPolicy, workshop.boundaryPolicy)
  ) {
    await updateWorkshop(USER_ID, workshop.id, {
      modelConfig: patchedModelConfig,
      boundaryPolicy: patchedBoundaryPolicy,
      changeSource: "repair_quant_learning_control_loops",
      recordWorkVersion: true,
    });
  }

  const loops = [];
  loops.push(
    await upsertLoop({
      workshopId: workshop.id,
      name: "盘前交易计划",
      description: "交易日 09:05 读取账户、自选股和趋势状态，生成当天可验证的交易触发计划。",
      goal: [
        "每个 A 股交易日盘前建立可执行观察计划。",
        "必须读取模拟盘账户、自选股、趋势状态、市场情绪和必要新闻。",
        "输出弱持仓处理条件、候选替换观察、可下单触发价、计划数量、止损/失效条件。",
        "盘前不提交新增模拟买入；只形成盘中可验证计划和 blocker。",
      ].join("\n"),
      triggerConfig: tradingDayCron("5 9 * * 1-5"),
      contextConfig: {
        sources: [
          { type: "connector", name: "quantPaperGetAccount" },
          { type: "connector", name: "quantPaperGetWatchlist" },
          { type: "connector", name: "aStockTrendSystem" },
          { type: "connector", name: "aStockMarketMood" },
          { type: "memory", name: "tradingMemory", query: "操盘交易员 规则 失败 触发价 止损 学习" },
        ],
        instructions:
          "形成当天盘中验证表：每个重点标的都要有触发价/失效价/计划动作/不交易 blocker。不要只写泛泛观察。",
      },
      actionPolicy: {
        allowed: commonTraderReadTools(),
        requiresApproval: [],
        denied: ["quantPaperPlaceOrder", "quantPaperCancelOrder", "quantMarketDiscoverCandidates", "quantPaperProposeWatchlistChange"],
      },
      verificationConfig: {
        type: "structured_check",
        requiredFields: ["accountState", "watchlistState", "tradeTriggers", "riskBlockers", "nextControlAction"],
        requiredSources: ["quantPaperGetAccount", "quantPaperGetWatchlist", "aStockTrendSystem"],
        successCriteria: [
          "读取当前账户和自选股行情",
          "为盘中交易给出具体触发价、计划数量和失效条件",
          "不在盘前提交新增买入委托",
        ],
      },
      approvalPolicy: { defaultMode: "allow", externalWrites: "deny" },
      retryPolicy: { maxAttempts: 2, onFailure: "summarize_and_block" },
      escalationPolicy: { onBlocked: "notify_user", onNeedsApproval: "notify_user" },
    }),
  );

  loops.push(
    await upsertLoop({
      workshopId: workshop.id,
      name: "盘中学习型模拟交易巡检",
      description: "交易日 10:20 和 14:05 做模拟盘巡检；满足边界时提交小仓位实验单，否则记录可学习 blocker。",
      goal: [
        "在交易中学习：每个交易日盘中至少完成一次可执行交易判断。",
        "先处理弱持仓，再比较自选股内更强替代标的。",
        "如果卖出、减仓、买入或替换条件满足，必须调用 quantPaperPlaceOrder 提交内部模拟限价委托。",
        "如果不下单，必须记录精确 blocker：数据、价格偏离、趋势、仓位、T+1、现金、涨跌停、风险收益比或市场状态。",
        "小仓位实验优先，通常 3%-8% 初始资金；所有买入必须带 plannedPrice、maxBuyDeviationPct=2 和 tradeThesis。",
      ].join("\n"),
      triggerConfig: tradingDayCron("20 10,14 * * 1-5"),
      contextConfig: {
        sources: [
          { type: "connector", name: "quantPaperGetAccount" },
          { type: "connector", name: "quantPaperGetWatchlist" },
          { type: "connector", name: "aStockTrendStateHistory" },
          { type: "connector", name: "aStockTrendSystem" },
          { type: "connector", name: "aStockTrendStrategyStats" },
          { type: "connector", name: "aStockSignals" },
          { type: "connector", name: "aStockNewsAndFilings" },
        ],
        instructions: [
          "必须先读取账户和自选股，再读取趋势系统。",
          "把结论落到 actionTaken：order_submitted / hold_with_blocker / reduce_submitted / cancel_submitted。",
          "不要为了显得谨慎而只观察；模拟盘目标是用小额受控实验产生反馈。",
        ].join("\n"),
      },
      actionPolicy: {
        allowed: appendMissing(commonTraderReadTools(), [
          "quantPaperPlaceOrder",
          "quantPaperCancelOrder",
        ]),
        requiresApproval: [],
        denied: ["quantMarketDiscoverCandidates", "quantPaperProposeWatchlistChange"],
      },
      verificationConfig: {
        type: "structured_check",
        requiredFields: [
          "accountState",
          "trendStateReview",
          "rotationDecision",
          "trendFollowDecision",
          "actionTaken",
          "riskAssessment",
          "learningFeedback",
        ],
        requiredSources: ["quantPaperGetAccount", "quantPaperGetWatchlist", "aStockTrendSystem"],
        successCriteria: [
          "若交易条件满足，同轮调用 quantPaperPlaceOrder 或 quantPaperCancelOrder",
          "若未交易，actionTaken 必须列出具体 blocker，不允许只有笼统观望",
          "买入必须包含 plannedPrice、maxBuyDeviationPct 和 tradeThesis",
          "只交易当前自选股，且只操作内部模拟盘",
        ],
      },
      approvalPolicy: { defaultMode: "allow", externalWrites: "deny" },
      retryPolicy: { maxAttempts: 2, onFailure: "summarize_and_block" },
      escalationPolicy: { onBlocked: "notify_user", onNeedsApproval: "notify_user" },
    }),
  );

  loops.push(
    await upsertLoop({
      workshopId: workshop.id,
      name: "盘后交易复盘",
      description: "交易日 15:45 复盘订单、成交、错过的动作和策略样本，沉淀下一轮学习。",
      goal: [
        "盘后复盘模拟盘订单、成交、持仓表现、未交易 blocker 和盘中学习样本。",
        "必须读取账户、成交、趋势策略统计和自选股状态。",
        "输出今天学到了什么、哪些规则过严/过松、明天要验证什么。",
        "盘后不新增买入，必要时只记录次日触发计划。",
      ].join("\n"),
      triggerConfig: tradingDayCron("45 15 * * 1-5"),
      contextConfig: {
        sources: [
          { type: "connector", name: "quantPaperGetAccount" },
          { type: "connector", name: "quantPaperGetWatchlist" },
          { type: "connector", name: "aStockTrendSystem" },
          { type: "connector", name: "aStockTrendStrategyStats" },
          { type: "memory", name: "tradingMemory", query: "操盘交易员 成交 blocker 复盘 学习 策略样本" },
        ],
        instructions:
          "复盘必须把没有交易的原因也当成样本，写入 learningFeedback 或 workshop memory。",
      },
      actionPolicy: {
        allowed: commonTraderReadTools(),
        requiresApproval: [],
        denied: ["quantPaperPlaceOrder", "quantMarketDiscoverCandidates", "quantPaperProposeWatchlistChange"],
      },
      verificationConfig: {
        type: "structured_check",
        requiredFields: ["accountState", "orderReview", "missedTradeReview", "strategyLearning", "nextDayControlPlan"],
        requiredSources: ["quantPaperGetAccount", "aStockTrendStrategyStats"],
        successCriteria: [
          "复盘订单、成交和未交易 blocker",
          "沉淀至少一条可复用学习或明确说明无新学习",
          "形成次日可验证控制计划",
        ],
      },
      approvalPolicy: { defaultMode: "allow", externalWrites: "deny" },
      retryPolicy: { maxAttempts: 2, onFailure: "summarize_and_block" },
      escalationPolicy: { onBlocked: "notify_user", onNeedsApproval: "notify_user" },
    }),
  );

  await appendWorkshopEvent({
    workshopId: workshop.id,
    type: "updated",
    title: "操盘交易员学习型模拟交易闭环已修复",
    body: [
      "已移除 quantPaperPlaceOrder/quantPaperCancelOrder 的错误硬拒绝。",
      "已创建或刷新盘前、盘中、盘后三个交易日 Loop。",
      "盘中 Loop 明确要求在边界允许时提交小仓位模拟实验单；不交易时必须记录具体 blocker。",
    ].join("\n"),
    metadata: {
      source: "repair_quant_learning_control_loops",
      loops,
      paperOnly: true,
    },
  });

  return loops;
}

async function repairWatchlistWorkshop() {
  const workshop = await getWorkshop(USER_ID, WATCHLIST_WORKSHOP_ID);
  if (!workshop) throw new Error("Watchlist workshop not found");

  const modelConfig = { ...asRecord(workshop.modelConfig) };
  const patchedModelConfig = {
    ...modelConfig,
    role: "watchlist_selector",
    primaryTools: appendMissing(modelConfig.primaryTools, [
      "quantMarketDiscoverCandidates",
      "quantPaperGetWatchlist",
      "quantPaperGetAccount",
      "quantPaperProposeWatchlistChange",
      "aStockTrendSystem",
      "aStockSignals",
      "aStockMarketMood",
      "workshopWriteMemory",
    ]),
    primarySkills: appendMissing(modelConfig.primarySkills, [
      "watchlist-selection-control",
    ]),
    disallowedTools: appendMissing(removeItems(modelConfig.disallowedTools, [
      "quantPaperGetAccount",
    ]), [
      "quantPaperPlaceOrder",
      "quantPaperCancelOrder",
    ]),
    explorationPolicy: {
      minThemesPerRun: 2,
      promotionBias: "promote when evidence is good enough for learning, not only when certainty is perfect",
      requireConcreteProposalWhenBetterReplacementFound: true,
      noProposalRequiresBlocker: true,
    },
  };
  if (!sameJson(patchedModelConfig, workshop.modelConfig)) {
    await updateWorkshop(USER_ID, workshop.id, {
      modelConfig: patchedModelConfig,
      changeSource: "repair_quant_learning_control_loops",
      recordWorkVersion: true,
    });
  }

  const loop = await upsertLoop({
    workshopId: workshop.id,
    name: "交易日收盘后自选股筛选",
    description: "交易日 16:20 扫描候选、复核自选股并在证据足够时自动应用自选股调整。",
    goal: [
      "维护候选池和核心/交易自选股池，为操盘交易员提供可交易学习样本。",
      "每次至少扫描两个主题或风格方向，调用 quantMarketDiscoverCandidates。",
      "发现明显优于现有弱标的的候选时，必须调用 quantPaperProposeWatchlistChange。",
      "如果连续维持现状，必须写清楚阻止提案的具体原因：估值、趋势、流动性、数据质量、持仓保护或证据不足。",
    ].join("\n"),
    triggerConfig: tradingDayCron("20 16 * * 1-5"),
    contextConfig: {
      sources: [
        { type: "connector", name: "quantPaperGetWatchlist" },
        { type: "connector", name: "quantPaperGetAccount" },
        { type: "connector", name: "quantMarketDiscoverCandidates" },
        { type: "connector", name: "aStockTrendSystem" },
        { type: "connector", name: "aStockSignals" },
        { type: "connector", name: "aStockMarketMood" },
        { type: "memory", name: "watchlistMemory", query: "自选股 猎手 候选 提案 blocker 学习" },
      ],
      instructions: [
        "不要只复述当前自选股；每次必须做候选发现。",
        "候选不是立刻交易，但高质量候选要通过 quantPaperProposeWatchlistChange 晋升到 active core/trading watchlist。",
        "保持持仓和未成交委托标的受保护，不从行情跟踪宇宙移除。",
      ].join("\n"),
    },
    actionPolicy: {
      allowed: [
        "quantMarketDiscoverCandidates",
        "quantPaperGetWatchlist",
        "quantPaperGetAccount",
        "quantPaperProposeWatchlistChange",
        "aStockTrendSystem",
        "aStockSignals",
        "aStockMarketMood",
        "workshopReadMemory",
        "workshopSearchMemory",
        "workshopWriteMemory",
        "workshopLogEvent",
      ],
      requiresApproval: [],
      denied: ["quantPaperPlaceOrder", "quantPaperCancelOrder"],
    },
    verificationConfig: {
      type: "structured_check",
      requiredFields: [
        "marketScanSummary",
        "currentWatchlistReview",
        "candidatePool",
        "watchlistDecision",
        "proposalOrBlocker",
      ],
      requiredSources: ["quantPaperGetWatchlist", "quantPaperGetAccount", "quantMarketDiscoverCandidates"],
      successCriteria: [
        "每次至少调用 quantMarketDiscoverCandidates 做候选发现",
        "有明确 add/remove/replace 时调用 quantPaperProposeWatchlistChange",
        "无提案时记录具体 blocker，不允许只写维持现状",
      ],
    },
    approvalPolicy: { defaultMode: "allow", externalWrites: "deny" },
    retryPolicy: { maxAttempts: 2, onFailure: "summarize_and_block" },
    escalationPolicy: { onBlocked: "notify_user", onNeedsApproval: "notify_user" },
  });

  await appendWorkshopEvent({
    workshopId: workshop.id,
    type: "updated",
    title: "自选股猎手候选发现与提案闭环已加强",
    body: [
      "已要求每次收盘后扫描候选方向。",
      "发现更优替代时必须调用自选股调整工具；不提案时必须记录具体 blocker。",
    ].join("\n"),
    metadata: {
      source: "repair_quant_learning_control_loops",
      loop,
    },
  });

  return loop;
}

try {
  const traderLoops = await repairTraderWorkshop();
  const watchlistLoop = await repairWatchlistWorkshop();
  console.log(
    JSON.stringify(
      {
        traderWorkshopId: TRADER_WORKSHOP_ID,
        watchlistWorkshopId: WATCHLIST_WORKSHOP_ID,
        traderLoops,
        watchlistLoop,
      },
      null,
      2,
    ),
  );
} finally {
  await closeDb();
}
