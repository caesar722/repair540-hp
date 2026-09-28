import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractDraftTitle,
  extractDraftTitleDetails,
  isAppleNewsroomDraftHtml
} from './apple-newsroom-draft-utils.mjs';

const appleSourceMeta = '<meta name="draft-source-url" content="https://www.apple.com/jp/newsroom/2026/01/example/">';

test('identifies a newly generated Apple Newsroom draft by its explicit type', () => {
  assert.equal(isAppleNewsroomDraftHtml('<meta content="apple-newsroom" name="draft-type">'), true);
});

test('identifies a legacy Apple Newsroom draft by its source URL', () => {
  assert.equal(isAppleNewsroomDraftHtml(appleSourceMeta), true);
});

test('does not identify a normal Repair540 blog post as an Apple Newsroom draft', () => {
  const html = '<title>通常記事</title><h1>ブログ</h1><h1 class="post-title">修理事例</h1>';
  assert.equal(isAppleNewsroomDraftHtml(html), false);
});

test('does not trust a non-Apple source URL as a legacy draft marker', () => {
  assert.equal(isAppleNewsroomDraftHtml('<meta name="draft-source-url" content="https://example.com/newsroom/story/">'), false);
});

test('extracts the current draft-title heading', () => {
  assert.deepEqual(extractDraftTitleDetails('<h1 class="draft-title">記事タイトル</h1>'), {
    title: '記事タイトル',
    source: 'h1.draft-title'
  });
});

test('extracts draft-title when the class has multiple values', () => {
  assert.equal(extractDraftTitle('<h1 class="featured draft-title wide">複数クラス</h1>'), '複数クラス');
});

test('extracts draft-title regardless of attribute order', () => {
  assert.equal(extractDraftTitle('<h1 id="headline" data-kind="draft" class="draft-title">属性順変更</h1>'), '属性順変更');
});

test('falls back to the dedicated draft-title meta element', () => {
  assert.deepEqual(extractDraftTitleDetails('<meta content="メタのタイトル" name="draft-title">'), {
    title: 'メタのタイトル',
    source: 'meta.draft-title'
  });
});

test('does not use post-title or document title as a draft title', () => {
  const html = '<title>文書タイトル</title><h1 class="post-title">通常記事</h1>';
  assert.deepEqual(extractDraftTitleDetails(html), { title: '', source: '' });
});

test('includes the file path when a managed draft title cannot be extracted', () => {
  assert.throws(
    () => extractDraftTitle(appleSourceMeta, '/tmp/blog/posts/2026-01-01-broken.html'),
    /Failed to extract Apple Newsroom draft title.*2026-01-01-broken\.html/
  );
});
