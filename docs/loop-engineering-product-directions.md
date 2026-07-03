# Loop Engineering Product Directions

## Core Definition

Loop Engineering is not just scheduled automation. It is a product pattern for packaging work that needs repeated observation, judgment, action, and review into a long-running AI workspace.

The valuable unit is not a cron job. The valuable unit is a role that keeps responsibility for something over time.

Examples:

- My A-share researcher
- My project steward
- My customer follow-up assistant
- My content operations assistant
- My code health monitor
- My daily review coach

Each loop should have:

- Goal: what it is responsible for over time
- Trigger: time, message, webpage change, database change, manual command, or external event
- Context: chats, documents, projects, contacts, watchlists, or knowledge bases it can read
- Tools: WeChat, Feishu, browser, database, code tools, search, or market data APIs
- Permission: what can be automatic and what needs user approval
- Memory: what it has learned from previous runs
- Trace: why it made each decision
- Evaluation: whether the result was useful and what should improve next time

## 1. Personal And Team Operations

This is the easiest direction to land in a daily-use product.

Typical work:

- Summarize project progress, group messages, document changes, and daily decisions
- Monitor Feishu, WeChat, email, or project tools for important updates
- Detect unhandled tasks and remind the right person
- Generate weekly project summaries and risk lists
- Maintain a project dashboard automatically

Why Loop Engineering fits:

- Information is scattered
- People do not want to manually check everything
- The work repeats but still requires judgment
- The user needs a trusted assistant that watches continuously

Good first product form:

> A project steward loop that watches one project, summarizes progress every day, and alerts the user when blockers or unanswered questions appear.

## 2. Sales, Customer Support, And Private Domain Growth

This direction has strong commercial value because it connects directly to revenue and customer retention.

Typical work:

- Detect high-intent customers from chat history
- Remind the user when a customer has not replied for several days
- Classify customer stage: inquiry, comparison, hesitation, ready to buy, churn risk
- Draft follow-up messages based on recent conversation context
- Summarize customer objections and frequently asked questions
- Alert the user when negative sentiment appears in a group

Why Loop Engineering fits:

- Customer relationships are continuous
- Context matters more than one-off automation
- Blind automatic replies are risky, so approval controls are valuable
- The loop can become a customer relationship guardian

Good first product form:

> A customer follow-up loop that watches selected WeChat or Feishu contacts, drafts follow-ups, and asks for one-click approval before sending.

## 3. A-Share Researcher

This is likely the simplest direction to build from the current product capabilities. The main challenge is information source access, not the agent workflow.

Typical work:

- Monitor a user's stock watchlist
- Fetch daily price movement, volume, turnover, and capital flow
- Read new company announcements
- Track news, policy changes, industry events, and market sentiment
- Detect abnormal moves and explain possible causes
- Produce a daily or weekly research brief

Recommended MVP information sources:

- Announcements: CNINFO, Shanghai Stock Exchange, Shenzhen Stock Exchange, Beijing Stock Exchange
- Market and financial data: AkShare, Tushare, BaoStock
- News and market sentiment: East Money, CLS, Securities Times, China Securities Journal, Shanghai Securities News
- Macro data: National Bureau of Statistics, People's Bank of China, CSRC, customs data

Why Loop Engineering fits:

- Research is a continuous monitoring task
- The user does not need all data, only meaningful changes
- The agent can combine market data, announcements, news, and watchlist context
- The output can be pushed to WeChat or Feishu as a daily brief

Good first product form:

> My A-share watchlist researcher: every trading day, check selected stocks, explain abnormal moves, summarize new announcements and news, and produce a concise report.

## 4. Industry Intelligence And Competitor Monitoring

This direction is useful for founders, product managers, investors, consultants, and BD teams.

Typical work:

- Monitor competitor websites, release notes, hiring pages, social media, and public accounts
- Track industry keywords and policy changes
- Detect sudden increases in attention around a company or topic
- Produce weekly intelligence reports
- Compare changes across competitors

Why Loop Engineering fits:

- Intelligence work is periodic but not mechanical
- The important part is filtering and interpretation
- The loop can accumulate knowledge about what the user cares about

Good first product form:

> A competitor radar loop that watches selected companies and reports product, pricing, hiring, and messaging changes every week.

## 5. Software Engineering And Project Maintenance

This direction is close to Codex and Claude Code style workflows, but positioned as a long-running project guardian.

Typical work:

- Check whether the project starts successfully every day
- Monitor CI, GitHub issues, pull requests, and dependency changes
- Detect failing tests, flaky builds, security alerts, and performance regressions
- Summarize technical debt and risky modules
- Create investigation notes or draft fixes

Why Loop Engineering fits:

- Engineering maintenance is continuous
- Failures require diagnosis, not just notification
- A loop can preserve project context and historical decisions

Good first product form:

> A code health loop that watches one repo, runs selected checks, summarizes regressions, and proposes fixes with traceable evidence.

## 6. Content Creation And Media Operations

This direction is attractive for solo creators and small teams.

Typical work:

- Collect topic ideas from news, social platforms, competitors, and user feedback
- Maintain a content idea backlog
- Draft outlines based on a creator's style
- Track performance after publishing
- Recommend which topics to continue or abandon

Why Loop Engineering fits:

- Content operations depend on repeated observation and iteration
- A loop can turn scattered inspiration into structured assets
- The agent can learn what performs well over time

Good first product form:

> A content operations loop that collects daily topic ideas, ranks them, drafts outlines, and reviews published content performance.

## 7. Personal Life And Self Management

This direction may create strong user attachment, though monetization may be weaker than business workflows.

Typical work:

- Summarize the user's day from calendar, chat, notes, and tasks
- Remind the user of long-term goals
- Detect neglected plans or repeated delays
- Generate weekly reflection reports
- Maintain a lightweight personal memory system

Why Loop Engineering fits:

- Personal management is continuous and context-heavy
- The loop can act as a personal operating system background process
- Memory and tone matter more than raw automation

Good first product form:

> A daily review coach that summarizes the day, tracks long-term goals, and gently reminds the user of neglected commitments.

## Product Recommendation

The strongest near-term direction is:

> Personal and small-team message + project + follow-up loops.

Reason:

- It matches the current OpenZhiyu capabilities: chat, connectors, Loop, agent execution, WeChat and Feishu integrations
- It has clear daily usage scenarios
- It can start with approval-based actions before moving to more autonomous execution
- It naturally grows into customer support, project operations, and personal assistant workflows

The easiest first vertical is:

> A-share watchlist researcher.

Reason:

- The workflow is clear
- The action risk is low because the first output can be a report, not a transaction
- The main missing piece is reliable data ingestion
- It demonstrates the Loop Engineering concept well: continuous monitoring, judgment, memory, and report delivery

## Suggested MVP Path

1. Build a watchlist-based A-share researcher loop.
2. Use AkShare or Tushare for market and financial data.
3. Use CNINFO and exchange websites for announcements.
4. Generate a daily report with:
   - Watchlist movement
   - Abnormal price or volume changes
   - New announcements
   - Important news
   - Risk signals
   - Follow-up questions
5. Deliver the report to the Loop page first.
6. Then add optional delivery to WeChat or Feishu.
7. Add memory so the loop remembers previous concerns and checks whether they changed.

## Long-Term Product Vision

OpenZhiyu can become an AI Loop Workspace where users create long-running intelligent roles instead of one-off tasks.

The product should help users say:

> I want an agent to be responsible for this area over time.

Then OpenZhiyu turns that intent into:

- A structured loop
- Clear permissions
- A repeatable execution trace
- Memory
- Tool access
- Continuous evaluation

That is the difference between a scheduler and Loop Engineering.
