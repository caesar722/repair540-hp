#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_FEED_URL = 'https://www.apple.com/jp/newsroom/rss-feed.rss';
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'blog/posts');
const DEFAULT_STATE_FILE = path.join(DEFAULT_OUTPUT_DIR, 'apple-newsroom-state.json');
const DEFAULT_SOURCE_NAME = 'Apple公式Newsroom 日本版';

function parseArgs(argv) {
  const options = {
    feedUrl: DEFAULT_FEED_URL,
    outputDir: DEFAULT_OUTPUT_DIR,
    stateFile: DEFAULT_STATE_FILE,
    dryRun: false
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    const [key, value] = arg.split('=');
    if (!value) continue;

    if (key === '--feed-url') options.feedUrl = value;
    if (key === '--output-dir') options.outputDir = path.resolve(process.cwd(), value);
    if (key === '--state-file') options.stateFile = path.resolve(process.cwd(), value);
  }

  return options;
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)));
}

function escapeFrontmatter(value) {
  return String(value).replace(/"/g, '\\"');
}

function stripTags(value) {
  return decodeHtmlEntities(
    String(value)
      .replace(/<sup[\s\S]*?<\/sup>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeWhitespace(value) {
  return String(value)
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toJaDate(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Tokyo'
  }).format(date);
}

function toIsoDate(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function slugify(value) {
  const normalized = decodeHtmlEntities(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'apple-newsroom-draft';
}

function buildNaturalTitle(sourceTitle) {
  const title = decodeHtmlEntities(sourceTitle).replace(/\s+/g, ' ').trim();

  if (title.startsWith('Apple、')) {
    return `Appleが${title.slice('Apple、'.length)}`;
  }

  if (title.startsWith('Apple ')) {
    const parts = title.split('、');
    if (parts.length > 1) {
      return `${parts[0]}が${parts.slice(1).join('、')}`;
    }
  }

  return title;
}

function summarizeSentence(value, maxLength = 120) {
  const text = normalizeWhitespace(stripTags(value)).replace(/\n/g, ' ');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

function splitJapaneseSentences(text) {
  return normalizeWhitespace(text)
    .split(/(?<=[。！？])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function takeSentences(text, count = 2) {
  const sentences = splitJapaneseSentences(text);
  if (!sentences.length) return normalizeWhitespace(text);
  return sentences.slice(0, count).join('');
}

function paraphraseSummary(text) {
  let summary = normalizeWhitespace(stripTags(text));

  summary = summary
    .replace(/^Appleは本日、/, '')
    .replace(/^Appleは、/, '')
    .replace(/^Appleは/, '')
    .replace(/を発表しました。?$/, 'が発表されました。')
    .replace(/発表しました。?$/, 'と発表しました。')
    .replace(/提供開始しました。?$/, 'が案内されました。')
    .replace(/開催されます。?$/, 'が案内されています。');

  if (!/[。！？]$/.test(summary)) {
    summary += '。';
  }

  return summary;
}

function cleanupLeadParagraph(value) {
  return normalizeWhitespace(stripTags(value))
    .replace(/^[^。]{0,40}Appleは本日、/, 'Appleは')
    .replace(/^「.*?」/, '')
    .trim();
}

function chooseRelevantParagraphs(paragraphs) {
  return paragraphs
    .map(cleanupLeadParagraph)
    .filter((paragraph) => {
      if (!paragraph) return false;
      if (paragraph.startsWith('「')) return false;
      if (paragraph.startsWith('と、')) return false;
      if (paragraph.includes('AppleのCEO')) return false;
      if (paragraph.includes('述べています')) return false;
      if (paragraph.includes('は述べています')) return false;
      return true;
    })
    .slice(0, 3);
}

function buildCustomerRelevance(title, detailText) {
  const haystack = `${title}\n${detailText}`;

  if (/(アクセシビリティ|VoiceOver|拡大鏡|音声コントロール|字幕|視線|Apple Intelligence)/i.test(haystack)) {
    return 'iPhoneやiPadの使いやすさを見直したい方、アクセシビリティ設定を活用したい方には特に関係のある内容です。設定変更や使い方の相談をしたい時にも参考になりそうです。';
  }

  if (/(iPhone|iPad|watchOS|iOS|RCS|メッセージング|セキュリティ|プライバシー)/i.test(haystack)) {
    return 'iPhoneやiPadを日常的に使っている方にとって、今後の使い勝手や安全性に関わる情報として押さえておきたい内容です。';
  }

  if (/(WWDC|開発者|ソフトウェア|アップデート)/i.test(haystack)) {
    return '今後のiPhoneやiPadのアップデートを把握したい方にとって、次の機能追加や使い方の変化をイメージしやすいニュースです。';
  }

  if (/(Apple Watch|AirPods|Arcade|Sports)/i.test(haystack)) {
    return 'Apple製品を幅広く使っている方にとって、周辺サービスや連携機能の変化を把握するきっかけになる内容です。';
  }

  return 'Repair540をご利用いただくお客様にとっても、普段使っているApple製品の新機能や今後の変化を知る参考になりそうです。';
}

function buildDraftBody(entry, article) {
  const publishedJa = toJaDate(article.datePublished || entry.updated);
  const leadSummary = paraphraseSummary(article.description || entry.summary);
  const detailParagraphs = chooseRelevantParagraphs(article.paragraphs);
  const detailOne = detailParagraphs[0] ? takeSentences(detailParagraphs[0], 2) : leadSummary;
  const detailTwo = detailParagraphs[1] ? takeSentences(detailParagraphs[1], 2) : '';
  const relevance = buildCustomerRelevance(entry.title, `${detailOne}\n${detailTwo}`);

  const paragraphs = [
    `Appleが${publishedJa}に公開した公式Newsroomの記事では、${leadSummary}`,
    detailOne ? `今回の発表では、${detailOne}` : '',
    detailTwo ? `さらに、${detailTwo}` : '',
    relevance,
    `ニュース元：\n${entry.url}`
  ].filter(Boolean);

  return paragraphs.join('\n\n');
}

function buildExcerpt(entry, article) {
  return summarizeSentence(paraphraseSummary(article.description || entry.summary || entry.title), 90);
}

function parseEntriesFromFeed(xml) {
  const entries = [];
  const entryMatches = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

  for (const chunk of entryMatches) {
    const titleMatch = chunk.match(/<title>([\s\S]*?)<\/title>/i);
    const updatedMatch = chunk.match(/<updated>([\s\S]*?)<\/updated>/i);
    const categoryMatch = chunk.match(/<category[^>]*term="([^"]+)"/i);
    const contentMatch = chunk.match(/<content>([\s\S]*?)<\/content>/i);
    const linkMatches = [...chunk.matchAll(/<link\s+([^>]+?)\/?>/gi)];

    const articleLink = linkMatches
      .map((match) => match[1])
      .find((attrs) => !/rel="enclosure"/i.test(attrs));

    const hrefMatch = articleLink ? articleLink.match(/href="([^"]+)"/i) : null;

    if (!titleMatch || !updatedMatch || !hrefMatch) continue;

    entries.push({
      title: normalizeWhitespace(decodeHtmlEntities(titleMatch[1])),
      updated: normalizeWhitespace(decodeHtmlEntities(updatedMatch[1])),
      category: categoryMatch ? decodeHtmlEntities(categoryMatch[1]).trim() : '',
      summary: contentMatch ? normalizeWhitespace(decodeHtmlEntities(contentMatch[1])) : '',
      url: hrefMatch[1]
    });
  }

  return entries;
}

function extractMetaContent(html, name, attribute = 'name') {
  const regex = new RegExp(`<meta[^>]+${attribute}=["']${name}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`, 'i');
  const match = html.match(regex);
  return match ? decodeHtmlEntities(match[1]).trim() : '';
}

function extractNewsArticleJson(html) {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];

  for (const [, scriptContent] of scripts) {
    const content = scriptContent.trim();
    if (!content.includes('"@type": "NewsArticle"') && !content.includes('"@type":"NewsArticle"')) {
      continue;
    }

    try {
      return JSON.parse(content);
    } catch {
      continue;
    }
  }

  return null;
}

function extractArticleParagraphs(html) {
  return [...html.matchAll(/<div class="pagebody-copy">([\s\S]*?)<\/div>/gi)]
    .map((match) => normalizeWhitespace(stripTags(match[1])))
    .filter(Boolean);
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Repair540 Apple Newsroom Draft Bot/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText} (${url})`);
  }

  return response.text();
}

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function loadArticle(entry) {
  const html = await fetchText(entry.url);
  const newsArticle = extractNewsArticleJson(html);

  return {
    html,
    description: extractMetaContent(html, 'Description') || entry.summary,
    datePublished: newsArticle?.datePublished || entry.updated,
    paragraphs: extractArticleParagraphs(html),
    headline: newsArticle?.headline || entry.title
  };
}

function buildDraftFileContent(entry, article) {
  const blogTitle = buildNaturalTitle(article.headline || entry.title);
  const date = toIsoDate(article.datePublished || entry.updated);
  const excerpt = buildExcerpt(entry, article);
  const body = buildDraftBody(entry, article);

  return `---\nstatus: draft\nsource: "${DEFAULT_SOURCE_NAME}"\nsource_url: "${escapeFrontmatter(entry.url)}"\nsource_category: "${escapeFrontmatter(entry.category || 'Apple Newsroom')}"\nsource_title: "${escapeFrontmatter(entry.title)}"\ncategory: "コラム"\ndate: "${date}"\ntitle: "${escapeFrontmatter(blogTitle)}"\nemoji: "🍎"\nexcerpt: "${escapeFrontmatter(excerpt)}"\n---\n\n${body}\n`;
}

function buildDraftFileName(entry, article) {
  const date = toIsoDate(article.datePublished || entry.updated) || toIsoDate(entry.updated);
  const urlSlug = entry.url.replace(/\/$/, '').split('/').pop();
  return `${date}-${slugify(urlSlug || article.headline || entry.title)}.md`;
}

function initializeState(entries) {
  return {
    source: DEFAULT_SOURCE_NAME,
    initializedAt: new Date().toISOString(),
    lastCheckedAt: null,
    seenEntryUrls: entries.map((entry) => entry.url),
    draftedEntryUrls: []
  };
}

async function writeState(filePath, state, dryRun) {
  const payload = `${JSON.stringify(state, null, 2)}\n`;
  if (dryRun) return;
  await fs.writeFile(filePath, payload, 'utf8');
}

async function writeFileIfNeeded(filePath, content, dryRun) {
  if (dryRun) return;
  await fs.writeFile(filePath, content, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  await ensureDirectory(options.outputDir);

  const feedXml = await fetchText(options.feedUrl);
  const entries = parseEntriesFromFeed(feedXml);

  if (!entries.length) {
    console.log('Apple Newsroom feed did not return any entries.');
    return;
  }

  const existingState = await readJsonIfExists(options.stateFile);
  const state = existingState || initializeState(entries);
  const isFirstRun = !existingState;

  const unseenEntries = entries.filter((entry) => !state.seenEntryUrls.includes(entry.url));
  const targetEntries = isFirstRun ? entries.slice(0, 1) : unseenEntries;

  const generatedFiles = [];

  for (const entry of targetEntries) {
    if (state.draftedEntryUrls.includes(entry.url)) {
      continue;
    }

    const article = await loadArticle(entry);
    const fileName = buildDraftFileName(entry, article);
    const filePath = path.join(options.outputDir, fileName);
    const content = buildDraftFileContent(entry, article);

    await writeFileIfNeeded(filePath, content, options.dryRun);

    generatedFiles.push(path.relative(process.cwd(), filePath));
    state.draftedEntryUrls.push(entry.url);
  }

  state.lastCheckedAt = new Date().toISOString();
  state.seenEntryUrls = Array.from(new Set([...state.seenEntryUrls, ...entries.map((entry) => entry.url)]));

  await writeState(options.stateFile, state, options.dryRun);

  if (!generatedFiles.length) {
    console.log(isFirstRun ? 'No draft generated on bootstrap.' : 'No new Apple Newsroom drafts were needed.');
    return;
  }

  console.log(`Generated ${generatedFiles.length} Apple Newsroom draft(s):`);
  for (const file of generatedFiles) {
    console.log(`- ${file}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
