/**
 * @deprecated Use "@/lib/env" or "@/lib/utils/path" directly.
 *
 * This module is kept as a compatibility shim so older imports cannot drift
 * onto a second Tauri data path implementation.
 */
export {
  TAURI_DATA_DIR,
  TAURI_DB_PATH,
  TAURI_STORAGE_PATH,
  TAURI_LOGS_PATH,
  getTauriDataDir,
  getTauriDbPath,
  getTauriStoragePath,
  getTauriLogsPath,
} from "@/lib/utils/path";
