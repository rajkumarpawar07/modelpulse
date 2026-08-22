import { existsSync, readFileSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const dynamic = "force-dynamic";

/**
 * Read-only deployment diagnostics: where the serverless function looks for
 * the SQLite DB, per-file forensics (journal mode from the header, size,
 * permissions), and which open strategy succeeds. No secrets involved.
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

  const forensic = (p: string) => {
    if (!existsSync(p)) return { path: p, exists: false };
    let journal = "unknown";
    try {
      // SQLite header bytes 18/19: 1 = rollback journal, 2 = WAL
      const h = readFileSync(p).slice(18, 20);
      journal = h[0] === 2 || h[1] === 2 ? "wal" : h[0] === 1 ? "rollback" : "unknown";
    } catch {
      journal = "unreadable";
    }
    let mode: string | null = null;
    let size: number | null = null;
    try {
      const st = statSync(p);
      mode = (st.mode & 0o777).toString(8);
      size = st.size;
    } catch {
      /* keep nulls */
    }
    return { path: p, exists: true, journal, mode, size };
  };

  // Try each candidate the same way lib/db.ts does: readonly open, then a
  // /tmp copy. Report which strategy worked and the row counts.
  const attempts: Array<Record<string, unknown>> = [];
  let opened: Record<string, unknown> | null = null;
  const Database = (await import("better-sqlite3")).default;
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const attempt: Record<string, unknown> = { path: p };
    try {
      const db = new Database(p, { readonly: true });
      attempt.readonlyOpen = true;
      db.close();
    } catch (err) {
      attempt.readonlyOpen = false;
      attempt.readonlyError = (err as Error).message;
      try {
        const st = statSync(p);
        const tmp = join(tmpdir(), `diag-${st.size}-${Math.round(st.mtimeMs)}.db`);
        copyFileSync(p, tmp);
        const db = new Database(tmp);
        attempt.tmpCopyOpen = true;
        attempt.changes = (db.prepare("SELECT COUNT(*) AS c FROM changes").get() as { c: number }).c;
        attempt.runs = (db.prepare("SELECT COUNT(*) AS c FROM runs").get() as { c: number }).c;
        attempt.heals = (db.prepare("SELECT COUNT(*) AS c FROM heals").get() as { c: number }).c;
        db.close();
        if (!opened) {
          opened = { ...attempt, openedVia: "tmpCopy", resolvedPath: p };
        }
      } catch (err2) {
        attempt.tmpCopyOpen = false;
        attempt.tmpCopyError = (err2 as Error).message;
      }
    }
    attempts.push(attempt);
    if (attempt.readonlyOpen && !opened) {
      opened = { ...attempt, openedVia: "readonly", resolvedPath: p };
    }
  }

  return Response.json({
    node: process.version,
    cwd,
    lambdaRoot,
    dbCandidates: candidates.map(forensic),
    openAttempts: attempts,
    dbStatus: opened ?? { fileOpened: false },
    cwdEntries: safeReaddir(cwd),
    dataDirEntries: safeReaddir(join(cwd, "data")),
    betterSqlite3Build: existsSync(
      join(cwd, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node"),
    ),
  });
}
