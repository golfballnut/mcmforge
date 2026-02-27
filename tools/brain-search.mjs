#!/usr/bin/env node
/**
 * MCM Forge Brain Search — memsearch-style vault search
 *
 * Searches vault_docs in Supabase using PostgreSQL full-text search.
 * Falls back to local vault/*.md grep if Supabase is unavailable.
 *
 * Usage:
 *   node tools/brain-search.mjs "trail styling"
 *   node tools/brain-search.mjs "security" --category=intelligence
 *   node tools/brain-search.mjs "dirtsync" --company=dirtsync --limit=5
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { config } from 'dotenv';

// Load env from dispatcher
config({ path: join(import.meta.dirname, '..', 'dispatcher', '.env') });

const SUPABASE_URL = process.env.MCMFORGE_SUPABASE_URL || 'https://ncwxeeqvujgyiggkviqq.supabase.co';
const SUPABASE_KEY = process.env.MCMFORGE_SUPABASE_KEY || '';
const VAULT_DIR = join(import.meta.dirname, '..', 'vault');

// Parse args
const args = process.argv.slice(2);
const query = args.filter(a => !a.startsWith('--')).join(' ');
const flags = Object.fromEntries(
  args.filter(a => a.startsWith('--')).map(a => {
    const [k, v] = a.replace('--', '').split('=');
    return [k, v ?? 'true'];
  })
);

const limit = parseInt(flags.limit || '10');
const category = flags.category || null;

if (!query) {
  console.error('Usage: node tools/brain-search.mjs "search query" [--category=...] [--limit=N]');
  process.exit(1);
}

async function searchSupabase(query, category, limit) {
  if (!SUPABASE_KEY) return null;

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Use PostgreSQL full-text search with ts_rank
  // First try: textSearch on title and content
  let qb = supabase
    .from('vault_docs')
    .select('title, category, content, file_path, updated_at')
    .eq('status', 'active')
    .not('content', 'is', null);

  if (category) {
    qb = qb.eq('category', category);
  }

  // Use ilike for flexible matching (FTS may not be configured)
  const words = query.split(/\s+/).filter(w => w.length > 2);
  for (const word of words) {
    qb = qb.or(`title.ilike.%${word}%,content.ilike.%${word}%`);
  }

  const { data, error } = await qb.order('updated_at', { ascending: false }).limit(limit);

  if (error) {
    console.error('Supabase search error:', error.message);
    return null;
  }

  return data;
}

function searchLocal(query, category, limit) {
  const results = [];
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  function walkDir(dir) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          // Check category filter
          if (category && entry !== category && !['companies', 'competitors', 'decisions', 'intelligence', 'agents'].includes(entry)) continue;
          walkDir(fullPath);
        } else if (entry.endsWith('.md')) {
          try {
            const content = readFileSync(fullPath, 'utf-8');
            const title = content.split('\n')[0].replace(/^#\s*/, '').trim();
            const relPath = relative(VAULT_DIR, fullPath);

            // Score: count how many query words appear in title + content
            const text = (title + ' ' + content).toLowerCase();
            let score = 0;
            for (const word of words) {
              const matches = text.split(word).length - 1;
              score += matches;
              // Title matches count 3x
              if (title.toLowerCase().includes(word)) score += 3;
            }

            if (score > 0) {
              results.push({ title, category: relPath.split('/')[0], content, file_path: relPath, score });
            }
          } catch (e) { /* skip unreadable files */ }
        }
      }
    } catch (e) { /* skip unreadable dirs */ }
  }

  walkDir(VAULT_DIR);

  // Sort by score descending, return top N
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// Execute search
console.log(`\n🔍 Searching brain for: "${query}"${category ? ` [category: ${category}]` : ''}\n`);

let results = await searchSupabase(query, category, limit);
let source = 'supabase';

if (!results) {
  results = searchLocal(query, category, limit);
  source = 'local vault';
}

if (!results || results.length === 0) {
  console.log('No results found.');
  process.exit(0);
}

console.log(`Found ${results.length} result(s) from ${source}:\n`);

for (const doc of results) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📄 ${doc.title}`);
  console.log(`   Category: ${doc.category} | Path: ${doc.file_path}`);
  if (doc.updated_at) console.log(`   Updated: ${doc.updated_at}`);
  console.log('');

  // Show relevant snippet (first 500 chars or matching context)
  const content = doc.content || '';
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  let snippet = '';

  // Find first occurrence of any query word
  for (const word of words) {
    const idx = content.toLowerCase().indexOf(word);
    if (idx > -1) {
      const start = Math.max(0, idx - 100);
      const end = Math.min(content.length, idx + 400);
      snippet = (start > 0 ? '...' : '') + content.slice(start, end).trim() + (end < content.length ? '...' : '');
      break;
    }
  }

  if (!snippet) {
    snippet = content.slice(0, 500).trim() + (content.length > 500 ? '...' : '');
  }

  console.log(`   ${snippet.replace(/\n/g, '\n   ')}`);
  console.log('');
}
