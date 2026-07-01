<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/images/logo-text-dark.png">
  <img src="apps/web/public/images/logo-text.png" alt="OpenZhiyu Logo" width="400">
</picture>

**An AI That Always Remembers You.**

<p align="center">
<a href="./README.md">English</a> | <a href="./README-zh.md">简体中文</a> | <a href="./README-ja.md">日本語</a>
</p>

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-4B4B4B?logo=linux&logoColor=white)](https://openzhiyu.ai)
[![License](https://img.shields.io/badge/License-Apache%202.0-F8D52A?logo=apache)](https://www.apache.org/licenses/LICENSE-2.0)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.com/invite/xkJaJyWcsv)
[![X](https://img.shields.io/badge/X-Follow-000000?logo=x&logoColor=white)](https://x.com/AlloomiAI)

</div>

---

## What is OpenZhiyu?

OpenZhiyu is an open-source AI workspace that runs on your desktop. It connects to the tools you already use — messaging apps, email, calendar, documents, project trackers — and builds a **Holistic Context Graph** of your people, projects, and decisions.

## Features

|     | Capability                                                               | What it does                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🧠  | **[Holistic Context Graph](https://openzhiyu.ai/docs/memory)**           | Short → mid → long-term memory that grows on its own — visible, auditable, and always remembering your people, projects, and decisions across months                                                                                                                             |
| 🔌  | **[Platform Connectors](https://openzhiyu.ai/docs/connectors)**          | Telegram, WhatsApp, WeChat, DingTalk, Feishu, Gmail, Google Calendar, Outlook, Google Docs, X/Twitter, Instagram, LinkedIn, Facebook Messenger, Jira, HubSpot, Asana, iMessage, QQ, RSS — messages, emails, calendar events, documents, and project updates flow in continuously |
| ⏰  | **[Proactive Tasks](https://openzhiyu.ai/docs/automation)**              | Intelligent task execution that anticipates your needs — not just scheduled automation, but context-aware actions that happen at the right moment                                                                                                                                |
| 🖥️  | **[Security & Ease of Use](https://openzhiyu.ai/docs/privacy-security)** | Native app for Windows, macOS, Linux Desktop Apps — **works out of the box**, minutes to set up, no configuration wrestling; local-first storage with IndexedDB + SQLite, AES-256 encryption, no data leaves your machine, auditable access logs                                 |
| 🔗  | **[Open Sourced Skills](https://openzhiyu.ai/docs/skills)**              | OpenZhiyu Skills are open-source and can be integrated into any Agent — Claude Code, Codex, OpenClaw, Hermes, and more.                                                                                                                                                          |

## Loop Engineering

OpenZhiyu is being extended with a loop-first engineering runtime for durable,
inspectable agent work:

- **Durable loop runtime**: loops, loop runs, and loop state are persisted in
  SQLite/Postgres with recoverable execution history.
- **Native loop execution**: long-running goals can be triggered manually or on
  a schedule, then executed by the desktop agent runtime.
- **Loop specs and templates**: repeatable automation patterns are represented
  as validated JSON-compatible specs.
- **Verification and approval gates**: loop outputs are checked, tool usage is
  policy-gated, and external writes can require explicit approval.
- **Loop dashboard**: `/loops` exposes loop status, run history, approvals,
  scheduler state, and manual execution controls.

See [docs/loop-runtime-roadmap.md](./docs/loop-runtime-roadmap.md) for the
current implementation contract and progress log.

<p align="center">
  <img src="screenshots/components.png" alt="Architecture" width="100%">
</p>

## Quick Start

**Download directly** (for end users):

| macOS Apple Silicon                                                                                        | macOS Intel                                                                                              | Linux AMD64                                                                                              | Linux ARM64                                                                                                | Windows                                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [.dmg](https://github.com/melandlabs/openzhiyu/releases/download/v0.5.0/openzhiyu_0.5.0_macOS_aarch64.dmg) | [.dmg](https://github.com/melandlabs/openzhiyu/releases/download/v0.5.0/openzhiyu_0.5.0_macOS_amd64.dmg) | [.deb](https://github.com/melandlabs/openzhiyu/releases/download/v0.5.0/openzhiyu_0.5.0_linux_amd64.deb) | [.deb](https://github.com/melandlabs/openzhiyu/releases/download/v0.5.0/openzhiyu_0.5.0_linux_aarch64.deb) | [.exe](https://github.com/melandlabs/openzhiyu/releases/download/v0.5.0/openzhiyu_0.5.0_windows_amd64.exe) |

Full documentation is available at [here](https://openzhiyu.ai/docs).

**Develop locally** (for developers):

```bash
git clone https://github.com/melandlabs/openzhiyu.git
cd openzhiyu

cp apps/web/.env.example apps/web/.env

# Set your AI provider keys in .env:
#   ANTHROPIC_API_KEY=sk-ant-...
#   LLM_API_KEY=sk-...

pnpm install
pnpm dev
```

`pnpm dev` starts the local development dependencies first, then starts the web
app on port `3515`:

- Docker Postgres container `openzhiyu-postgres` on `127.0.0.1:5432`.
- WeChat desktop companion service on `127.0.0.1:8765`.
- Next.js web dev server for `apps/web`.

Useful variants:

```bash
pnpm dev:deps
pnpm dev:web
pnpm tauri:dev
```

You can skip optional local dependency startup when needed:

```bash
OPENZHIYU_SKIP_POSTGRES=1 pnpm dev
OPENZHIYU_SKIP_WECHAT=1 pnpm dev
```

Requires Node.js 22+, pnpm 9+, Docker Desktop for local Postgres, and Rust
1.75+ for Tauri development.

## App Screenshots

<table>
<tr>
<td><img src="screenshots/app/docx.gif" alt="Document preview" width="100%"></td>
<td><img src="screenshots/app/excel.gif" alt="Spreadsheet preview" width="100%"></td>
</tr>
<tr>
<td><img src="screenshots/app/automation.gif" alt="Automation" width="100%"></td>
<td><img src="screenshots/app/connectors.gif" alt="Connectors" width="100%"></td>
</tr>
</table>

## Security

- **Local-first**: works offline, no data sent to external servers
- **Auditable**: you can see and audit exactly when and why data is accessed
- **AES-256 encryption** for stored data
- **Hardware-isolated processing, no public gateways**

## Feedback

This is early-stage software. We're looking for people who'll actually install it, connect their tools, and tell us what's broken.

- [GitHub Issues](https://github.com/melandlabs/openzhiyu/issues) — bugs, install problems, feature requests
- [Discord](https://discord.com/invite/xkJaJyWcsv) — discussion, questions, help
- [Email](mailto:developer@alloomi.ai) — anything else

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Look for [`good first issue`](https://github.com/melandlabs/openzhiyu/labels/good%20first%20issue) labels.

## License

[Apache 2.0](./LICENSE)
