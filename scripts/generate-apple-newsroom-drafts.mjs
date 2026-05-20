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
    reportFile: null,
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
    if (key === '--report-file') options.reportFile = path.resolve(process.cwd(), value);
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
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

function toSlashDate(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Tokyo'
  }).format(date).replace(/\//g, '/');
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
    return 'iPhoneやiPadの使いやすさを見直したい方、アクセシビリティ設定を活用したい方には特に関係のある内容です。普段の操作で困りごとがあるお客様にも参考になりそうです。';
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

function buildDraftText(entry, article) {
  const publishedJa = toJaDate(article.datePublished || entry.updated);
  const leadSummary = paraphraseSummary(article.description || entry.summary);
  const detailParagraphs = chooseRelevantParagraphs(article.paragraphs);
  const detailOne = detailParagraphs[0] ? takeSentences(detailParagraphs[0], 2) : leadSummary;
  const detailTwo = detailParagraphs[1] ? takeSentences(detailParagraphs[1], 2) : '';
  const relevance = buildCustomerRelevance(entry.title, `${detailOne}\n${detailTwo}`);

  return [
    `Appleが${publishedJa}に公開した公式Newsroomの記事では、${leadSummary}`,
    detailOne ? `今回の発表では、${detailOne}` : '',
    detailTwo ? `さらに、${detailTwo}` : '',
    relevance,
    `ニュース元：\n${entry.url}`
  ].filter(Boolean);
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
    description: extractMetaContent(html, 'Description') || entry.summary,
    datePublished: newsArticle?.datePublished || entry.updated,
    paragraphs: extractArticleParagraphs(html),
    headline: newsArticle?.headline || entry.title
  };
}

function buildDraftFileName(entry, article) {
  const date = toIsoDate(article.datePublished || entry.updated) || toIsoDate(entry.updated);
  const urlSlug = entry.url.replace(/\/$/, '').split('/').pop();
  return `${date}-${slugify(urlSlug || article.headline || entry.title)}.html`;
}

function buildDraftFileContent(entry, article) {
  const blogTitle = buildNaturalTitle(article.headline || entry.title);
  const dateIso = toIsoDate(article.datePublished || entry.updated);
  const dateJa = toJaDate(article.datePublished || entry.updated);
  const excerpt = buildExcerpt(entry, article);
  const bodyParagraphs = buildDraftText(entry, article);
  const renderedBody = bodyParagraphs
    .map((paragraph) => {
      if (paragraph.startsWith('ニュース元：\n')) {
        const url = paragraph.split('\n').slice(1).join('\n').trim();
        return `<div class="draft-source-box"><h2>ニュース元</h2><p><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a></p><p>内容を確認後、公開してください。</p></div>`;
      }
      return `<p>${escapeHtml(paragraph)}</p>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(blogTitle)}｜Repair540 下書き</title>
  <meta name="description" content="${escapeHtml(excerpt)}">
  <meta name="robots" content="noindex,nofollow">
  <meta name="draft-status" content="draft">
  <meta name="draft-source" content="${escapeHtml(DEFAULT_SOURCE_NAME)}">
  <meta name="draft-source-url" content="${escapeHtml(entry.url)}">
  <link rel="stylesheet" href="../../style.css">
  <style>
    body { background: #f5f7fb; }
    .draft-wrap { max-width: 860px; margin: 0 auto; padding: 48px 20px 72px; }
    .draft-card { background: #fff; border: 1px solid var(--border); border-radius: 18px; padding: 32px; box-shadow: var(--shadow); }
    .draft-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: rgba(11,122,255,.08); color: var(--primary); font-size: .875rem; font-weight: 700; margin-bottom: 18px; }
    .draft-title { font-size: clamp(1.7rem, 3vw, 2.2rem); line-height: 1.4; margin-bottom: 14px; }
    .draft-meta { display: flex; flex-wrap: wrap; gap: 10px 18px; color: var(--text-sub); font-size: .95rem; margin-bottom: 24px; }
    .draft-lead { font-size: 1rem; line-height: 1.9; color: var(--text); }
    .draft-lead p { margin-bottom: 1.15em; }
    .draft-note { margin-top: 28px; padding: 18px 20px; border-left: 4px solid var(--primary); background: #f7fbff; border-radius: 12px; }
    .draft-note p { margin: 0; color: var(--text-sub); }
    .draft-source-box { margin-top: 28px; padding: 20px; border: 1px solid var(--border); border-radius: 14px; background: #fafcff; }
    .draft-source-box h2 { font-size: 1rem; margin-bottom: 10px; }
    .draft-source-box p { margin-bottom: .75em; }
    .draft-source-box p:last-child { margin-bottom: 0; }
    @media (max-width: 640px) {
      .draft-wrap { padding: 28px 14px 48px; }
      .draft-card { padding: 24px 18px; border-radius: 14px; }
      .draft-meta { font-size: .9rem; }
    }
  </style>
</head>
<body>
  <main class="draft-wrap">
    <article class="draft-card">
      <div class="draft-badge">Repair540 ブログ下書き</div>
      <h1 class="draft-title">${escapeHtml(blogTitle)}</h1>
      <div class="draft-meta">
        <span>カテゴリー：コラム</span>
        <span>投稿日：${escapeHtml(dateJa)}</span>
        <span>元記事日付：${escapeHtml(dateIso)}</span>
      </div>
      <div class="draft-lead">
        ${renderedBody}
      </div>
      <div class="draft-note">
        <p>このファイルは自動生成された下書きです。Repair540向けの表現や補足を確認したうえで、公開用に <code>posts.json</code> へ転記してください。</p>
      </div>
    </article>
  </main>
</body>
</html>
`;
}

function initializeState(entries) {
  return {
    source: DEFAULT_SOURCE_NAME,
    initializedAt: new Date().toISOString(),
    seenEntryUrls: entries.map((entry) => entry.url),
    draftedEntryUrls: []
  };
}

async function writeJsonIfChanged(filePath, value, dryRun) {
  const nextPayload = `${JSON.stringify(value, null, 2)}\n`;
  const current = await readJsonIfExists(filePath);
  const currentPayload = current ? `${JSON.stringify(current, null, 2)}\n` : null;

  if (currentPayload === nextPayload) return false;
  if (dryRun) return true;

  await fs.writeFile(filePath, nextPayload, 'utf8');
  return true;
}

async function writeTextFile(filePath, content, dryRun) {
  if (dryRun) return;
  await fs.writeFile(filePath, content, 'utf8');
}

async function writeReport(filePath, report, dryRun) {
  if (!filePath) return;
  const payload = `${JSON.stringify(report, null, 2)}\n`;
  if (dryRun) return;
  await fs.writeFile(filePath, payload, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await ensureDirectory(options.outputDir);

  const feedXml = await fetchText(options.feedUrl);
  const entries = parseEntriesFromFeed(feedXml);

  if (!entries.length) {
    throw new Error('Apple Newsroom feed did not return any entries.');
  }

  const existingState = await readJsonIfExists(options.stateFile);
  const state = existingState || initializeState(entries);
  const isFirstRun = !existingState;
  const unseenEntries = entries.filter((entry) => !state.seenEntryUrls.includes(entry.url));
  const targetEntries = isFirstRun ? entries.slice(0, 1) : unseenEntries;
  const generatedDrafts = [];

  for (const entry of targetEntries) {
    if (state.draftedEntryUrls.includes(entry.url)) {
      continue;
    }

    const article = await loadArticle(entry);
    const fileName = buildDraftFileName(entry, article);
    const filePath = path.join(options.outputDir, fileName);
    const content = buildDraftFileContent(entry, article);
    const title = buildNaturalTitle(article.headline || entry.title);
    const publishedDate = toIsoDate(article.datePublished || entry.updated);

    await writeTextFile(filePath, content, options.dryRun);

    generatedDrafts.push({
      title,
      date: publishedDate,
      sourceUrl: entry.url,
      filePath: path.relative(process.cwd(), filePath)
    });

    state.draftedEntryUrls.push(entry.url);
  }

  const nextSeenUrls = targetEntries.length
    ? Array.from(new Set([...state.seenEntryUrls, ...entries.map((entry) => entry.url)]))
    : state.seenEntryUrls;

  let stateChanged = false;
  if (JSON.stringify(nextSeenUrls) !== JSON.stringify(state.seenEntryUrls)) {
    state.seenEntryUrls = nextSeenUrls;
    stateChanged = true;
  }

  if (generatedDrafts.length) {
    stateChanged = true;
  }

  if (stateChanged || isFirstRun) {
    await writeJsonIfChanged(options.stateFile, state, options.dryRun);
  }

  const report = {
    source: DEFAULT_SOURCE_NAME,
    checkedAt: new Date().toISOString(),
    draftCount: generatedDrafts.length,
    drafts: generatedDrafts
  };

  await writeReport(options.reportFile, report, options.dryRun);

  if (!generatedDrafts.length) {
    console.log(isFirstRun ? 'No draft generated on bootstrap.' : 'No new Apple Newsroom drafts were needed.');
    return;
  }

  console.log(`Generated ${generatedDrafts.length} Apple Newsroom draft(s):`);
  for (const draft of generatedDrafts) {
    console.log(`- ${draft.filePath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
