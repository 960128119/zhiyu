# GitHub 开源量化系统选型对比

查看日期：2026-07-18

## 结论

如果目标是“个人使用、能尽快落地、方便接入个人工作台”，默认推荐 **Freqtrade**。它的边界最清楚：加密货币交易机器人，内置回测、数据下载、参数优化、Dry-run、实盘、WebUI、Telegram 控制、REST API 和 WebSocket。对个人工作台来说，它不是一个只能研究的库，而是一个可以作为独立服务挂起来、再由工作台读取状态和下发控制命令的系统。

如果你的重点是 **A 股/国内期货/CTP/中文生态**，推荐 **VeighNa/vn.py**。如果你的目标是 **多资产、专业级策略引擎，愿意承担更高工程复杂度**，再考虑 **QuantConnect LEAN** 或 **NautilusTrader**。

## 推荐排序

| 排名 | 项目 | 更适合谁 | 为什么 |
| --- | --- | --- | --- |
| 1 | Freqtrade | 个人量化工作台、加密货币策略、需要尽快跑起来 | Docker/本地安装成熟；回测、Dry-run、实盘、WebUI、REST API、WebSocket 都有；工作台接入成本最低 |
| 2 | VeighNa/vn.py | 国内股票/期货/期权/CTP 生态、中文用户 | 中国量化交易生态成熟，GUI 和交易网关体系完整；适合国内券商/期货实盘链路 |
| 3 | QuantConnect LEAN | 多资产研究与实盘统一、希望接近机构级引擎 | 事件驱动、模块化，支持 Python/C#，CLI 可本地 backtest/live；但接入和运维重量较高 |
| 4 | NautilusTrader | 高性能、多交易场所、偏工程化交易系统 | Rust 内核 + Python 控制面，回测/仿真/实盘架构一致；个人使用可行但学习曲线较陡 |
| 5 | Jesse | 加密货币策略研究 + 可视化/纸交易 | Python 友好，面向自定义策略、回测、优化、纸交易/实盘；生态和接口广度弱于 Freqtrade |
| 6 | Hummingbot | 做市、套利、DEX/CEX 高频交易机器人 | 交易场所覆盖广，适合 market making/arbitrage；不是通用量化研究工作台 |
| 7 | Qlib | AI/ML 因子研究、模型训练、组合研究 | 研究链路很强，覆盖数据、模型、回测、组合优化、订单执行概念；离个人实盘工作台较远 |
| 8 | FinRL / FinRL-X | 强化学习、AI-native 量化实验 | 适合 DRL/AI 研究和原型；FinRL-X 更新但仍偏新，个人实盘落地风险较高 |

## 候选项目对比

| 项目 | GitHub 热度/活跃迹象 | 能力覆盖 | 接入个人工作台难度 | 主要风险 |
| --- | --- | --- | --- | --- |
| [Freqtrade](https://github.com/freqtrade/freqtrade) | GitHub 显示约 52.4k stars、10.9k forks、32k+ commits；release 2026.6 约 2 周前 | 加密货币现货/合约、回测、参数优化、FreqAI、Dry-run、实盘、WebUI、Telegram、REST API/WebSocket | 低。作为 Docker 服务运行，工作台通过 REST/WebSocket 接入 | 资产范围主要是 crypto；交易 API 暴露要严格做本地/VPN/鉴权 |
| [VeighNa/vn.py](https://github.com/vnpy/vnpy) | 约 41k stars、12.1k forks；最新 release 4.4.0，2026-05-14 | Python 量化交易平台，网关、CTA 策略、回测、GUI/Station，国内生态友好 | 中。GUI/桌面生态强，若做 Web 工作台需包装服务/API | 国内实盘依赖具体券商/期货接口；部署形态偏桌面和插件体系 |
| [QuantConnect LEAN](https://github.com/QuantConnect/Lean) | 约 20.6k stars、5k forks；2026-07 有提交迹象 | 事件驱动专业交易引擎，Python/C#，本地 CLI 支持 research/backtest/optimize/live | 中高。可 CLI/Docker 化，但结果与控制层需要自行封装 | C# 代码占大头；学习和配置成本较高；数据/券商插件要按场景补齐 |
| [NautilusTrader](https://github.com/nautechsystems/nautilus_trader) | 约 24k+ stars；release 1.230.0 Beta 于 2026-06-29 | Rust-native 多资产多场所交易引擎，研究、确定性仿真、实盘统一架构，Python 策略控制面 | 中高。pip/Docker 可跑，但要理解事件模型与适配器 | 生产级但复杂；Windows/Conda 支持注意事项较多；v2 仍有 RC/测试提示 |
| [Jesse](https://github.com/jesse-ai/jesse) | 约 8.2k stars、1.2k forks | 加密货币策略框架，回测、优化、纸交易/实盘、监控、通知、图表、ML/Monte Carlo | 中。适合策略研究工作台，但接口和生态不如 Freqtrade 成熟 | 适用范围偏 crypto；部分能力可能依赖其商业/云侧生态 |
| [Hummingbot](https://github.com/hummingbot/hummingbot) | 约 19.1k stars、4.8k forks；v2.15.0 于 2026-06-16 | CEX/DEX 自动交易，做市、套利、订单簿、高频交易机器人 | 中。Docker/服务化可行，但面向交易机器人而非通用投研 | 策略类型偏做市/套利；治理和 connector 合并机制有额外门槛 |
| [Microsoft Qlib](https://github.com/microsoft/qlib) | GitHub 大型项目；README 定位为 AI-oriented Quant investment platform | 数据处理、模型训练、回测、alpha、风险模型、组合优化、订单执行概念 | 中。适合接入“研究模块”，不适合作为交易执行核心 | 实盘链路弱于交易系统；数据准备和 ML 工程成本高 |
| [FinRL / FinRL-X](https://github.com/AI4Finance-Foundation/FinRL) | FinRL 约 15.7k stars；FinRL-X/FinRL-Trading 约 3.4k stars，v1.0.0 2026-03-25 | 强化学习/AI-native 量化，FinRL-X 声称更面向生产、多账户、风控 | 中高。适合作为 AI 策略实验模块 | 新架构仍年轻；RL 策略稳定性、可解释性和实盘风控压力更大 |

## 为什么默认选 Freqtrade

1. 它的“个人落地闭环”最完整：下载数据、写策略、回测、lookahead/recursive 分析、参数优化、Dry-run、实盘、WebUI、Telegram、REST API 基本都在同一个项目内。
2. 它天然适合接入个人工作台：官方文档说明 REST API 可本地开启，提供 `/ping`、`/start`、`/stop`、`/status`、`/profit`、`/balance`、`/trades`、`/performance` 等端点，并提供 WebSocket 消息流。
3. 运维简单：官方推荐 Docker Quickstart；数据库默认 sqlite；个人 VPS 或本机都能跑。
4. 风险边界清楚：先 Dry-run，再小资金实盘；工作台只需要先做只读监控，再逐步开放控制命令。

## 接入个人工作台的建议架构

第一阶段：只读监控。

- Freqtrade 独立 Docker 服务运行。
- 工作台后端通过 `freqtrade-client` 或 REST API 拉取 `/status`、`/profit`、`/balance`、`/trades`、`/performance`。
- 工作台前端展示机器人状态、当前持仓、今日/本周收益、策略表现、最近交易、日志摘要。

第二阶段：受控操作。

- 只开放 `start`、`stop`、`pause/stopbuy`、`reload_config` 这类低风险控制。
- 所有交易类强操作，如 `forceenter`、`forceexit`，必须做二次确认、审计日志和权限隔离。

第三阶段：研究闭环。

- 把 backtest/hyperopt 结果入库，形成策略卡片。
- 用工作台管理策略版本、参数、回测区间、Dry-run 表现和实盘表现。
- 如果未来要做 AI 因子研究，可把 Qlib 作为独立研究服务接进来，而不是替换 Freqtrade 的执行层。

## 什么时候不选 Freqtrade

- 你主要交易 A 股、国内期货或需要 CTP：选 VeighNa/vn.py。
- 你要构建跨股票、期权、期货、外汇、Crypto 的专业统一引擎：选 LEAN 或 NautilusTrader。
- 你主要做强化学习论文复现、AI 策略实验：选 Qlib/FinRL-X 作为研究模块。
- 你只做做市/跨交易所套利：看 Hummingbot。

## 来源

- Freqtrade GitHub README: https://github.com/freqtrade/freqtrade
- Freqtrade REST API: https://www.freqtrade.io/en/stable/rest-api/
- Freqtrade Docker Quickstart: https://www.freqtrade.io/en/stable/docker_quickstart/
- VeighNa/vn.py GitHub README: https://github.com/vnpy/vnpy
- QuantConnect LEAN GitHub README: https://github.com/QuantConnect/Lean
- LEAN CLI docs: https://www.lean.io/docs/v2/lean-cli/
- NautilusTrader GitHub README: https://github.com/nautechsystems/nautilus_trader
- NautilusTrader release page: https://github.com/nautechsystems/nautilus_trader/releases
- Jesse GitHub README: https://github.com/jesse-ai/jesse
- Hummingbot GitHub README: https://github.com/hummingbot/hummingbot
- Microsoft Qlib GitHub README: https://github.com/microsoft/qlib
- FinRL GitHub README: https://github.com/AI4Finance-Foundation/FinRL
- FinRL-Trading GitHub README: https://github.com/AI4Finance-Foundation/FinRL-Trading
