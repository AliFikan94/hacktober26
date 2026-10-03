// DuckDuckGo search without an API key, via the HTML endpoint.
// This is scraping: DDG can change markup or rate-limit, so callers must handle failure.
export type Hit = { title: string; url: string; snippet: string };

const strip = (s: string) =>
  s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

function realUrl(href: string): string {
  const m = href.match(/[?&]uddg=([^&]+)/);
  const u = m ? decodeURIComponent(m[1]) : href;
  return u.startsWith("//") ? "https:" + u : u;
}

export function parseResults(html: string, limit = 6): Hit[] {
  const hits: Hit[] = [];
  const blocks = html.split(/class="result__a"/).slice(1);
  for (const b of blocks) {
    const href = b.match(/href="([^"]+)"/)?.[1];
    const title = b.match(/>([\s\S]*?)<\/a>/)?.[1];
    const snippet = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "";
    if (!href || !title) continue;
    const url = realUrl(href);
    if (!/^https?:\/\//.test(url) || url.includes("duckduckgo.com/y.js")) continue; // skip ads
    hits.push({ title: strip(title), url, snippet: strip(snippet) });
    if (hits.length >= limit) break;
  }
  return hits;
}

export async function ddgSearch(q: string): Promise<Hit[]> {
  const r = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0 (TeachBack learning app)" },
    body: new URLSearchParams({ q }).toString(),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error("DuckDuckGo returned " + r.status);
  return parseResults(await r.text());
}
