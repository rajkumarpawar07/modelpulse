import { readVendorChanges } from "../../../lib/read";
import { buildRss } from "../../../lib/rss";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { vendor: string } }) {
  const changes = readVendorChanges(params.vendor, 50);
  if (changes.length === 0) {
    return new Response("Not found", { status: 404 });
  }
  const origin = new URL(req.url).origin;
  const display = changes[0].vendor_display;
  const xml = buildRss(
    `ModelPulse — ${display}`,
    `Latest API changelog signals from ${display}.`,
    `${origin}/vendor/${params.vendor}`,
    changes
  );
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
