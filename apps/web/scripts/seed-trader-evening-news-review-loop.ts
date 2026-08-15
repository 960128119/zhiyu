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
  {
    computeNextLoopRun,
    createLoop,
    getLoopState,
    listLoopsForWorkshop,
    updateLoop,
    upsertLoopState,
  },
  { appendWorkshopEvent, getWorkshop, listWorkshops, updateWorkshop },
] = await Promise.all([
  import("@/lib/db/adapters"),
  import("@/lib/loops"),
  import("@/lib/workshops/service"),
]);

const USER_ID =
  process.env.DEV_AUTH_USER_ID ?? "dcb1985e-3fe2-42fd-8978-7b04d1772850";

const TRADER_WORKSHOP_ID = "57246c6d-7362-42ff-acb9-dd14257b3aff";
const WORKSHOP_NAME = "操盘交易员";
const LOOP_NAME = "晚间新闻投研复盘";
const MAPPED_SKILL = "paper-trading-post-market-review";

const goal = [
  "每个 A 股交易日 20:30 完成晚间新闻投研复盘。",
  "任务目标不是追逐新闻热点，而是把新闻、公告、市场情绪作为扰动输入，校验模拟盘持仓和未成交委托是否仍然符合交易假设，并形成次日可执行的控制计划。",
  "必须读取模拟盘账户、持仓、成交、未成交委托、当前自选股、当天盘前/盘中/收盘工作记录、车间记忆、市场情绪、持仓与重点自选股相关新闻公告。",
  "输出必须区分：事实观测、新闻/公告影响、风险状态、次日计划、需要继续观察的触发条件。",
  "夜间不直接新增买入成交，不连接真实券商；如未成交模拟委托已经明显失效，可以按规则取消模拟委托并记录原因。新增买入只能写成次日待验证计划。",
  "只消费当前自选股和持仓，不负责扩大或维护自选股池；需要新增/移除自选股时，把原因记录给自选股猎手而不是自己改池。",
  "所有结论必须暴露数据源质量；如果行情、资金流、新闻源降级，要显式写 provider、detail、warning，并降低动作强度。",
  "每次运行必须用 workshopLogEvent 记录 marketNewsSummary、positionNewsReview、orderRiskReview、nextDayControlPlan 四个字段事件，便于验证器识别和后续复盘。",
  "需要沉淀为经验的规则、失败案例、数据源异常，用 workshopWriteMemory 写入车间记忆。",
].join("\n");

const triggerConfig = {
  type: "cron",
  expression: "30 20 * * 1-5",
  timezone: "Asia/Shanghai",
  tradingCalendar: "a-share",
  tradingDayOnly: true,
};

const contextConfig = {
  sources: [
    {
      type: "connector",
      name: "quantPaperGetAccount",
      metadata: { purpose: "读取模拟盘账户、持仓、成交和未成交委托" },
    },
    {
      type: "connector",
      name: "quantPaperGetWatchlist",
      metadata: { purpose: "读取当前自选股，不主动扩池" },
    },
    {
      type: "connector",
      name: "aStockQuote",
      metadata: { purpose: "读取持仓和重点自选股收盘行情" },
    },
    {
      type: "connector",
      name: "aStockTrend",
      metadata: {
        purpose: "读取持仓和重点自选股的日线趋势结构、均线、ATR止损和趋势分",
      },
    },
    {
      type: "connector",
      name: "aStockMarketMood",
      metadata: { purpose: "读取市场情绪、涨跌停、行业热度等背景" },
    },
    {
      type: "connector",
      name: "aStockNewsAndFilings",
      metadata: { purpose: "读取市场新闻、公告和持仓相关新闻" },
    },
    {
      type: "memory",
      name: "workshopMemory",
      query: "操盘交易员 风险规则 数据源异常 交易复盘 失败案例",
    },
    {
      type: "channel",
      name: "workshopEvents",
      filter:
        "today pre-market intraday post-market order proposal memory data-quality",
    },
  ],
  instructions: [
    "先读取 currentTime.localDateWithWeekday，报告日期和星期必须以系统注入时间为准。",
    "先复核模拟盘账户、持仓、成交、未成交委托，再读取行情和市场情绪，最后读取新闻公告。",
    "对持仓和重点自选股必须读取 aStockTrend，把趋势状态、趋势分、均线结构和ATR止损作为次日计划依据。",
    "新闻只作为参考输入，不能覆盖价格、仓位、资金流、数据质量和既有交易纪律。",
    "对每个持仓给出保留、减仓观察、止损观察、取消未成交委托等控制建议，并说明触发条件。",
    "不调用自选股发现和自选股修改工具；发现池子问题时写事件交给自选股猎手。",
    "不在夜间使用 quantPaperPlaceOrder；如取消模拟委托，必须说明委托失效依据。",
  ].join("\n"),
};

const actionPolicy = {
  allowed: [
    "quantPaperGetAccount",
    "quantPaperGetWatchlist",
    "quantPaperCancelOrder",
    "aStockQuote",
    "aStockResearch",
    "aStockSignals",
    "aStockTrend",
    "aStockFundamentals",
    "aStockNewsAndFilings",
    "aStockMarketMood",
    "workshopReadMemory",
    "workshopSearchMemory",
    "workshopGetMemoryEvidence",
    "workshopReadLinkedWorkshopEvents",
    "workshopLogEvent",
    "workshopWriteMemory",
  ],
  requiresApproval: [],
  denied: [
    "quantPaperPlaceOrder",
    "quantMarketDiscoverCandidates",
    "quantPaperProposeWatchlistChange",
    "realBrokerOrder",
    "externalPayment",
    "wechatSendMessage",
    "outboxSend",
    "douyinPublishApprovedDraft",
  ],
};

const verificationConfig = {
  type: "structured_check",
  requiredFields: [
    "marketNewsSummary",
    "positionNewsReview",
    "orderRiskReview",
    "nextDayControlPlan",
  ],
  requiredSources: [
    "quantPaperGetAccount",
    "quantPaperGetWatchlist",
    "aStockTrend",
    "aStockMarketMood",
    "aStockNewsAndFilings",
  ],
  successCriteria: [
    "报告日期和星期使用 currentTime.localDateWithWeekday，不自行猜测。",
    "完成账户、持仓、成交、未成交委托和自选股的闭环复核。",
    "至少检查持仓和重点自选股相关新闻公告，并说明其对交易假设的影响。",
    "把新闻结论降级为参考输入，不用单条新闻直接触发买入。",
    "夜间不调用 quantPaperPlaceOrder，不主动维护自选股池。",
    "输出次日计划时必须包含触发条件、仓位影响、风险边界和数据质量说明。",
    "明确记录 marketNewsSummary、positionNewsReview、orderRiskReview、nextDayControlPlan 四个字段事件。",
  ],
};

const retryPolicy = {
  maxAttempts: 2,
  onFailure: "summarize_and_block",
};

const approvalPolicy = {
  defaultMode: "allow",
  externalWrites: "deny",
};

const escalationPolicy = {
  onBlocked: "notify_user",
  onNeedsApproval: "notify_user",
};

const description =
  "交易日晚间读取市场新闻、公告、情绪和模拟盘状态，校验持仓假设，形成次日交易控制计划。";

async function main() {
  const directWorkshop = await getWorkshop(USER_ID, TRADER_WORKSHOP_ID);
  const workshop =
    directWorkshop ??
    (await listWorkshops(USER_ID, 100)).find(
      (candidate: { name: string }) => candidate.name === WORKSHOP_NAME,
    );

  if (!workshop) {
    throw new Error(`Workshop not found: ${WORKSHOP_NAME}`);
  }

  const loops = await listLoopsForWorkshop({
    userId: USER_ID,
    workshopId: workshop.id,
    limit: 100,
  });
  const existing = loops.find((loop) => loop.name === LOOP_NAME);

  const loopInput = {
    userId: USER_ID,
    workshopId: workshop.id,
    name: LOOP_NAME,
    description,
    goal,
    status: "active" as const,
    triggerConfig,
    contextConfig,
    actionPolicy,
    verificationConfig,
    approvalPolicy,
    retryPolicy,
    escalationPolicy,
  };

  const loop = existing
    ? await updateLoop(USER_ID, existing.id, loopInput)
    : await createLoop({
        ...loopInput,
        initialState: {
          currentPhase: "idle",
          lastObservation:
            "晚间新闻投研复盘任务已创建，等待下一个交易日晚间调度。",
          nextAction:
            "每个 A 股交易日 20:30 自动读取新闻与模拟盘状态并形成次日计划。",
          stateJson: {
            workshopId: workshop.id,
            loopKind: "trader_evening_news_review",
            mappedSkill: MAPPED_SKILL,
          },
        },
      });

  if (!loop) throw new Error(`Loop update failed: ${LOOP_NAME}`);

  const state = await getLoopState(loop.id);
  const nextRun = computeNextLoopRun({
    triggerConfig,
    from: new Date(),
  });
  await upsertLoopState(loop.id, {
    currentPhase: "idle",
    lastObservation: existing
      ? "晚间新闻投研复盘任务已按最新定义更新。"
      : "晚间新闻投研复盘任务已创建。",
    nextAction: nextRun
      ? `下一次计划运行：${nextRun.toISOString()}`
      : "等待调度器计算下一次运行。",
    stateJson: {
      ...(state?.stateJson ?? {}),
      workshopId: workshop.id,
      loopKind: "trader_evening_news_review",
      mappedSkill: MAPPED_SKILL,
      nextScheduledRunAt: nextRun?.toISOString() ?? null,
    },
  });

  const modelConfig = {
    ...(workshop.modelConfig ?? {}),
    primarySkills: [
      ...new Set([
        ...((Array.isArray(workshop.modelConfig?.primarySkills)
          ? workshop.modelConfig.primarySkills
          : []) as string[]),
        MAPPED_SKILL,
        "paper-trading-trend-following",
      ]),
    ],
    loopSkillMap: {
      ...((workshop.modelConfig?.loopSkillMap &&
      typeof workshop.modelConfig.loopSkillMap === "object"
        ? workshop.modelConfig.loopSkillMap
        : {}) as Record<string, string>),
      [LOOP_NAME]: MAPPED_SKILL,
    },
  };

  await updateWorkshop(USER_ID, workshop.id, {
    modelConfig,
    changeSource: "seed_trader_evening_news_review_loop",
    recordWorkVersion: false,
  });

  await appendWorkshopEvent({
    workshopId: workshop.id,
    loopId: loop.id,
    type: existing ? "updated" : "created",
    title: existing
      ? "晚间新闻投研复盘任务已更新"
      : "晚间新闻投研复盘任务已创建",
    body: [
      "新增一个面向夜间决策的操盘交易员任务：交易日 20:30 读取市场新闻、公告、情绪和模拟盘状态。",
      "该任务只把新闻作为扰动输入，用来校验持仓与未成交委托，不在夜间直接新增买入，也不维护自选股池。",
      "任务已映射到 paper-trading-post-market-review Skill，并要求记录 marketNewsSummary、positionNewsReview、orderRiskReview、nextDayControlPlan 四个字段事件。",
    ].join("\n"),
    metadata: {
      source: "seed_trader_evening_news_review_loop",
      loopName: LOOP_NAME,
      mappedSkill: MAPPED_SKILL,
      nextScheduledRunAt: nextRun?.toISOString() ?? null,
    },
  });

  console.log(
    JSON.stringify(
      {
        action: existing ? "updated" : "created",
        workshopId: workshop.id,
        loopId: loop.id,
        loopName: loop.name,
        triggerConfig,
        mappedSkill: MAPPED_SKILL,
        nextScheduledRunAt: nextRun?.toISOString() ?? null,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} finally {
  await closeDb();
}
