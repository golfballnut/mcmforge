/**
 * fetch-social-feeds.ts
 *
 * Fetches Reddit posts from company-relevant subreddits.
 * Outputs JSON for Gemini to analyze and summarize.
 *
 * Usage: npx tsx scripts/fetch-social-feeds.ts [company]
 *   company: dirtsync | links-choice | golf-ball-nut | hot-golf-brands | all (default)
 */

interface RedditPost {
  title: string;
  selftext: string;
  url: string;
  subreddit: string;
  score: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
  company: string;
}

interface CompanyConfig {
  name: string;
  subreddits: string[];
  keywords: string[];
  competitors: string[];
}

const COMPANIES: Record<string, CompanyConfig> = {
  dirtsync: {
    name: "DirtSync",
    subreddits: ["overlanding", "offroad", "4x4", "UTV", "ATV", "Jeep"],
    keywords: [
      "trail app", "trail map", "offline map", "trail closed", "trail conditions",
      "difficulty rating", "trail finder", "got lost", "no signal", "which trails",
      "best trails", "trail system", "off-road app", "gps trail", "cell service",
    ],
    competitors: ["onx", "trails offroad", "gaia gps", "alltrails", "avenza"],
  },
  "links-choice": {
    name: "Links Choice",
    subreddits: ["golf", "golfdeals", "golfclassifieds"],
    keywords: [
      "recycled golf ball", "used golf ball", "refurbished", "bulk golf ball",
      "cheap golf ball", "practice ball", "ball quality", "ball grading",
      "worth it", "pro v1", "titleist", "kirkland", "vice",
    ],
    competitors: ["lostgolfballs", "golfballsdirect", "usedgolfballdeals"],
  },
  "golf-ball-nut": {
    name: "Golf Ball Nut",
    subreddits: ["golf", "golfdeals"],
    keywords: [
      "where to buy golf ball", "best site", "recommendation", "review",
      "shipping", "golf ball quality", "mint condition", "near mint",
      "aaaa", "4a", "used golf ball",
    ],
    competitors: ["usedgolfballs.com", "rainbowgolfballs", "bulkgolfballs"],
  },
  "hot-golf-brands": {
    name: "Hot Golf Brands",
    subreddits: ["golf", "golfdeals"],
    keywords: [
      "range balls", "bulk bags", "mesh bag", "practice balls",
      "100 count", "48 count", "shag bag", "ball bag",
    ],
    competitors: [],
  },
};

const DELAY_MS = 3_000; // 3 seconds between Reddit requests

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchSubreddit(
  subreddit: string,
  company: string,
  keywords: string[],
  competitors: string[],
): Promise<RedditPost[]> {
  try {
    const response = await fetch(
      `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`,
      {
        headers: { "User-Agent": "MCMForge-Social-Intel/1.0" },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) return [];
    const data = await response.json();

    const posts: RedditPost[] = [];
    const cutoff = Date.now() / 1000 - 48 * 60 * 60; // 48 hours ago

    for (const child of data?.data?.children || []) {
      const post = child.data;
      if (!post?.title || post.created_utc < cutoff) continue;
      if (post.score < 5) continue; // Filter low-signal posts

      const titleLower = post.title.toLowerCase();
      const textLower = (post.selftext || "").toLowerCase();
      const combined = `${titleLower} ${textLower}`;

      // Check if post matches keywords or mentions competitors
      const matchesKeyword = keywords.some(kw => combined.includes(kw));
      const matchesCompetitor = competitors.some(c => combined.includes(c));
      const isHighSignal = post.score >= 20; // High-upvote posts always included

      if (!matchesKeyword && !matchesCompetitor && !isHighSignal) continue;

      posts.push({
        title: post.title,
        selftext: (post.selftext || "").slice(0, 500),
        url: post.url,
        subreddit: post.subreddit_name_prefixed || `r/${subreddit}`,
        score: post.score,
        num_comments: post.num_comments || 0,
        created_utc: post.created_utc,
        permalink: `https://reddit.com${post.permalink}`,
        company,
      });
    }

    return posts;
  } catch {
    return [];
  }
}

async function main() {
  const targetCompany = process.argv[2] || "all";
  const allPosts: RedditPost[] = [];

  const companiesToScan = targetCompany === "all"
    ? Object.entries(COMPANIES)
    : Object.entries(COMPANIES).filter(([key]) => key === targetCompany);

  if (companiesToScan.length === 0) {
    console.error(`[social-feeds] Unknown company: ${targetCompany}`);
    console.error(`[social-feeds] Valid: ${Object.keys(COMPANIES).join(", ")}, all`);
    process.exit(1);
  }

  // Track subreddits already fetched to avoid duplicate requests
  const fetchedSubreddits = new Set<string>();

  for (const [key, config] of companiesToScan) {
    for (const subreddit of config.subreddits) {
      // Avoid re-fetching same subreddit for different companies
      const cacheKey = `${subreddit}`;
      if (fetchedSubreddits.has(cacheKey)) {
        // Re-filter existing posts for this company's keywords
        const existing = allPosts.filter(
          p => p.subreddit.includes(subreddit) && p.company !== config.name,
        );
        for (const post of existing) {
          const combined = `${post.title.toLowerCase()} ${post.selftext.toLowerCase()}`;
          const matches = config.keywords.some(kw => combined.includes(kw))
            || config.competitors.some(c => combined.includes(c));
          if (matches) {
            allPosts.push({ ...post, company: config.name });
          }
        }
        continue;
      }

      const posts = await fetchSubreddit(subreddit, config.name, config.keywords, config.competitors);
      allPosts.push(...posts);
      fetchedSubreddits.add(cacheKey);

      await sleep(DELAY_MS);
    }
  }

  // Sort by score (highest engagement first)
  allPosts.sort((a, b) => b.score - a.score);

  console.log(JSON.stringify(allPosts, null, 2));
  console.error(`[social-feeds] Fetched ${allPosts.length} relevant posts for ${companiesToScan.map(([, c]) => c.name).join(", ")}`);
}

main();
