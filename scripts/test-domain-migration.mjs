#!/usr/bin/env node

import fs from 'node:fs/promises';

const DEFAULT_CURRENT_BASE = 'https://caesar722.github.io/repair540-hp/';
const CORE_PATHS = [
  '',
  'menu.html',
  'menu-iphone13.html',
  'menu-iphone14.html',
  'menu-iphone15.html',
  'menu-iphone16.html',
  'access.html',
  'contact.html',
  'mail-in-repair.html',
  'faq.html',
  'blog.html'
];

function parseArgs(argv) {
  const options = {
    currentBase: DEFAULT_CURRENT_BASE,
    newBase: '',
    postsFile: 'posts.json',
    timeoutMs: 15000
  };

  for (const argument of argv) {
    const [name, value] = argument.split('=');
    if (name === '--current-base' && value) options.currentBase = value;
    if (name === '--new-base' && value) options.newBase = value;
    if (name === '--posts-file' && value) options.postsFile = value;
    if (name === '--timeout-ms' && value) options.timeoutMs = Number(value);
  }

  options.currentBase = ensureTrailingSlash(options.currentBase);
  if (options.newBase) options.newBase = ensureTrailingSlash(options.newBase);
  return options;
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function postPath(post) {
  if (post.url) return post.url;
  if (post.slug) return `post.html?slug=${encodeURIComponent(post.slug)}`;
  return `post.html?id=${encodeURIComponent(post.id)}`;
}

async function loadPublicPaths(postsFile) {
  const data = JSON.parse(await fs.readFile(postsFile, 'utf8'));
  const posts = Array.isArray(data) ? data : data.posts;
  if (!Array.isArray(posts)) throw new Error(`${postsFile} does not contain a posts array.`);
  return [...new Set([...CORE_PATHS, ...posts.map(postPath)])];
}

async function request(url, timeoutMs, redirect = 'manual') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect,
      signal: controller.signal,
      headers: { 'user-agent': 'Repair540 migration test' }
    });
  } finally {
    clearTimeout(timer);
  }
}

function addTestQuery(url) {
  const next = new URL(url);
  next.searchParams.set('migration_test', 'repair540');
  return next;
}

function normalizeUrl(url) {
  const normalized = new URL(url);
  normalized.hash = '';
  return normalized.toString();
}

function localAssetUrls(html, pageUrl) {
  const urls = new Set();
  const pattern = /(?:href|src)=["']([^"']+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    const value = match[1].trim();
    if (!value || /^(?:data:|tel:|mailto:|javascript:|#)/i.test(value)) continue;
    const resolved = new URL(value, pageUrl);
    if (resolved.origin !== new URL(pageUrl).origin) continue;
    resolved.hash = '';
    urls.add(resolved.toString());
  }
  return urls;
}

async function verifyPageAndAssets(pageUrl, options, failures, label) {
  let response;
  try {
    response = await request(pageUrl, options.timeoutMs, 'follow');
  } catch (error) {
    failures.push(`${label}: request failed: ${error.message}`);
    return;
  }

  if (response.status !== 200) {
    failures.push(`${label}: expected 200, received ${response.status}`);
    return;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return;

  const html = await response.text();
  if (label.startsWith('new ')) {
    const canonicalMatch = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    if (!canonicalMatch) {
      failures.push(`${label}: canonical link is missing`);
    } else {
      const expectedCanonical = new URL(pageUrl);
      expectedCanonical.search = '';
      if (normalizeUrl(new URL(canonicalMatch[1], pageUrl)) !== normalizeUrl(expectedCanonical)) {
        failures.push(`${label}: canonical is ${canonicalMatch[1]}, expected ${expectedCanonical}`);
      }
    }
  }

  for (const assetUrl of localAssetUrls(html, pageUrl)) {
    let assetResponse;
    try {
      assetResponse = await request(assetUrl, options.timeoutMs, 'follow');
    } catch (error) {
      failures.push(`${label}: asset request failed ${assetUrl}: ${error.message}`);
      continue;
    }
    if (assetResponse.status !== 200) {
      failures.push(`${label}: asset ${assetUrl} returned ${assetResponse.status}`);
    }
  }
}

async function verifyRedirect(sourceUrl, expectedUrl, options, failures) {
  const sourceWithQuery = addTestQuery(sourceUrl);
  const expectedWithQuery = addTestQuery(expectedUrl);
  let current = sourceWithQuery;
  let hops = 0;

  while (hops < 4) {
    let response;
    try {
      response = await request(current, options.timeoutMs, 'manual');
    } catch (error) {
      failures.push(`${sourceWithQuery}: redirect request failed: ${error.message}`);
      return;
    }

    if (![301, 308].includes(response.status)) {
      failures.push(`${sourceWithQuery}: expected 301/308 at hop ${hops + 1}, received ${response.status}`);
      return;
    }

    const location = response.headers.get('location');
    if (!location) {
      failures.push(`${sourceWithQuery}: redirect response has no Location header`);
      return;
    }

    current = new URL(location, current);
    hops += 1;
    if (normalizeUrl(current) === normalizeUrl(expectedWithQuery)) break;
  }

  if (normalizeUrl(current) !== normalizeUrl(expectedWithQuery)) {
    failures.push(`${sourceWithQuery}: expected ${expectedWithQuery}, reached ${current}`);
    return;
  }

  const finalResponse = await request(current, options.timeoutMs, 'follow');
  if (finalResponse.status !== 200) {
    failures.push(`${sourceWithQuery}: final URL returned ${finalResponse.status}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const publicPaths = await loadPublicPaths(options.postsFile);
  const failures = [];

  for (const publicPath of publicPaths) {
    const currentUrl = new URL(publicPath, options.currentBase);
    await verifyPageAndAssets(currentUrl, options, failures, `current ${currentUrl}`);

    if (options.newBase) {
      const newUrl = new URL(publicPath, options.newBase);
      await verifyPageAndAssets(newUrl, options, failures, `new ${newUrl}`);
      await verifyRedirect(currentUrl, newUrl, options, failures);
    }
  }

  console.log(`Checked ${publicPaths.length} public URL mappings.`);
  if (options.newBase) console.log(`Redirect target: ${options.newBase}`);

  if (failures.length) {
    console.error(`Failed checks: ${failures.length}`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('All migration checks passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
