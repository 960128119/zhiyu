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
  { listLoopsForWorkshop, updateLoop },
  { appendWorkshopEvent, getWorkshop, listWorkshops, updateWorkshop },
] = await Promise.all([
  import("@/lib/db/adapters"),
  import("@/lib/loops"),
  import("@/lib/workshops/service"),
]);

type JsonRecord = Record<string, unknown>;

const USER_ID =
  process.env.DEV_AUTH_USER_ID ?? "dcb1985e-3fe2-42fd-8978-7b04d1772850";
const TRADER_WORKSHOP_ID = "57246c6d-7362-42ff-acb9-dd14257b3aff";
const TRADER_WORKSHOP_NAME = "操盘交易员";
const TREND_SKILL = "paper-trading-trend-following";
const TREND_TOOL = "aStockTrend";

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

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function appendMissing(values: unknown, additions: string[]) {
  return unique([...stringArray(values), ...additions]);
}

function mapSkillForLoop(loopName: string) {
  if (/盘前|开盘前|pre-?market/i.test(loopName)) {
    return "paper-trading-pre-market-plan";
  }
  if (/盘中|巡检|intraday/i.test(loopName)) {
    return "paper-trading-intraday-check";
  }
  if (/盘后|收盘|晚间|post-?market|review/i.test(loopName)) {
    return "paper-trading-post-market-review";
  }
  return null;
}

function isTradingLoop(loop: {
  name: string;
  actionPolicy: unknown;
  contextConfig: unknown;
}) {
  const mappedSkill = mapSkillForLoop(loop.name);
  if (mappedSkill) return true;
  const actionPolicy = asRecord(loop.actionPolicy);
  const allowed = stringArray(actionPolicy.allowed).join(" ");
  const context = JSON.stringify(asRecord(loop.contextConfig));
  return /quantPaper|aStock|股票|行情|模拟盘|操盘|交易/i.test(
    `${allowed} ${context} ${loop.name}`,
  );
}

function patchContextConfig(value: unknown): JsonRecord {
  const context = { ...asRecord(value) };
  const sources = Array.isArray(context.sources) ? [...context.sources] : [];
  const hasTrendSource = sources.some(
    (source) => asRecord(source).name === TREND_TOOL,
  );
  if (!hasTrendSource) {
    sources.push({
      type: "connector",
      name: TREND_TOOL,
      metadata: {
        purpose: "读取日线趋势结构、均线、ATR止损、趋势阶段和趋势分",
      },
    });
  }
  const instructions = String(context.instructions ?? "").trim();
  const trendInstruction =
    "交易判断前必须读取 aStockTrend，并把趋势状态、趋势分、MA/ATR止损、失效条件和风险收益比写入交易假设或不操作原因。";
  return {
    ...context,
    sources,
    instructions: instructions.includes(trendInstruction)
      ? instructions
      : instructions
        ? `${instructions}\n${trendInstruction}`
        : trendInstruction,
  };
}

function patchActionPolicy(value: unknown): JsonRecord {
  const policy = { ...asRecord(value) };
  return {
    ...policy,
    allowed: appendMissing(policy.allowed, [TREND_TOOL]),
  };
}

function patchVerificationConfig(value: unknown): JsonRecord {
  const verification = { ...asRecord(value) };
  const requiredSources = stringArray(verification.requiredSources);
  const shouldRequireTrend =
    requiredSources.includes("aStockQuote") ||
    requiredSources.includes("quantPaperGetWatchlist") ||
    requiredSources.includes("quantPaperGetAccount");
  return {
    ...verification,
    requiredSources: shouldRequireTrend
      ? appendMissing(requiredSources, [TREND_TOOL])
      : requiredSources,
    requiredFields: appendMissing(verification.requiredFields, [
      "trendStateReview",
    ]),
  };
}

async function main() {
  const directWorkshop = await getWorkshop(USER_ID, TRADER_WORKSHOP_ID);
  const workshop =
    directWorkshop ??
    (await listWorkshops(USER_ID, 100)).find(
      (candidate: { name: string }) => candidate.name === TRADER_WORKSHOP_NAME,
    );

  if (!workshop) {
    throw new Error(`Workshop not found: ${TRADER_WORKSHOP_NAME}`);
  }

  const loops = await listLoopsForWorkshop({
    userId: USER_ID,
    workshopId: workshop.id,
    limit: 100,
  });

  const modelConfig = { ...asRecord(workshop.modelConfig) };
  const loopSkillMap = { ...asRecord(modelConfig.loopSkillMap) } as Record<
    string,
    string
  >;

  let patchedLoops = 0;
  for (const loop of loops) {
    if (!isTradingLoop(loop)) continue;
    const mappedSkill = mapSkillForLoop(loop.name);
    if (mappedSkill && !loopSkillMap[loop.name]) {
      loopSkillMap[loop.name] = mappedSkill;
    }

    const actionPolicy = patchActionPolicy(loop.actionPolicy);
    const contextConfig = patchContextConfig(loop.contextConfig);
    const verificationConfig = patchVerificationConfig(loop.verificationConfig);

    if (
      !sameJson(actionPolicy, loop.actionPolicy) ||
      !sameJson(contextConfig, loop.contextConfig) ||
      !sameJson(verificationConfig, loop.verificationConfig)
    ) {
      await updateLoop(USER_ID, loop.id, {
        actionPolicy,
        contextConfig,
        verificationConfig,
      });
      patchedLoops += 1;
    }
  }

  const patchedModelConfig = {
    ...modelConfig,
    primarySkills: appendMissing(modelConfig.primarySkills, [TREND_SKILL]),
    allowedTools: appendMissing(modelConfig.allowedTools, [TREND_TOOL]),
    observationTools: appendMissing(modelConfig.observationTools, [TREND_TOOL]),
    loopSkillMap,
  };
  const modelChanged = !sameJson(patchedModelConfig, workshop.modelConfig);

  if (modelChanged) {
    await updateWorkshop(USER_ID, workshop.id, {
      modelConfig: patchedModelConfig,
      changeSource: "repair_trader_trend_following",
      recordWorkVersion: false,
    });
  }

  if (modelChanged || patchedLoops > 0) {
    await appendWorkshopEvent({
      workshopId: workshop.id,
      type: "updated",
      title: "操盘交易员已接入趋势跟随方法论",
      body: [
        "已追加 paper-trading-trend-following Skill。",
        "已追加 aStockTrend 工具到车间与现有 Loop。",
        "后续模拟交易需要在下单或不操作原因中说明趋势状态、趋势分、MA/ATR止损、失效条件和风险收益比。",
      ].join("\n"),
      metadata: {
        source: "repair_trader_trend_following",
        trendSkill: TREND_SKILL,
        trendTool: TREND_TOOL,
        patchedLoops,
        modelChanged,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        workshopId: workshop.id,
        workshopName: workshop.name,
        trendSkill: TREND_SKILL,
        trendTool: TREND_TOOL,
        patchedLoops,
        modelChanged,
        loopSkillMap,
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
