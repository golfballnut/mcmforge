#!/usr/bin/env tsx
/**
 * Vault Sync — Reads vault/*.md files and populates vault_docs table
 *
 * Run: npx tsx vault-sync.ts
 * Cron: Every 6 hours to keep vault_docs in sync with git
 *
 * Maps file paths to categories:
 *   vault/companies/*.md    → category: "company"
 *   vault/competitors/*.md  → category: "competitor"
 *   vault/agents/skills/*.md → category: "skill"
 *   vault/decisions/*.md    → category: "decision"
 *   vault/intelligence/*.md → category: "intelligence"
 */

import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, basename, relative } from "path";
import { isSkillPackage, buildSkillPackageRows } from './skill-package-loader.js'
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, ".env") });

const VAULT_DIR = join(__dirname, "..", "vault");

const supabaseUrl = process.env.MCMFORGE_SUPABASE_URL!;
const supabaseKey = process.env.MCMFORGE_SUPABASE_KEY!;
const agentEmail = process.env.AGENT_EMAIL || "agent@mcmforge.com";
const agentPassword = process.env.AGENT_PASSWORD!;

if (!supabaseUrl || !supabaseKey || !agentPassword) {
  console.error("Missing env vars: MCMFORGE_SUPABASE_URL, MCMFORGE_SUPABASE_KEY, AGENT_PASSWORD");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Company slug → company_id mapping (loaded from DB)
let companyMap: Map<string, string> = new Map();

// File path → category mapping
function getCategory(relPath: string): string {
  if (relPath.startsWith("companies/")) return "company";
  if (relPath.startsWith("competitors/")) return "competitor";
  if (relPath.startsWith("agents/skills/")) return "skill";
  if (relPath.startsWith("decisions/")) return "decision";
  if (relPath.startsWith("intelligence/")) return "intelligence";
  return "general";
}

// Extract company slug from file path or content
function getCompanySlug(relPath: string, content: string): string | null {
  // Direct company file
  if (relPath.startsWith("companies/")) {
    return basename(relPath, ".md");
  }

  // Decision files — check content for company mentions
  if (relPath.startsWith("decisions/")) {
    const lower = content.toLowerCase();
    if (lower.includes("dirtsync") || lower.includes("trail")) return "dirtsync";
    if (lower.includes("mcm forge") || lower.includes("mcmforge")) return "mcmforge";
    if (lower.includes("links choice") || lower.includes("linkschoice")) return "linkschoice";
    if (lower.includes("golf ball nut") || lower.includes("golfballnut")) return "golfballnut";
    if (lower.includes("hot golf") || lower.includes("hotgolfbrands")) return "hotgolfbrands";
  }

  return null;
}

// Extract title from first H1 in markdown
function extractTitle(content: string, filename: string): string {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  // Fallback: clean up filename
  return basename(filename, ".md")
    .replace(/^\d{4}-\d{2}-\d{2}-/, "") // Strip date prefix
    .replace(/-/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Generate a URL-safe slug from title
function generateSlug(title: string, relPath: string): string {
  // Use filename for a stable slug
  const name = basename(relPath, ".md");
  return name
    .toLowerCase()
    .replace(/^\d{4}-\d{2}-\d{2}-/, "") // Strip date prefix
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with dashes
    .replace(/^-|-$/g, "") // Trim leading/trailing dashes
    .slice(0, 80); // Max length
}

// Walk directory recursively for .md files and skill package dirs
// Returns: { type: 'file', path: string } | { type: 'package', path: string }
type WalkResult = { type: 'file'; path: string } | { type: 'package'; path: string }

function walkDir(dir: string): WalkResult[] {
  const results: WalkResult[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        // Check if this directory is a skill package BEFORE recursing
        if (isSkillPackage(full)) {
          results.push({ type: 'package', path: full });
          // Do NOT recurse — package components are handled by buildSkillPackageRows
        } else {
          results.push(...walkDir(full));
        }
      } else if (entry.endsWith(".md") && entry !== "INDEX.md") {
        results.push({ type: 'file', path: full });
      }
    }
  } catch {
    // Skip unreadable directories
  }
  return results;
}

// Extract tags from document content for smart context routing
function extractTags(content: string, category: string): string[] {
  const tags: string[] = [category]; // Always include the category
  const lower = content.toLowerCase();

  // Topic detection
  const topicMap: Record<string, string[]> = {
    code: ["implement", "build", "function", "component", "api", "endpoint", "typescript", "react", "next.js"],
    map: ["map", "mapbox", "trail", "gps", "coordinates", "geojson", "layer"],
    trails: ["trail", "hiking", "difficulty", "outlaw", "official", "ohv", "atv"],
    ecommerce: ["shopify", "product", "pricing", "cart", "checkout", "store"],
    email: ["email", "newsletter", "campaign", "subscriber", "mailchimp", "resend"],
    seo: ["seo", "keyword", "ranking", "organic", "search engine", "google"],
    marketing: ["marketing", "campaign", "audience", "conversion", "ads", "social media"],
    competitor: ["competitor", "competitive", "rival", "alternative", "versus"],
    research: ["research", "analysis", "findings", "report", "study"],
    design: ["design", "ui", "ux", "layout", "styling", "css", "badge", "color"],
    testing: ["test", "vitest", "jest", "assertion", "coverage", "tdd"],
    deployment: ["deploy", "vercel", "production", "staging", "ci/cd"],
    database: ["database", "supabase", "postgres", "query", "migration", "table"],
    golf: ["golf", "golf ball", "recycled", "mesh bag", "driving range"],
    navigation: ["navigation", "route", "directions", "valhalla", "turn-by-turn"],
  };

  for (const [tag, keywords] of Object.entries(topicMap)) {
    if (keywords.some(kw => lower.includes(kw))) {
      tags.push(tag);
    }
  }

  // Deduplicate
  return [...new Set(tags)];
}

async function main() {
  console.log("=== Vault Sync Starting ===");

  // Auth
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: agentEmail,
    password: agentPassword,
  });
  if (authError) {
    console.error(`Auth failed: ${authError.message}`);
    process.exit(1);
  }

  // Load company registry
  const { data: companies } = await supabase
    .from("company_registry")
    .select("id, slug")
    .eq("status", "active");

  companyMap = new Map((companies || []).map(c => [c.slug, c.id]));
  console.log(`Loaded ${companyMap.size} companies: ${[...companyMap.keys()].join(", ")}`);

  // Load existing vault_docs for upsert matching
  const { data: existingDocs } = await supabase
    .from("vault_docs")
    .select("id, title, category, company_id, file_path");

  const existingByPath = new Map(
    (existingDocs || []).filter(d => d.file_path).map(d => [d.file_path, d])
  );
  const existingByTitle = new Map(
    (existingDocs || []).map(d => [d.title.toLowerCase(), d])
  );

  // Fuzzy title match: "DirtSync" should match "DirtSync -- Trail Navigation App"
  function findExistingDoc(relPath: string, title: string): any {
    // 1. Match by file_path (most reliable)
    if (existingByPath.has(relPath)) return existingByPath.get(relPath);

    // 2. Exact title match
    const lower = title.toLowerCase();
    if (existingByTitle.has(lower)) return existingByTitle.get(lower);

    // 3. Fuzzy: existing title starts with our title, or vice versa
    for (const [existTitle, doc] of existingByTitle) {
      if (existTitle.startsWith(lower) || lower.startsWith(existTitle)) return doc;
      // Also check first significant word
      const titleWord = lower.split(/[\s—-]+/)[0];
      const existWord = existTitle.split(/[\s—-]+/)[0];
      if (titleWord.length > 3 && titleWord === existWord) return doc;
    }

    return null;
  }

  // Scan vault directory
  const vaultResults = walkDir(VAULT_DIR);
  console.log(`Found ${vaultResults.filter(r => r.type === 'file').length} flat files, ${vaultResults.filter(r => r.type === 'package').length} skill packages`);

  let updated = 0;
  let created = 0;
  let errors = 0;

  for (const result of vaultResults) {
    if (result.type === 'package') {
      // Handle skill package — multiple rows per package
      const relBase = relative(VAULT_DIR, join(result.path, '..'));
      const rows = buildSkillPackageRows(result.path, relBase, null);

      for (const row of rows) {
        const existing = findExistingDoc(row.file_path, row.title);
        if (existing) {
          const { error } = await supabase
            .from('vault_docs')
            .update({
              content: row.content,
              file_path: row.file_path,
              tags: row.tags,
              file_role: row.file_role,
              parent_slug: row.parent_slug,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          if (error) {
            console.error(`  ERROR updating package row ${row.file_path}: ${error.message}`);
            errors++;
          } else {
            console.log(`  UPDATED: [skill:${row.file_role}] ${row.title}`);
            updated++;
          }
        } else {
          const { error } = await supabase
            .from('vault_docs')
            .insert({
              title: row.title,
              slug: row.slug,
              category: row.category,
              content: row.content,
              tags: row.tags,
              company_id: row.company_id,
              file_path: row.file_path,
              file_role: row.file_role,
              parent_slug: row.parent_slug,
              updated_by: 'vault-sync',
              status: 'active',
            });
          if (error) {
            console.error(`  ERROR creating package row ${row.file_path}: ${error.message}`);
            errors++;
          } else {
            console.log(`  CREATED: [skill:${row.file_role}] ${row.title}`);
            created++;
          }
        }
      }
    } else {
      // Handle flat file — same logic as before
      const filePath = result.path;
      const relPath = relative(VAULT_DIR, filePath);
      const content = readFileSync(filePath, "utf-8");
      const title = extractTitle(content, filePath);
      const category = getCategory(relPath);
      const companySlug = getCompanySlug(relPath, content);
      const companyId = companySlug ? companyMap.get(companySlug) || null : null;

      const existing = findExistingDoc(relPath, title);

      if (existing) {
        const tags = extractTags(content, category);
        const { error } = await supabase
          .from("vault_docs")
          .update({
            content,
            file_path: relPath,
            tags,
            updated_at: new Date().toISOString(),
            ...(companyId && !existing.company_id ? { company_id: companyId } : {}),
          })
          .eq("id", existing.id);

        if (error) {
          console.error(`  ERROR updating ${relPath}: ${error.message}`);
          errors++;
        } else {
          console.log(`  UPDATED: [${category}] ${title} (${relPath}) — ${tags.length} tags`);
          updated++;
        }
      } else {
        const slug = generateSlug(title, relPath);
        const tags = extractTags(content, category);
        const { error } = await supabase
          .from("vault_docs")
          .insert({
            title,
            slug,
            category,
            content,
            tags,
            company_id: companyId,
            file_path: relPath,
            updated_by: "vault-sync",
            status: "active",
          });

        if (error) {
          console.error(`  ERROR creating ${relPath}: ${error.message}`);
          errors++;
        } else {
          console.log(`  CREATED: [${category}] ${title} (${relPath}) — ${tags.length} tags`);
          created++;
        }
      }
    }
  }

  console.log(`\n=== Vault Sync Complete ===`);
  console.log(`Updated: ${updated} | Created: ${created} | Errors: ${errors}`);
  console.log(`Total vault_docs: ${updated + created + (existingDocs?.length || 0) - updated}`);
}

main().catch(err => {
  console.error(`Fatal: ${err}`);
  process.exit(1);
});
