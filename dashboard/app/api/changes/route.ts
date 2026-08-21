import { readLatestChanges, readVendorChanges } from "../../../lib/read";

export const dynamic = "force-dynamic";

/**
 * Public JSON API for integrations (CI checks, Zapier polling, Make, scripts).
 *
 * Params:
 *   limit    — max rows returned (1-500, default 50)
 *   vendor   — filter by vendor slug (e.g. openai)
 *   type     — added|changed|deprecated|removed|fixed
 *   since    — YYYY-MM-DD, only entries on/after this date
 *   breaking — "true" for breaking-only
 */
export function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
  const vendor = url.searchParams.get("vendor");
  const type = url.searchParams.get("type");
  const since = url.searchParams.get("since");
  const breaking = url.searchParams.get("breaking");

  let changes = vendor ? readVendorChanges(vendor, 500) : readLatestChanges(500);
  if (type) changes = changes.filter((c) => c.change_type === type);
  if (since) changes = changes.filter((c) => c.date >= since);
  if (breaking === "true") changes = changes.filter((c) => c.is_breaking);
  changes = changes.slice(0, limit);

  return Response.json(
    { count: changes.length, generated_at: new Date().toISOString(), changes },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    }
  );
}
