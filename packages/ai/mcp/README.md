# @openzhiyu/mcp

Model Context Protocol (MCP) server configuration types and loader.

## Installation

```sh
pnpm add @openzhiyu/mcp
```

## Usage

```ts
import { loadMcpServers, getMcpConfigPath } from "@openzhiyu/mcp";

// Load MCP servers from ~/.openzhiyu/mcp.json
const servers = await loadMcpServers();
```

## Configuration

By default, reads from `~/.openzhiyu/mcp.json`. Override with `OPENZHIYU_MCP_CONFIG_PATH` environment variable.
