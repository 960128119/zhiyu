<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/images/logo-text-dark.png">
  <img src="apps/web/public/images/logo-text.png" alt="OpenZhiyu Logo" width="400">
</picture>

<p align="center">
<a href="./README.md">English</a> | <a href="./README-zh.md">简体中文</a> | <a href="./README-ja.md">日本語</a>
</p>

**OpenZhiyu 是一个能一直记住你的 AI。**

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-4B4B4B?logo=linux&logoColor=white)](https://openzhiyu.ai)
[![License](https://img.shields.io/badge/License-Apache%202.0-F8D52A?logo=apache)](https://www.apache.org/licenses/LICENSE-2.0)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.com/invite/xkJaJyWcsv)
[![X](https://img.shields.io/badge/X-Follow-000000?logo=x&logoColor=white)](https://x.com/AlloomiAI)

</div>

---

## 什么是 OpenZhiyu？

OpenZhiyu 是一个开源的 AI 工作空间，运行在你的桌面上。它连接你已经在使用的工具——消息应用、邮件、日历、文档、项目追踪器——并为你的人、项目和决策构建一个**全域上下文图谱**。

不同于 ChatGPT 或 Claude——那些 AI 每次对话结束就忘了——OpenZhiyu 的记忆会自己"长出来"，完全可见、可审计。

## 功能特性

|     | 功能模块                                                   | 功能说明                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🧠  | **[全域上下文图谱](https://openzhiyu.ai/docs/memory)**     | 短→中→长期记忆，记忆会自己"长出来"——完全可见、可审计，始终记住你数月前的人、项目、决策                                                                                                                                                   |
| 🔌  | **[平台连接器](https://openzhiyu.ai/docs/connectors)**     | Telegram、WhatsApp、微信、钉钉、飞书、Gmail、Google Calendar、Outlook、Google Docs、X/Twitter、Instagram、LinkedIn、Facebook Messenger、Jira、HubSpot、Asana、iMessage、QQ、RSS — 消息、邮件、日历事件、文档和项目更新持续自动更新上下文 |
| ⏰  | **[主动任务](https://openzhiyu.ai/docs/automation)**       | 智能任务执行，预判你的需求——不只是定时自动化，而是情境感知的行动，在恰当时机自动发生                                                                                                                                                     |
| 🖥️  | **[安全便捷](https://openzhiyu.ai/docs/privacy-security)** | Windows、macOS、Linux 原生桌面应用 — **开箱即用**，安装几分钟就能开始工作，不需要折腾配置；本地优先存储（IndexedDB + SQLite），AES-256 加密，数据不离开你的设备，访问日志可审计                                                          |
| 🔗  | **[开源 Skills](https://openzhiyu.ai/docs/skills)**        | OpenZhiyu Skills 完全开源，可集成到任何 AI Agent — Claude Code、Codex、OpenClaw、Hermes 等                                                                                                                                               |

## Loop Engineering（二开新增）

OpenZhiyu 正在改造成 loop-first 的智能体工程运行时，用来承载可持久化、可审计、可恢复的长期任务：

- **持久化 Loop Runtime**：将 loops、loop runs、loop state 写入 SQLite/Postgres，保留可追溯的执行历史。
- **原生 Loop 执行**：长期目标可以手动触发或按计划触发，并交给桌面端 agent runtime 执行。
- **Loop Spec 与模板**：用经过校验的 JSON-compatible spec 描述可复用自动化流程。
- **验证与审批门禁**：对 loop 输出做校验，对工具调用做策略约束，外部写操作可要求显式审批。
- **Loop Dashboard**：`/loops` 提供状态、运行历史、审批、调度状态和手动执行入口。

当前实现契约和进度记录见 [docs/loop-runtime-roadmap.md](./docs/loop-runtime-roadmap.md)。

<p align="center">
  <img src="screenshots/components.png" alt="架构图" width="100%">
</p>

## 快速开始

**直接下载**（面向终端用户）：

| macOS Apple Silicon                                                                                        | macOS Intel                                                                                              | Linux AMD64                                                                                              | Linux ARM64                                                                                                | Windows                                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [.dmg](https://github.com/melandlabs/openzhiyu/releases/download/v0.5.0/openzhiyu_0.5.0_macOS_aarch64.dmg) | [.dmg](https://github.com/melandlabs/openzhiyu/releases/download/v0.5.0/openzhiyu_0.5.0_macOS_amd64.dmg) | [.deb](https://github.com/melandlabs/openzhiyu/releases/download/v0.5.0/openzhiyu_0.5.0_linux_amd64.deb) | [.deb](https://github.com/melandlabs/openzhiyu/releases/download/v0.5.0/openzhiyu_0.5.0_linux_aarch64.deb) | [.exe](https://github.com/melandlabs/openzhiyu/releases/download/v0.5.0/openzhiyu_0.5.0_windows_amd64.exe) |

完整文档请访问[这里](https://openzhiyu.ai/docs)。

**本地开发**（面向开发者）：

```bash
git clone https://github.com/melandlabs/openzhiyu.git
cd openzhiyu

cp apps/web/.env.example apps/web/.env

# 在 .env 中设置你的 AI 提供商密钥：
#   ANTHROPIC_API_KEY=sk-ant-...
#   LLM_API_KEY=sk-...

pnpm install
pnpm tauri:dev
```

需要 Node.js 22+、pnpm 9+ 和 Rust 1.75+。

## 应用截图

<table>
<tr>
<td><img src="screenshots/app/docx.gif" alt="文档预览" width="100%"></td>
<td><img src="screenshots/app/excel.gif" alt="表格预览" width="100%"></td>
</tr>
<tr>
<td><img src="screenshots/app/automation.gif" alt="自动化" width="100%"></td>
<td><img src="screenshots/app/connectors.gif" alt="连接器" width="100%"></td>
</tr>
</table>

## 安全隐私

- **本地优先**：断网也能用，数据不发送外部服务器
- **可审计**：你可以查看和审计数据访问的时间、原因
- **AES-256 加密**存储数据
- **硬件级隔离处理，无公开网关**

## 反馈

这是早期阶段的软件。我们正在寻找愿意实际安装使用、连接工具并告诉我们问题所在的人。

- [GitHub Issues](https://github.com/melandlabs/openzhiyu/issues) — 报告 bug、安装问题、功能请求
- [Discord](https://discord.com/invite/xkJaJyWcsv) — 讨论、提问、帮助
- [Email](mailto:developer@alloomi.ai) — 其他事宜

## 贡献代码

参见 [CONTRIBUTING.md](./CONTRIBUTING.md)。可以关注 [`good first issue`](https://github.com/melandlabs/openzhiyu/labels/good%20first%20issue) 标签。

## 开源协议

[Apache 2.0](./LICENSE)
