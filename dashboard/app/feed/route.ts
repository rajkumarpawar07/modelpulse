import { readLatestChanges } from "../../lib/read";
import { buildRss } from "../../lib/rss";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const xml = buildRss(
    "ModelPulse — AI API Change Intelligence",
    "Breaking changes across AI vendor APIs, updated daily.",
    origin,
    readLatestChanges(50)
  );
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
