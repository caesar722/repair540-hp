#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DRAFT_INDEX_HTML_FILE,
  collectDraftEntries,
  escapeHtml,
  formatJaDate,
  getTokyoTodayIso,
  collectActionableDraftEntries
} from './apple-newsroom-draft-utils.mjs';

function getStatusLabel(status) {
  return {
    draft: '下書き',
    published: '公開済み',
    rejected: '却下'
  }[status] || status;
}

function buildDraftHref(relativePath) {
  return `../${relativePath.replace(/^blog\/posts\//, '')}`;
}

function buildPublishedHref(postId) {
  return `../../../post.html?id=${postId}`;
}

function renderLinks(entry) {
  const links = [
    `<a href="${escapeHtml(buildDraftHref(entry.relativePath))}" target="_blank" rel="noopener">下書きを開く</a>`
  ];

  if (entry.publishedPostId) {
    links.push(`<a href="${escapeHtml(buildPublishedHref(entry.publishedPostId))}" target="_blank" rel="noopener">公開記事</a>`);
  }

  if (entry.sourceUrl) {
    links.push(`<a href="${escapeHtml(entry.sourceUrl)}" target="_blank" rel="noopener">元記事</a>`);
  }

  return links.join('<span class="draft-link-sep">/</span>');
}

function renderSelectionBadge(selectionNumber) {
  if (!selectionNumber) return '';
  return `
            <div class="draft-selection-card">
              <div class="draft-cell-label">選択番号</div>
              <div class="draft-selection-number">${selectionNumber}</div>
            </div>
  `;
}

function renderRows(entries, selectionNumbers) {
  if (!entries.length) {
    return `<div class="draft-empty">現在管理対象のApple Newsroom下書きはありません。</div>`;
  }

  return entries.map((entry) => `
      <article class="draft-row status-${escapeHtml(entry.status)}">
        <div class="draft-cell draft-cell-title">
          <div class="draft-cell-label">記事タイトル</div>
          <h2>${escapeHtml(entry.title)}</h2>
          ${renderSelectionBadge(selectionNumbers.get(entry.relativePath))}
          <div class="draft-links">${renderLinks(entry)}</div>
        </div>
        <div class="draft-cell">
          <div class="draft-cell-label">元記事日付</div>
          <div class="draft-cell-value">${escapeHtml(formatJaDate(entry.sourceDate))}</div>
        </div>
        <div class="draft-cell">
          <div class="draft-cell-label">生成日</div>
          <div class="draft-cell-value">${escapeHtml(formatJaDate(entry.generatedDate))}</div>
        </div>
        <div class="draft-cell">
          <div class="draft-cell-label">公開状態</div>
          <div class="draft-status-badge status-${escapeHtml(entry.status)}">${escapeHtml(getStatusLabel(entry.status))}</div>
        </div>
      </article>
  `).join('\n');
}

function buildHtml(entries, actionableEntries) {
  const today = formatJaDate(getTokyoTodayIso());
  const counts = entries.reduce((acc, entry) => {
    acc[entry.status] = (acc[entry.status] || 0) + 1;
    return acc;
  }, { draft: 0, published: 0, rejected: 0 });
  const selectionNumbers = new Map(
    actionableEntries.map((entry, index) => [entry.relativePath, String(index + 1)])
  );

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Apple Newsroom下書き管理｜Repair540</title>
  <meta name="robots" content="noindex,nofollow">
  <link rel="stylesheet" href="../../../style.css">
  <style>
    body { background: #f5f7fb; }
    .draft-admin-wrap { max-width: 1180px; margin: 0 auto; padding: 48px 20px 72px; }
    .draft-admin-head { margin-bottom: 28px; }
    .draft-admin-head h1 { font-size: clamp(1.8rem, 3vw, 2.4rem); line-height: 1.3; margin-bottom: 10px; }
    .draft-admin-head p { color: var(--text-sub); }
    .draft-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 24px 0 32px; }
    .draft-summary-card { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; box-shadow: var(--shadow); }
    .draft-summary-card .label { display: block; color: var(--text-sub); font-size: .85rem; margin-bottom: 6px; }
    .draft-summary-card .value { font-size: 1.5rem; font-weight: 800; }
    .draft-list { display: grid; gap: 14px; }
    .draft-row { display: grid; grid-template-columns: minmax(0, 3.4fr) 1.2fr 1.2fr .95fr; gap: 18px; align-items: center; background: #fff; border: 1px solid var(--border); border-radius: 16px; padding: 18px 20px; box-shadow: var(--shadow); }
    .draft-row.status-draft { border-left: 5px solid #0b7aff; }
    .draft-row.status-published { border-left: 5px solid #16a34a; }
    .draft-row.status-rejected { border-left: 5px solid #9ca3af; }
    .draft-cell-label { color: var(--text-sub); font-size: .8rem; margin-bottom: 4px; }
    .draft-cell-title h2 { font-size: 1.02rem; line-height: 1.55; margin-bottom: 10px; }
    .draft-cell-value { font-weight: 600; }
    .draft-selection-card { display: inline-flex; align-items: center; gap: 10px; margin-bottom: 10px; padding: 8px 12px; border-radius: 12px; background: rgba(11,122,255,.08); }
    .draft-selection-card .draft-cell-label { margin: 0; }
    .draft-selection-number { font-size: 1rem; font-weight: 800; color: #0b7aff; }
    .draft-links { display: flex; flex-wrap: wrap; gap: 8px; font-size: .88rem; }
    .draft-link-sep { color: var(--text-sub); }
    .draft-status-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 84px; padding: 8px 12px; border-radius: 999px; font-size: .85rem; font-weight: 700; }
    .draft-status-badge.status-draft { background: rgba(11,122,255,.1); color: #0b7aff; }
    .draft-status-badge.status-published { background: rgba(22,163,74,.12); color: #15803d; }
    .draft-status-badge.status-rejected { background: rgba(107,114,128,.12); color: #4b5563; }
    .draft-empty { background: #fff; border: 1px solid var(--border); border-radius: 16px; padding: 28px; text-align: center; color: var(--text-sub); box-shadow: var(--shadow); }
    .draft-note { margin-top: 18px; color: var(--text-sub); font-size: .9rem; }
    @media (max-width: 900px) {
      .draft-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .draft-row { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 640px) {
      .draft-admin-wrap { padding: 28px 14px 48px; }
      .draft-summary { grid-template-columns: 1fr 1fr; gap: 10px; }
      .draft-summary-card { padding: 14px 16px; }
      .draft-summary-card .value { font-size: 1.25rem; }
      .draft-row { grid-template-columns: 1fr; gap: 14px; padding: 16px; }
      .draft-cell-title h2 { font-size: .98rem; }
    }
  </style>
</head>
<body>
  <main class="draft-admin-wrap">
    <div class="draft-admin-head">
      <h1>Apple Newsroom下書き管理</h1>
      <p>下書きの確認、公開済み判定、却下済みの保管状況を一覧で確認できます。公開・却下 workflow では、この一覧の選択番号または記事タイトルを入力してください。</p>
    </div>

    <section class="draft-summary" aria-label="下書き件数">
      <div class="draft-summary-card"><span class="label">最終更新</span><span class="value">${escapeHtml(today)}</span></div>
      <div class="draft-summary-card"><span class="label">下書き</span><span class="value">${counts.draft}</span></div>
      <div class="draft-summary-card"><span class="label">公開済み</span><span class="value">${counts.published}</span></div>
      <div class="draft-summary-card"><span class="label">却下</span><span class="value">${counts.rejected}</span></div>
    </section>

    <section class="draft-list" aria-label="下書き一覧">
${renderRows(entries, selectionNumbers)}
    </section>

    <p class="draft-note">公開は GitHub Actions の <code>Publish Apple Newsroom Draft</code>、却下は <code>Reject Apple Newsroom Draft</code> を使います。入力欄には、この一覧の選択番号または記事タイトルをそのまま入力してください。</p>
  </main>
</body>
</html>
`;
}

async function main() {
  const entries = await collectDraftEntries();
  const actionableEntries = await collectActionableDraftEntries();
  const html = buildHtml(entries, actionableEntries);
  await fs.mkdir(path.dirname(DRAFT_INDEX_HTML_FILE), { recursive: true });
  await fs.writeFile(DRAFT_INDEX_HTML_FILE, html, 'utf8');
  console.log(`Updated draft index: ${DRAFT_INDEX_HTML_FILE}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
