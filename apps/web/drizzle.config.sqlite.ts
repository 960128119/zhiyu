import { defineConfig } from "drizzle-kit";
import { homedir } from "node:os";
import { join } from "node:path";

function getAppDataDir() {
  if (process.env.TAURI_DATA_DIR) {
    return process.env.TAURI_DATA_DIR;
  }
  if (process.platform === "win32") {
    return process.env.USERPROFILE
      ? join(process.env.USERPROFILE, ".openzhiyu")
      : join(process.env.APPDATA || homedir(), "openzhiyu");
  }
  return join(homedir(), ".openzhiyu");
}

function getTauriDbPath() {
  return process.env.TAURI_DB_PATH || join(getAppDataDir(), "data", "data.db");
}

export default defineConfig({
  schema: "./lib/db/schema-sqlite.ts",
  out: "./lib/db/migrations-sqlite",
  dialect: "sqlite",
  dbCredentials: {
    url: getTauriDbPath(),
  },
});
