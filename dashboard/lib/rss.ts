export interface RssItem {
  id: string;
  vendor_display: string;
  title: string;
  description: string;
  url: string;
  date: string;
  change_type: string;
  is_breaking: boolean;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rfc822(isoDate: string): string {
  const t = new Date(`${isoDate}T00:00:00Z`);
  return isNaN(t.getTime()) ? new Date().toUTCString() : t.toUTCString();
}

export function buildRss(
  title: string,
  description: string,
  link: string,
  changes: RssItem[]
): string {
  const items = changes
    .map(
      (c) => `    <item>
      <title>${esc(`[${c.vendor_display}] ${c.title}${c.is_breaking ? " (BREAKING)" : ""}`)}</title>
      <link>${esc(c.url)}</link>
      <guid isPermaLink="false">${esc(c.id)}</guid>
      <pubDate>${rfc822(c.date)}</pubDate>
      <category>${esc(c.change_type)}</category>
      <description>${esc(`${c.change_type.toUpperCase()}${c.is_breaking ? " · BREAKING" : ""} — ${c.description || c.title}`)}</description>
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(title)}</title>
    <link>${esc(link)}</link>
    <description>${esc(description)}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
}
