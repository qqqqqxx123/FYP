export interface SecurityNewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
  category: string;
}

const RSS_FETCH_OPTIONS = {
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; AISDS/1.0; +https://example.com)",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
  next: { revalidate: 1800 },
} as const;

const SECURITY_NEWS_FEEDS = [
  {
    url: "https://www.govcert.gov.hk/en/rss_security_alerts.xml",
    source: "GovCERT.HK",
    category: "Security Alert",
  },
  {
    url: "https://www.govcert.gov.hk/en/rss_security_blogs.xml",
    source: "GovCERT.HK",
    category: "Security Blog",
  },
  {
    url: "https://www.hkcert.org/getrss/en/securitybulletin",
    source: "HKCERT",
    category: "Bulletin & Blog",
  },
] as const;

const MAX_ITEMS = 12;

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRssTag(block: string, tag: string): string {
  const cdataPattern = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i");
  const plainPattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(cdataPattern) ?? block.match(plainPattern);
  if (!match) return "";
  return decodeXmlEntities(match[1]);
}

function parseRssItems(
  xml: string,
  source: string,
  defaultCategory: string
): SecurityNewsItem[] {
  const items: SecurityNewsItem[] = [];
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(xml)) !== null) {
    const block = match[1];
    const title = extractRssTag(block, "title");
    const link = extractRssTag(block, "link");
    const pubDate = extractRssTag(block, "pubDate");
    const guid = extractRssTag(block, "guid");
    const category = extractRssTag(block, "category") || defaultCategory;

    if (!title || !link) continue;

    items.push({
      id: guid || link,
      title,
      link,
      pubDate,
      source,
      category,
    });
  }

  return items;
}

async function fetchFeedItems(
  url: string,
  source: string,
  category: string
): Promise<SecurityNewsItem[]> {
  try {
    const response = await fetch(url, RSS_FETCH_OPTIONS);
    if (!response.ok) return [];
    const xml = await response.text();
    return parseRssItems(xml, source, category);
  } catch {
    return [];
  }
}

function getItemTimestamp(item: SecurityNewsItem): number {
  const timestamp = Date.parse(item.pubDate);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export async function fetchSecurityNewsItems(): Promise<SecurityNewsItem[]> {
  const results = await Promise.all(
    SECURITY_NEWS_FEEDS.map((feed) => fetchFeedItems(feed.url, feed.source, feed.category))
  );

  const merged = results.flat();
  const seen = new Set<string>();

  return merged
    .filter((item) => {
      const key = item.id || item.link;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => getItemTimestamp(b) - getItemTimestamp(a))
    .slice(0, MAX_ITEMS);
}

export function formatSecurityNewsDate(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}
