#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const host = process.env.WECHAT_DESKTOP_HOST || "127.0.0.1";
const port = process.env.WECHAT_DESKTOP_PORT || "8765";
const token = process.env.WECHAT_DESKTOP_TOKEN || "";
const baseUrl = process.env.WECHAT_DESKTOP_URL || `http://${host}:${port}`;

function headers(extra = {}) {
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function jsonText(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

async function requestJson(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: headers(init.headers),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { ok: false, error: text };
  }

  if (!response.ok || payload.ok === false) {
    const message = payload.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

const server = new McpServer({
  name: "openzhiyu-wechat-desktop",
  version: "0.1.0",
});

server.registerTool(
  "wechat_desktop_health",
  {
    title: "Check WeChat desktop service",
    description:
      "Check the local Windows WeChat desktop automation service and whether the PC WeChat window is available.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const result = await requestJson("/health", { method: "GET" });
    return jsonText(result);
  },
);

server.registerTool(
  "wechat_preview_message",
  {
    title: "Preview WeChat message",
    description:
      "Create a short-lived confirmation token for a WeChat desktop message. This does not send the message.",
    inputSchema: {
      recipientName: z.string().min(1).max(200),
      message: z.string().min(1).max(5000),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
  },
  async ({ recipientName, message }) => {
    const result = await requestJson("/preview", {
      method: "POST",
      body: JSON.stringify({ recipientName, message }),
    });
    return jsonText(result);
  },
);

server.registerTool(
  "wechat_send_confirmed_message",
  {
    title: "Send confirmed WeChat message",
    description:
      "Send a WeChat desktop message using a confirmation token returned by wechat_preview_message.",
    inputSchema: {
      recipientName: z.string().min(1).max(200),
      message: z.string().min(1).max(5000),
      confirmToken: z.string().min(1).max(500),
    },
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ recipientName, message, confirmToken }) => {
    const result = await requestJson("/send", {
      method: "POST",
      body: JSON.stringify({ recipientName, message, confirmToken }),
    });
    return jsonText(result);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
