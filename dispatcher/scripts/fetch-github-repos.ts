/**
 * fetch-github-repos.ts
 *
 * Searches GitHub for new/trending repos relevant to our companies.
 * Uses the GitHub API via fetch (no gh CLI dependency needed on Mini).
 *
 * Usage: npx tsx scripts/fetch-github-repos.ts [company]
 *   company: dirtsync | ecommerce | mcmforge | all (default)
 */

interface RepoResult {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  created_at: string;
  pushed_at: string;
  language: string | null;
  license: { spdx_id: string } | null;
  archived: boolean;
  has_readme: boolean;
  company: string;
  query: string;
}

interface CompanySearchConfig {
  name: string;
  queries: string[];
  minStars: number;
}

const COMPANIES: Record<string, CompanySearchConfig> = {
  dirtsync: {
    name: "DirtSync",
    queries: [
      "trail navigation",
      "offline maps mobile",
      "gpx parser javascript",
      "maplibre plugin",
      "elevation profile",
      "trail difficulty algorithm",
      "overland navigation app",
      "openstreetmap outdoor",
      "postgis trails",
      "geojson trail",
    ],
    minStars: 3,
  },
  ecommerce: {
    name: "Ecommerce (Links Choice / GBN / HGB)",
    queries: [
      "shopify app open source",
      "shopify automation tool",
      "shipstation api integration",
      "ecommerce analytics dashboard",
      "shopify inventory management",
      "bulk pricing shopify",
    ],
    minStars: 5,
  },
  mcmforge: {
    name: "MCM Forge",
    queries: [
      "mcp server",
      "model context protocol",
      "claude code tool",
      "agent orchestrator framework",
      "ai agent skill",
      "autonomous agent framework",
      "supabase mcp",
      "gemini cli tool",
      "task queue agent",
      "llm automation",
    ],
    minStars: 5,
  },
};

const DELAY_MS = 2_000; // 2 seconds between GitHub API requests (rate limit: 10 req/min unauthenticated)

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

async function searchGitHub(
  query: string,
  company: string,
  minStars: number,
  daysBack: number = 30,
): Promise<RepoResult[]> {
  const since = getDateDaysAgo(daysBack);
  const q = encodeURIComponent(`${query} pushed:>${since} stars:>=${minStars}`);
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=5`;

  try {
    const headers: Record<string, string> = {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "MCMForge-Repo-Scout/1.0",
    };

    // Use GITHUB_TOKEN if available (higher rate limit)
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) {
      headers["Authorization"] = `token ${token}`;
    }

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      if (response.status === 403) {
        console.error(`[github-repos] Rate limited on query: ${query}`);
        return [];
      }
      return [];
    }

    const data = await response.json();
    const repos: RepoResult[] = [];

    for (const repo of data.items || []) {
      if (repo.archived) continue;

      repos.push({
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        description: repo.description,
        stargazers_count: repo.stargazers_count,
        created_at: repo.created_at,
        pushed_at: repo.pushed_at,
        language: repo.language,
        license: repo.license ? { spdx_id: repo.license.spdx_id } : null,
        archived: repo.archived,
        has_readme: true, // GitHub API doesn't expose this directly; assume true for starred repos
        company,
        query,
      });
    }

    return repos;
  } catch {
    return [];
  }
}

async function main() {
  const targetCompany = process.argv[2] || "all";
  const allRepos: RepoResult[] = [];
  const seenRepos = new Set<string>();

  const companiesToScan = targetCompany === "all"
    ? Object.entries(COMPANIES)
    : Object.entries(COMPANIES).filter(([key]) => key === targetCompany);

  if (companiesToScan.length === 0) {
    console.error(`[github-repos] Unknown company: ${targetCompany}`);
    console.error(`[github-repos] Valid: ${Object.keys(COMPANIES).join(", ")}, all`);
    process.exit(1);
  }

  for (const [, config] of companiesToScan) {
    for (const query of config.queries) {
      const repos = await searchGitHub(query, config.name, config.minStars);

      for (const repo of repos) {
        // Deduplicate across queries
        if (seenRepos.has(repo.full_name)) continue;
        seenRepos.add(repo.full_name);
        allRepos.push(repo);
      }

      await sleep(DELAY_MS);
    }
  }

  // Sort by stars descending
  allRepos.sort((a, b) => b.stargazers_count - a.stargazers_count);

  console.log(JSON.stringify(allRepos, null, 2));
  console.error(
    `[github-repos] Found ${allRepos.length} repos for ${companiesToScan.map(([, c]) => c.name).join(", ")}`,
  );
}

main();
