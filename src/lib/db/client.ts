import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as { __auricSql?: Sql };

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const sql = globalForDb.__auricSql ?? postgres(url, { max: 1, prepare: false });
  if (process.env.NODE_ENV !== "production") globalForDb.__auricSql = sql;
  return drizzle(sql, { schema });
}

export type Database = NonNullable<ReturnType<typeof getDb>>;
