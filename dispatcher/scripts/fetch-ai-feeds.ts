/**
 * fetch-ai-feeds.ts
 *
 * Fetches AI news from RSS feeds and Hacker News API.
 * Outputs raw text for Gemini to summarize.
 *
 * Usage: npx tsx scripts/fetch-ai-feeds.ts
 * Output: JSON array of { title, link, source, date, summary } to stdout
 */

interface FeedItem {
  title: string;
  link: string;
  source: string;
  date: string;
  summary: string;
}

const RSS_FEEDS: { url: string; source: string }[] = [
  { url: "https://www.anthropic.com/rss.xml", source: "Anthropic Blog" },
  { url: "https://openai.com/blog/rss.xml", source: "OpenAI Blog" },
  { url: "https://blog.google/technology/ai/rss/", source: "Google AI Blog" },
  { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch AI" },
  { url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", source: "The Verge AI" },
  { url: "https://www.reddit.com/r/ClaudeAI/.rss", source: "r/ClaudeAI" },
  { url: "https://www.reddit.com/r/LocalLLaMA/.rss", source: "r/LocalLLaMA" },
  { url: "https://changelog.com/podcast/feed", source: "Changelog" },
];

const HN_API = "https://hacker-news.firebaseio.com/v0";
const AI_KEYWORDS = [
  "ai", "llm", "gpt", "claude", "anthropic", "openai", "gemini", "agent",
  "mcp", "copilot", "cursor", "codex", "supabase", "vercel", "model",
  "transformer", "neural", "machine learning", "deep learning", "prompt",
  "rag", "fine-tune", "embedding", "token", "context window", "benchmark",
];

async function fetchRSS(url: string, source: string): Promise<FeedItem[]> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "MCMForge-AI-Intel/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const text = await response.text();

    const items: FeedItem[] = [];
    // Simple XML parsing — extract <item> or <entry> blocks
    const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
    let match;
    while ((match = itemRegex.exec(text)) !== null) {
      const block = match[1];
      const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s)?.[1]?.trim() || "";
      const link = block.match(/<link[^>]*href="([^"]*)"/) ?.[1]
        || block.match(/<link[^>]*>(.*?)<\/link>/s)?.[1]?.trim() || "";
      const pubDate = block.match(/<(?:pubDate|published|updated)[^>]*>(.*?)<\/(?:pubDate|published|updated)>/s)?.[1]?.trim() || "";
      const desc = block.match(/<(?:description|summary|content)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:description|summary|content)>/s)?.[1]?.trim() || "";

      // Only include items from the last 48 hours
      const itemDate = new Date(pubDate);
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
      if (pubDate && itemDate < cutoff) continue;

      // Strip HTML tags from description
      const cleanDesc = desc.replace(/<[^>]*>/g, "").slice(0, 300);

      if (title) {
        items.push({ title, link, source, date: pubDate, summary: cleanDesc });
      }
    }
    return items.slice(0, 5); // Max 5 per feed
  } catch {
    return [];
  }
}

async function fetchHackerNews(): Promise<FeedItem[]> {
  try {
    const topRes = await fetch(`${HN_API}/topstories.json`, {
      signal: AbortSignal.timeout(10_000),
    });
    const topIds: number[] = await topRes.json();

    const items: FeedItem[] = [];
    // Check top 30 stories for AI relevance
    for (const id of topIds.slice(0, 30)) {
      const storyRes = await fetch(`${HN_API}/item/${id}.json`, {
        signal: AbortSignal.timeout(5_000),
      });
      const story = await storyRes.json();
      if (!story?.title) continue;

      const titleLower = story.title.toLowerCase();
      const isAI = AI_KEYWORDS.some(kw => titleLower.includes(kw));
      if (!isAI) continue;

      items.push({
        title: story.title,
        link: story.url || `https://news.ycombinator.com/item?id=${id}`,
        source: "Hacker News",
        date: new Date(story.time * 1000).toISOString(),
        summary: `${story.score} points, ${story.descendants || 0} comments`,
      });

      if (items.length >= 5) break;
    }
    return items;
  } catch {
    return [];
  }
}

async function main() {
  const allItems: FeedItem[] = [];

  // Fetch all feeds in parallel
  const feedPromises = RSS_FEEDS.map(f => fetchRSS(f.url, f.source));
  feedPromises.push(fetchHackerNews());

  const results = await Promise.allSettled(feedPromises);
  for (const result of results) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value);
    }
  }

  // Sort by date (newest first)
  allItems.sort((a, b) => {
    const da = new Date(a.date).getTime() || 0;
    const db = new Date(b.date).getTime() || 0;
    return db - da;
  });

  // Output JSON to stdout for Gemini to consume
  console.log(JSON.stringify(allItems, null, 2));
  console.error(`[ai-feeds] Fetched ${allItems.length} items from ${RSS_FEEDS.length + 1} sources`);
}

main();
