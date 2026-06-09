#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  collectActionableDraftEntries,
  resolveDraftSelection,
  upsertMetaContent
} from './apple-newsroom-draft-utils.mjs';

const DEFAULT_POSTS_FILE = path.resolve(process.cwd(), 'posts.json');
const DEFAULT_SITEMAP_FILE = path.resolve(process.cwd(), 'sitemap.xml');
const DEFAULT_DRAFTS_DIR = path.resolve(process.cwd(), 'blog/posts');
const DEFAULT_CATEGORY = 'コラム';
const DEFAULT_EMOJI = '📰';
const SITE_BASE_URL = 'https://caesar722.github.io/repair540-hp/';

function parseArgs(argv) {
  const options = {
    draftFile: null,
    draftTitle: '',
    postsFile: DEFAULT_POSTS_FILE,
    sitemapFile: DEFAULT_SITEMAP_FILE,
    category: DEFAULT_CATEGORY,
    emoji: DEFAULT_EMOJI,
    dryRun: false
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    const [key, value] = arg.split('=');
    if (!value) continue;

    if (key === '--draft-file') options.draftFile = path.resolve(process.cwd(), value);
    if (key === '--draft-title') options.draftTitle = value.trim();
    if (key === '--posts-file') options.postsFile = path.resolve(process.cwd(), value);
    if (key === '--sitemap-file') options.sitemapFile = path.resolve(process.cwd(), value);
    if (key === '--category') options.category = value;
    if (key === '--emoji') options.emoji = value;
  }

  return options;
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value) {
  return decodeHtmlEntities(
    String(value)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractMatch(source, regex, label) {
  const match = source.match(regex);
  if (!match) {
    throw new Error(`Failed to extract ${label} from draft HTML.`);
  }
  return match[1].trim();
}

function extractMetaContent(html, name) {
  const regex = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`, 'i');
  const match = html.match(regex);
  return match ? decodeHtmlEntities(match[1]).trim() : '';
}

function normalizeTitle(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function getTokyoTodayIso() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function parseDateFromFileName(filePath) {
  const baseName = path.basename(filePath);
  const match = baseName.match(/^(\d{4}-\d{2}-\d{2})-/);
  if (!match) {
    throw new Error('Draft file name must start with YYYY-MM-DD-.');
  }
  return match[1];
}

function buildDraftContent(html, sourceUrl) {
  const leadHtml = extractMatch(
    html,
    /<div class="draft-lead">\s*([\s\S]*?)\s*<\/div>\s*<div class="draft-note">/i,
    'draft body'
  );

  const bodyWithoutSourceBox = leadHtml.replace(/<div class="draft-source-box">[\s\S]*?<\/div>/gi, '').trim();
  const paragraphs = [...bodyWithoutSourceBox.matchAll(/<p>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripTags(match[1]))
    .filter(Boolean);

  if (sourceUrl) {
    paragraphs.push(`ニュース元：\n${sourceUrl}`);
  }

  return paragraphs.join('\n\n');
}

function buildSourceUrl(relativePath) {
  const normalized = String(relativePath).replace(/\\/g, '/').replace(/^\.\//, '');
  return new URL(normalized, SITE_BASE_URL).toString();
}

function buildPostRecord({ id, title, date, sourceDate, category, emoji, excerpt, content, sourceUrl, draftFile }) {
  return {
    id,
    title,
    date,
    sourceDate,
    category,
    emoji,
    excerpt,
    content,
    sourceUrl,
    draftFile
  };
}

function updateSitemap(xml, postId, date) {
  const loc = `${SITE_BASE_URL}post.html?id=${postId}`;

  if (xml.includes(`<loc>${loc}</loc>`)) {
    throw new Error(`Sitemap entry already exists for post id ${postId}.`);
  }

  const blogPattern = /(<loc>https:\/\/caesar722\.github\.io\/repair540-hp\/blog\.html<\/loc>\s*<lastmod>)([^<]+)(<\/lastmod>)/;
  const postPattern = /(<loc>https:\/\/caesar722\.github\.io\/repair540-hp\/post\.html<\/loc>\s*<lastmod>)([^<]+)(<\/lastmod>)/;
  let nextXml = xml
    .replace(blogPattern, `$1${date}$3`)
    .replace(postPattern, `$1${date}$3`);

  const entry = [
    '  <url>',
    `    <loc>${loc}</loc>`,
    `    <lastmod>${date}</lastmod>`,
    '    <changefreq>monthly</changefreq>',
    '    <priority>0.6</priority>',
    '  </url>'
  ].join('\n');

  nextXml = nextXml.replace(/\n<\/urlset>\s*$/, `\n${entry}\n</urlset>\n`);
  return nextXml;
}

async function listDraftEntries() {
  return collectActionableDraftEntries();
}

async function resolveDraft(options) {
  if (options.draftFile) {
    if (String(options.draftFile).includes(`${path.sep}rejected${path.sep}`)) {
      throw new Error('Rejected drafts cannot be published directly. Move them back manually if needed.');
    }
    const html = await fs.readFile(options.draftFile, 'utf8');
    return {
      filePath: options.draftFile,
      html
    };
  }

  if (!options.draftTitle) {
    throw new Error('Missing --draft-file or --draft-title option.');
  }

  const drafts = await listDraftEntries();
  return resolveDraftSelection(drafts, options.draftTitle, '--draft-title');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const selectedDraft = await resolveDraft(options);
  const draftHtml = selectedDraft.html;
  const resolvedDraftFile = selectedDraft.filePath;
  const posts = JSON.parse(await fs.readFile(options.postsFile, 'utf8'));
  const sitemapXml = await fs.readFile(options.sitemapFile, 'utf8');

  if (!Array.isArray(posts.posts)) {
    throw new Error('posts.json does not contain a posts array.');
  }

  const title = decodeHtmlEntities(extractMatch(draftHtml, /<h1 class="draft-title">([\s\S]*?)<\/h1>/i, 'draft title'));
  const excerpt = extractMetaContent(draftHtml, 'description');
  const sourceUrl = extractMetaContent(draftHtml, 'draft-source-url');
  const sourceDate = extractMetaContent(draftHtml, 'draft-source-date') || parseDateFromFileName(resolvedDraftFile);
  const date = getTokyoTodayIso();
  const draftFile = path.relative(process.cwd(), resolvedDraftFile);
  const content = buildDraftContent(draftHtml, sourceUrl);

  console.log(`Selected draft title: ${title}`);
  console.log(`Selected draft file: ${draftFile}`);

  if (posts.posts.some((post) => post.sourceUrl === sourceUrl || (post.title === title && post.date === date))) {
    throw new Error('This draft appears to have already been published to posts.json.');
  }

  const nextId = posts.posts.reduce((maxId, post) => Math.max(maxId, Number(post.id) || 0), 0) + 1;
  const nextPost = buildPostRecord({
    id: nextId,
    title,
    date,
    sourceDate,
    category: options.category,
    emoji: options.emoji,
    excerpt,
    content,
    sourceUrl,
    draftFile
  });

  const nextPosts = {
    posts: [nextPost, ...posts.posts]
  };
  const nextSitemap = updateSitemap(sitemapXml, nextId, date);

  if (options.dryRun) {
    console.log(JSON.stringify({
      post: nextPost,
      draftUrl: buildSourceUrl(draftFile)
    }, null, 2));
    return;
  }

  await fs.writeFile(options.postsFile, `${JSON.stringify(nextPosts, null, 2)}\n`, 'utf8');
  await fs.writeFile(options.sitemapFile, nextSitemap, 'utf8');

  let nextDraftHtml = draftHtml;
  nextDraftHtml = upsertMetaContent(nextDraftHtml, 'draft-status', 'published');
  nextDraftHtml = upsertMetaContent(nextDraftHtml, 'draft-published-date', date);
  await fs.writeFile(resolvedDraftFile, nextDraftHtml, 'utf8');

  console.log(`Published draft: ${draftFile}`);
  console.log(`Created post id: ${nextId}`);
  console.log(`Preview URL: ${buildSourceUrl(draftFile)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
