import { getDb } from "@/lib/db/client";
import { MemoryStore } from "@/lib/store/memory";
import { PostgresStore } from "@/lib/store/postgres";
import type { ConversationStore } from "@/lib/store/types";

const globalForStore = globalThis as { __auricMemory?: MemoryStore };

export function getStore(): ConversationStore {
  const db = getDb();
  if (db) return new PostgresStore(db);
  globalForStore.__auricMemory ??= new MemoryStore();
  return globalForStore.__auricMemory;
}

export function resetStoreForTests() {
  globalForStore.__auricMemory = new MemoryStore();
}
