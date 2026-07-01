import { config } from "dotenv";
import { initDb, getDb } from "./adapters";

config({
  path: ".env",
});

let dbInstance: ReturnType<typeof getDb> | null = null;

export function getDbInstance() {
  if (!dbInstance) {
    dbInstance = initDb();
  }
  return dbInstance;
}

let cachedDb: ReturnType<typeof getDb> | null = null;

export const db: ReturnType<typeof getDb> = new Proxy({} as any, {
  get(_target, prop) {
    if (!cachedDb) {
      console.log("[DB] Initializing database connection (first access)...");
      try {
        cachedDb = getDbInstance();
        console.log("[DB] Database initialized successfully");
      } catch (error) {
        console.error("[DB] Failed to initialize database:", error);
        throw error;
      }
    }

    // @ts-ignore - proxy to db instance
    return cachedDb[prop];
  },
});
