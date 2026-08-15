/**
 * Initialize SQLite database (for pre-migration preparation)
 */
import { chdir, cwd } from "node:process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getTauriDbPath } from "@/lib/utils/path";

// Switch to web directory to ensure migrations folder is found
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webDir = dirname(__dirname); // apps/web
chdir(webDir);

console.log(`Working directory: ${cwd()}`);

const DB_PATH = getTauriDbPath();

console.log(`Database path: ${DB_PATH}`);
console.log("Initializing SQLite database...");
const { initSqliteDb } = await import("./adapters/sqlite.js");
initSqliteDb(DB_PATH);
console.log("✅ Database initialized!");
