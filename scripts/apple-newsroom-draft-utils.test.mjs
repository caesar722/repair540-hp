import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  extractDraftTitle,
  extractDraftTitleDetails
} from './apple-newsroom-draft-utils.mjs';

test('uses frontmatter before every HTML title source', () => {
  const html = [
    '\uFEFF---',
    'title: "Front Matter のタイトル"',
    '---',
    '<title>titleタグ</title>',
    '<h1 class="post-title">h1タイトル</h1>'
  ].join('\n');
  assert.deepEqual(extractDraftTitleDetails(html), {
    title: 'Front Matter のタイトル',
    source: 'frontmatter'
  });
});

test('uses a supported title data attribute', () => {
  assert.deepEqual(
    extractDraftTitleDetails('<article class="draft" data-draft-title="data属性の記事タイトル"></article>'),
    { title: 'data属性の記事タイトル', source: 'data-attribute' }
  );
});

test('uses a title-like h1 before title and generic h1 elements', () => {
  const html = [
    '<title>文書タイトル｜Repair540 下書き</title>',
    '<h1>ブログ</h1>',
    '<h1 id="headline">日本語の <span>記事タイトル</span></h1>'
  ].join('');
  assert.deepEqual(extractDraftTitleDetails(html), {
    title: '日本語の 記事タイトル',
    source: 'h1'
  });
});

test('uses title when h1 is missing and normalizes entities and whitespace', () => {
  assert.equal(
    extractDraftTitle('<title> 修理&#x30FB;交換 &amp; 診断\n｜Repair540 </title>'),
    '修理・交換 & 診断'
  );
});

test('uses og:title regardless of attribute order or quote style', () => {
  const html = "<meta content='OG「記号」タイトル' data-extra=x property=og:title>";
  assert.deepEqual(extractDraftTitleDetails(html), {
    title: 'OG「記号」タイトル',
    source: 'og:title'
  });
});

test('uses twitter:title after og:title', () => {
  const html = '<meta content="Twitter タイトル" name="twitter:title">';
  assert.deepEqual(extractDraftTitleDetails(html), {
    title: 'Twitter タイトル',
    source: 'twitter:title'
  });
});

test('uses the first article heading after the dedicated h1 fallbacks', () => {
  assert.deepEqual(
    extractDraftTitleDetails('<body><h2 class="section">最初の <em>見出し</em></h2><h3>次</h3></body>'),
    { title: '最初の 見出し', source: 'heading' }
  );
});

test('infers a normalized title from the dated filename', () => {
  assert.deepEqual(
    extractDraftTitleDetails('<html><body>本文のみ', '/tmp/2026-07-31-apple-repair_news.html'),
    { title: 'apple repair news', source: 'filename' }
  );
});

test('returns Unknown Title for broken HTML with no inferable filename', () => {
  assert.equal(extractDraftTitle('<h1><span>閉じタグなし'), 'Unknown Title');
});

test('extracts the title from the HTML that triggered the failed workflow', async () => {
  const filePath = path.resolve('blog/posts/2026-07-25-iphone16-nfc-antenna-repair.html');
  const html = await fs.readFile(filePath, 'utf8');
  assert.deepEqual(extractDraftTitleDetails(html, filePath), {
    title: 'iPhone16 NFCアンテナ交換｜NFC決済ができない症状を修理しました',
    source: 'h1'
  });
});
