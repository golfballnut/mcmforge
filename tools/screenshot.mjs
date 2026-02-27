#!/usr/bin/env node
/**
 * MCM Forge Screenshot Tool
 * Fast, reliable page screenshots using Puppeteer.
 *
 * Usage:
 *   node tools/screenshot.mjs <url> <output.png> [--width=1280] [--height=800] [--wait=5000] [--device=mobile]
 *   node tools/screenshot.mjs file:///path/to/mockup.html mockup.png
 */
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const args = process.argv.slice(2);
const url = args[0];
const output = args[1] || 'screenshot.png';

// Parse flags
const flags = Object.fromEntries(
  args.slice(2).filter(a => a.startsWith('--')).map(a => {
    const [k, v] = a.replace('--', '').split('=');
    return [k, v ?? 'true'];
  })
);

const width = parseInt(flags.width || '1280');
const height = parseInt(flags.height || '800');
const wait = parseInt(flags.wait || '5000');
const isMobile = flags.device === 'mobile';

if (!url) {
  console.error('Usage: node tools/screenshot.mjs <url> <output.png> [flags]');
  process.exit(1);
}

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({
  width: isMobile ? 390 : width,
  height: isMobile ? 844 : height,
  deviceScaleFactor: 2,
  isMobile,
});

console.log(`Navigating to ${url}...`);
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

if (wait > 0) {
  console.log(`Waiting ${wait}ms for render...`);
  await new Promise(r => setTimeout(r, wait));
}

await page.screenshot({ path: output, type: 'png' });
console.log(`Saved: ${output}`);

await browser.close();
