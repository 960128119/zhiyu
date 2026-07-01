import "server-only";

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SQLiteRawMessageManager } from "@openzhiyu/sqlite";
import { isTauriMode } from "@/lib/env/constants";
import { getTauriDbPath } from "@/lib/env/tauri-paths";

let manager: SQLiteRawMessageManager | null = null;
const RAW_VECTOR_BACKEND_ENV_KEYS = [
  "RAW_MESSAGE_VECTOR_STORE_BACKEND",
  "MEMORY_VECTOR_STORE_BACKEND",
  "VECTOR_STORE_BACKEND",
] as const;

function isRawMessageChromaBackendEnabled(): boolean {
  return RAW_VECTOR_BACKEND_ENV_KEYS.some(
    (key) => process.env[key]?.trim().toLowerCase() === "chroma",
  );
}

export function isSQLiteRawMessageStorageAvailable(): boolean {
  return isTauriMode();
}

export async function getSQLiteRawMessageManager(): Promise<SQLiteRawMessageManager> {
  if (!isSQLiteRawMessageStorageAvailable()) {
    throw new Error(
      "SQLite raw message storage is only available in Tauri mode.",
    );
  }

  if (!manager) {
    const dbPath = getTauriDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });
    manager = new SQLiteRawMessageManager({
      dbPath,
      enableVectorSearch: !isRawMessageChromaBackendEnabled(),
    });
    await manager.init();
  }

  return manager;
}

export async function closeSQLiteRawMessageManager(): Promise<void> {
  if (!manager) {
    return;
  }
  await manager.close();
  manager = null;
}
