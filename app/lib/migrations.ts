// Migrations runner. Detects unapplied .sql files in /db, runs them in
// alphabetical order against the Supabase Postgres via direct connection,
// records each in schema_migrations.
//
// Why a direct Postgres connection rather than Supabase REST: arbitrary
// DDL (CREATE TABLE, ALTER, CREATE POLICY, etc.) is not exposed through
// PostgREST. We need raw SQL execution.
//
// Env: DATABASE_URL must be set in Vercel. Supabase gives you the value
// at Project → Settings → Database → Connection string (URI). The pooler
// URL works fine — keep `sslmode=require` in the URL.

import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const MIGRATIONS_DIR = path.join(process.cwd(), "db");

let _sql: ReturnType<typeof postgres> | null = null;
function sql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL env var not set. Add it in Vercel from Supabase → Settings → Database → Connection string (URI)."
    );
  }
  _sql = postgres(url, {
    max: 1, // serverless — single connection per invocation
    ssl: "require",
    prepare: false, // PgBouncer transaction-pool compatibility
  });
  return _sql;
}

export type MigrationFile = {
  filename: string;
  applied: boolean;
  appliedAt: string | null;
};

async function listSqlFiles(): Promise<string[]> {
  const entries = await fs.readdir(MIGRATIONS_DIR).catch(() => [] as string[]);
  return entries
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => /^\d{3}-/.test(f)) // only numbered migrations, skip schema.sql / receipts-bucket.sql
    .sort();
}

export async function getMigrationStatus(): Promise<{
  migrations: MigrationFile[];
  pending: string[];
  tableExists: boolean;
}> {
  const files = await listSqlFiles();
  let applied: Record<string, string> = {};
  let tableExists = true;
  try {
    const rows = await sql()<{ filename: string; applied_at: string }[]>`
      select filename, applied_at::text from schema_migrations
    `;
    applied = Object.fromEntries(rows.map((r) => [r.filename, r.applied_at]));
  } catch (err) {
    // Table doesn't exist yet — the bootstrap migration 005 will create it.
    const msg = err instanceof Error ? err.message : String(err);
    if (!/schema_migrations/.test(msg) && !/relation/.test(msg)) throw err;
    tableExists = false;
  }
  const migrations: MigrationFile[] = files.map((filename) => ({
    filename,
    applied: filename in applied,
    appliedAt: applied[filename] ?? null,
  }));
  const pending = migrations.filter((m) => !m.applied).map((m) => m.filename);
  return { migrations, pending, tableExists };
}

export type RunResult = {
  filename: string;
  ok: boolean;
  error?: string;
};

export async function runPendingMigrations(): Promise<RunResult[]> {
  const { pending } = await getMigrationStatus();
  const results: RunResult[] = [];

  for (const filename of pending) {
    const filepath = path.join(MIGRATIONS_DIR, filename);
    let body: string;
    try {
      body = await fs.readFile(filepath, "utf8");
    } catch (err) {
      results.push({
        filename,
        ok: false,
        error: `Could not read file: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    try {
      // sql.unsafe() lets us execute arbitrary SQL strings — needed for
      // multi-statement migration files. Wrapped in begin() so failures
      // roll back the whole file atomically.
      await sql().begin(async (tx) => {
        await tx.unsafe(body);
        // Record the file as applied within the same transaction so a
        // mid-migration crash leaves it as pending, not half-done.
        await tx`
          insert into schema_migrations (filename) values (${filename})
          on conflict (filename) do nothing
        `;
      });
      results.push({ filename, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ filename, ok: false, error: msg.slice(0, 1000) });
      // Stop on first failure — running later migrations on a broken
      // schema is usually worse than stopping.
      break;
    }
  }

  return results;
}
