import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  DouyinCommandPlan,
  DouyinDraftCreateResult,
  DouyinDraftGetResult,
  DouyinDraftListResult,
  DouyinPublishDraftInput,
  DouyinPublisherHealth,
} from "./types";

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_CHARS = 250_000;

function pythonBinary() {
  return process.env.DOUYIN_PUBLISHER_PYTHON_BIN || process.env.PYTHON || "python";
}

function publisherPath() {
  let current = process.cwd();
  for (let index = 0; index < 6; index += 1) {
    const candidate = join(current, "tools", "douyin-publisher", "publisher.py");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return join(process.cwd(), "tools", "douyin-publisher", "publisher.py");
}

function publisherCwd() {
  return dirname(publisherPath());
}

async function runDouyinPublisher<T>(input: {
  args: string[];
  payload?: unknown;
  timeoutMs?: number;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBinary(), [publisherPath(), ...input.args], {
      cwd: publisherCwd(),
      env: {
        ...process.env,
        PYTHONIOENCODING: process.env.PYTHONIOENCODING || "utf-8",
        PYTHONUTF8: process.env.PYTHONUTF8 || "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(
        new Error(
          `Douyin publisher timed out after ${input.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms.`,
        ),
      );
    }, input.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > MAX_OUTPUT_CHARS) child.kill();
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const raw = (stdout || stderr).trim();
      try {
        const parsed = JSON.parse(raw) as T & { ok?: boolean; error?: string };
        if (code !== 0 && parsed?.error) {
          reject(new Error(parsed.error));
          return;
        }
        resolve(parsed as T);
      } catch {
        reject(
          new Error(
            raw || `Douyin publisher process exited with code ${String(code)}.`,
          ),
        );
      }
    });

    if (input.payload) {
      child.stdin?.end(JSON.stringify(input.payload));
    } else {
      child.stdin?.end();
    }
  });
}

export async function fetchDouyinPublisherHealth() {
  return runDouyinPublisher<DouyinPublisherHealth>({
    args: ["health"],
  });
}

export async function getDouyinLoginPlan() {
  return runDouyinPublisher<DouyinCommandPlan>({
    args: ["login"],
  });
}

export async function checkDouyinAccount(input?: { execute?: boolean }) {
  return runDouyinPublisher<DouyinCommandPlan>({
    args: input?.execute ? ["check", "--execute"] : ["check"],
    timeoutMs: input?.execute ? 120_000 : DEFAULT_TIMEOUT_MS,
  });
}

export async function createDouyinPublishDraft(input: DouyinPublishDraftInput) {
  return runDouyinPublisher<DouyinDraftCreateResult>({
    args: ["create-draft"],
    payload: input,
  });
}

export async function listDouyinPublishDrafts() {
  return runDouyinPublisher<DouyinDraftListResult>({
    args: ["list-drafts"],
  });
}

export async function getDouyinPublishDraft(draftId: string) {
  return runDouyinPublisher<DouyinDraftGetResult>({
    args: ["get-draft", "--draft-id", draftId],
  });
}

export async function prepareDouyinUpload(input: {
  draftId: string;
  execute?: boolean;
}) {
  return runDouyinPublisher<DouyinCommandPlan>({
    args: input.execute
      ? ["prepare-upload", "--draft-id", input.draftId, "--execute"]
      : ["prepare-upload", "--draft-id", input.draftId],
    timeoutMs: input.execute ? 15 * 60_000 : DEFAULT_TIMEOUT_MS,
  });
}

export async function publishDouyinDraft(input: {
  draftId: string;
  execute?: boolean;
}) {
  return runDouyinPublisher<DouyinCommandPlan>({
    args: input.execute
      ? ["publish", "--draft-id", input.draftId, "--execute"]
      : ["publish", "--draft-id", input.draftId],
    timeoutMs: input.execute ? 15 * 60_000 : DEFAULT_TIMEOUT_MS,
  });
}
