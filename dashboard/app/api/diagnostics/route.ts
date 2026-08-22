import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";

/**
 * Read-only deployment diagnostics. Shows where the serverless function
 * thinks the SQLite DB is, whether the native better-sqlite3 binding loads,
 * and what's actually next to it. No secrets — safe to expose.
 */
export async function GET() {
  const cwd = process.cwd();
  const lambdaRoot = process.env.LAMBDA_TASK_ROOT ?? null;

  const candidates = [
    process.env.DATABASE_PATH ?? null,
    join(cwd, "..", "data", "modelpulse.db"),
    join(cwd, "data", "modelpulse.db"),
    lambdaRoot ? join(lambdaRoot, "data", "modelpulse.db") : null,
  ].filter((p): p is string => Boolean(p));

  const safeReaddir = (dir: string): string[] | null => {
    try {
      return readdirSync(dir).slice(0, 30);
    } catch {
      return null;
    }
  };

  const resolved = candidates.find((p) => existsSync(p)) ?? null;

  let dbStatus: Record<string, unknown>;
  try {
    const mod = (await import("better-sqlite3")).default;
    const db = new mod(resolved ?? candidates[candidates.length - 1], { readonly: true });
    dbStatus = {
      moduleLoaded: true,
      fileOpened: true,
      resolvedPath: resolved,
      changes: (db.prepare("SELECT COUNT(*) AS c FROM changes").get() as { c: number }).c,
      runs: (db.prepare("SELECT COUNT(*) AS c FROM runs").get() as { c: number }).c,
      heals: (db.prepare("SELECT COUNT(*) AS c FROM heals").get() as { c: number }).c,
    };
    db.close();
  } catch (err) {
    dbStatus = {
      moduleLoaded: true,
      fileOpened: false,
      resolvedPath: resolved,
      error: (err as Error).message,
    };
  }

  return Response.json({
    node: process.version,
    cwd,
    lambdaRoot,
    dbCandidates: candidates.map((p) => ({ path: p, exists: existsSync(p) })),
    cwdEntries: safeReaddir(cwd),
    dataDirEntries: safeReaddir(join(cwd, "data")),
    betterSqlite3Build: existsSync(
      join(cwd, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node"),
    ),
    dbStatus,
  });
}
