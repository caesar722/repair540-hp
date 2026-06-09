#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const SITE_BASE_URL = 'https://caesar722.github.io/repair540-hp/';
export const BLOG_POSTS_DIR = path.resolve(process.cwd(), 'blog/posts');
export const REJECTED_DRAFTS_DIR = path.join(BLOG_POSTS_DIR, 'rejected');
export const POSTS_JSON_FILE = path.resolve(process.cwd(), 'posts.json');
export const DRAFT_INDEX_HTML_FILE = path.join(BLOG_POSTS_DIR, 'index-drafts.html');

export function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

export function extractMatch(source, regex, label) {
  const match = source.match(regex);
  if (!match) {
    throw new Error(`Failed to extract ${label} from draft HTML.`);
  }
  return match[1].trim();
}

export function extractMetaContent(html, name) {
  const regex = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`, 'i');
  const match = html.match(regex);
  return match ? decodeHtmlEntities(match[1]).trim() : '';
}

export function normalizeTitle(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

export function buildDraftUrl(relativePath) {
  const normalized = String(relativePath).replace(/\\/g, '/').replace(/^\.\//, '');
  return new URL(normalized, SITE_BASE_URL).toString();
}

export function relativeDraftPath(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

export function getTokyoTodayIso() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function formatJaDate(isoDate) {
  if (!isoDate) return '';
  return new Date(`${isoDate}T00:00:00+09:00`).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Tokyo'
  });
}

export function parseDateFromFileName(filePath) {
  const baseName = path.basename(filePath);
  const match = baseName.match(/^(\d{4}-\d{2}-\d{2})-/);
  if (!match) {
    throw new Error('Draft file name must start with YYYY-MM-DD-.');
  }
  return match[1];
}

export function isDraftHtmlFilename(fileName) {
  return fileName.endsWith('.html') && fileName !== 'index-drafts.html';
}

export function upsertMetaContent(html, name, value) {
  const escapedValue = escapeHtml(value);
  const regex = new RegExp(`(<meta[^>]+name=["']${name}["'][^>]+content=["'])([\\s\\S]*?)(["'][^>]*>)`, 'i');

  if (regex.test(html)) {
    return html.replace(regex, `$1${escapedValue}$3`);
  }

  return html.replace('</head>', `  <meta name="${name}" content="${escapedValue}">\n</head>`);
}

export async function ensureRejectedDir() {
  await fs.mkdir(REJECTED_DRAFTS_DIR, { recursive: true });
}

export async function getGitFirstTrackedDate(filePath) {
  try {
    const relativePath = relativeDraftPath(filePath);
    const { stdout } = await execFileAsync(
      'git',
      ['log', '--follow', '--diff-filter=A', '--format=%as', '--reverse', '--', relativePath],
      { cwd: process.cwd() }
    );
    const firstDate = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    return firstDate || '';
  } catch {
    return '';
  }
}

export async function readPostsMap() {
  const payload = JSON.parse(await fs.readFile(POSTS_JSON_FILE, 'utf8'));
  const posts = Array.isArray(payload.posts) ? payload.posts : [];
  const byDraftFile = new Map();

  for (const post of posts) {
    if (!post.draftFile) continue;
    byDraftFile.set(String(post.draftFile).replace(/\\/g, '/'), post);
  }

  return {
    posts,
    byDraftFile
  };
}

export async function readDraftEntry(filePath, postsByDraftFile) {
  const html = await fs.readFile(filePath, 'utf8');
  const relativePath = relativeDraftPath(filePath);
  const title = decodeHtmlEntities(extractMatch(html, /<h1 class="draft-title">([\s\S]*?)<\/h1>/i, 'draft title'));
  const sourceDate = extractMetaContent(html, 'draft-source-date') || parseDateFromFileName(filePath);
  const sourceUrl = extractMetaContent(html, 'draft-source-url');
  const generatedDate = extractMetaContent(html, 'draft-generated-date') || await getGitFirstTrackedDate(filePath) || sourceDate;
  const rejectedDate = extractMetaContent(html, 'draft-rejected-date');
  const publishedDate = extractMetaContent(html, 'draft-published-date');
  const publishedPost = postsByDraftFile.get(relativePath);

  let status = 'draft';
  if (relativePath.startsWith('blog/posts/rejected/')) {
    status = 'rejected';
  } else if (publishedPost) {
    status = 'published';
  }

  return {
    filePath,
    relativePath,
    title,
    sourceDate,
    sourceUrl,
    generatedDate,
    rejectedDate,
    publishedDate: publishedPost?.date || publishedDate,
    publishedPostId: publishedPost?.id || null,
    status,
    html
  };
}

export async function collectDraftEntries() {
  const { byDraftFile } = await readPostsMap();
  const directories = [BLOG_POSTS_DIR, REJECTED_DRAFTS_DIR];
  const entries = [];

  for (const directory of directories) {
    try {
      const dirEntries = await fs.readdir(directory, { withFileTypes: true });
      for (const dirEntry of dirEntries) {
        if (!dirEntry.isFile() || !isDraftHtmlFilename(dirEntry.name)) continue;
        const filePath = path.join(directory, dirEntry.name);
        entries.push(await readDraftEntry(filePath, byDraftFile));
      }
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
  }

  const statusOrder = {
    draft: 0,
    published: 1,
    rejected: 2
  };

  entries.sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;

    const dateA = a.generatedDate || a.sourceDate || '';
    const dateB = b.generatedDate || b.sourceDate || '';
    if (dateA !== dateB) return dateA < dateB ? 1 : -1;

    return a.title.localeCompare(b.title, 'ja');
  });

  return entries;
}

export function isActionableDraftEntry(entry) {
  return (
    entry.status === 'draft' &&
    entry.relativePath.startsWith('blog/posts/') &&
    !entry.relativePath.startsWith('blog/posts/rejected/')
  );
}

export async function collectActionableDraftEntries() {
  return (await collectDraftEntries()).filter(isActionableDraftEntry);
}

export function formatDraftSelectionList(entries) {
  if (!entries.length) {
    return '（公開・却下できる下書きはありません）';
  }

  return entries.map((entry, index) => `${index + 1}. ${entry.title}`).join('\n');
}

export function resolveDraftSelection(entries, draftSelection, actionLabel = 'draft') {
  const requested = normalizeTitle(draftSelection);
  if (!requested) {
    throw new Error(`Missing ${actionLabel} selection.`);
  }

  if (/^\d+$/.test(requested)) {
    const index = Number(requested) - 1;
    if (entries[index]) {
      return entries[index];
    }
  }

  const exactMatches = entries.filter((entry) => normalizeTitle(entry.title) === requested);
  if (exactMatches.length === 1) return exactMatches[0];

  const partialMatches = entries.filter((entry) => normalizeTitle(entry.title).includes(requested));
  if (partialMatches.length === 1) return partialMatches[0];

  const matches = exactMatches.length > 1 ? exactMatches : partialMatches;
  const availableList = entries.map((entry, index) => `${index + 1}. ${entry.title}`);

  if (matches.length > 1) {
    throw new Error(
      [
        `Multiple drafts matched "${draftSelection}". Please use a more specific title or the draft number.`,
        ...matches.map((entry) => `- ${entry.title}`),
        '',
        'Available drafts:',
        ...availableList
      ].join('\n')
    );
  }

  throw new Error(
    [
      `No active draft matched "${draftSelection}". Use the draft number or exact title.`,
      '',
      'Available drafts:',
      ...availableList
    ].join('\n')
  );
}
