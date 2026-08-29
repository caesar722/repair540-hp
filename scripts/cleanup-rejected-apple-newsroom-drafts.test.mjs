import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const cleanupScript = fileURLToPath(new URL('./cleanup-rejected-apple-newsroom-drafts.mjs', import.meta.url));
const buildIndexScript = fileURLToPath(new URL('./build-apple-newsroom-drafts-index.mjs', import.meta.url));
const appleUrl = 'https://www.apple.com/jp/newsroom/2020/01/example-story/';

async function createWorkspace(t, posts = []) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'draft-cleanup-test-'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.mkdir(path.join(cwd, 'blog', 'posts', 'rejected'), { recursive: true });
  await fs.writeFile(path.join(cwd, 'posts.json'), `${JSON.stringify({ posts })}\n`);
  return cwd;
}

function draftHtml({
  title = '<h1 class="draft-title">テスト記事</h1>',
  status = 'draft',
  sourceUrl = appleUrl,
  generatedDate = '2020-01-01',
  rejectedDate = ''
} = {}) {
  return [
    '<!doctype html><html><head>',
    `<meta name="draft-status" content="${status}">`,
    `<meta content="${sourceUrl}" name="draft-source-url">`,
    `<meta name="draft-source-date" content="${generatedDate}">`,
    `<meta name="draft-generated-date" content="${generatedDate}">`,
    rejectedDate ? `<meta name="draft-rejected-date" content="${rejectedDate}">` : '',
    '</head><body>',
    title,
    '</body></html>'
  ].join('');
}

async function writeDraft(cwd, relativePath, html) {
  const filePath = path.join(cwd, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, html);
  return filePath;
}

async function runCleanup(cwd, ...args) {
  return execFileAsync(process.execPath, [cleanupScript, ...args], { cwd });
}

test('does not remove files when no deletion condition matches', async (t) => {
  const cwd = await createWorkspace(t);
  const filePath = await writeDraft(
    cwd,
    'blog/posts/2099-01-01-young-draft.html',
    draftHtml({ generatedDate: '2099-01-01' })
  );

  const { stdout } = await runCleanup(cwd);
  assert.match(stdout, /Removed: 0/);
  assert.match(stdout, /Skipped: 1/);
  await fs.access(filePath);
});

test('removes an old, explicitly identified Apple Newsroom draft', async (t) => {
  const cwd = await createWorkspace(t);
  const filePath = await writeDraft(
    cwd,
    'blog/posts/2020-01-01-old-draft.html',
    draftHtml()
  );

  const { stdout } = await runCleanup(cwd);
  assert.match(stdout, /\[REMOVE] blog\/posts\/2020-01-01-old-draft\.html/);
  assert.match(stdout, /Removed: 1/);
  await assert.rejects(fs.access(filePath));
});

test('dry-run reports an old file without deleting it', async (t) => {
  const cwd = await createWorkspace(t);
  const filePath = await writeDraft(
    cwd,
    'blog/posts/2020-01-01-old-draft.html',
    draftHtml()
  );

  const { stdout } = await runCleanup(cwd, '--dry-run');
  assert.match(stdout, /\[DRY-RUN] Would remove: blog\/posts\/2020-01-01-old-draft\.html/);
  assert.match(stdout, /Removed: 0/);
  assert.match(stdout, /Would remove: 1/);
  await fs.access(filePath);
});

test('skips a titleless file and exits successfully', async (t) => {
  const cwd = await createWorkspace(t);
  const relativePath = 'blog/posts/2020-01-01-.html';
  const filePath = await writeDraft(cwd, relativePath, draftHtml({ title: '' }));

  const { stdout, stderr } = await runCleanup(cwd);
  assert.match(stderr, /Failed to extract draft title:\s*blog\/posts\/2020-01-01-\.html/);
  assert.match(stderr, /Skipping this file and continuing cleanup/);
  assert.match(stdout, /Warnings: 1/);
  assert.match(stdout, /Errors: 0/);
  await fs.access(filePath);
});

test('exits successfully when there are no draft HTML files', async (t) => {
  const cwd = await createWorkspace(t);

  const { stdout, stderr } = await runCleanup(cwd);
  assert.equal(stderr, '');
  assert.match(stdout, /Scanned: 0/);
  assert.match(stdout, /Removed: 0/);
  assert.match(stdout, /Errors: 0/);
});

test('continues after one malformed file and processes the next file', async (t) => {
  const cwd = await createWorkspace(t);
  const malformed = await writeDraft(
    cwd,
    'blog/posts/malformed.html',
    '<html><head><meta charset="Shift_JIS"></head><h1>壊れたHTML</h1>'
  );
  const removable = await writeDraft(
    cwd,
    'blog/posts/2020-01-01-valid.html',
    draftHtml({ title: '<h1>削除対象</h1>' })
  );

  const { stdout, stderr } = await runCleanup(cwd);
  assert.match(stderr, /\[WARN] Skipped: blog\/posts\/malformed\.html/);
  assert.match(stderr, /Unsupported HTML character encoding: shift_jis/);
  assert.match(stdout, /Removed: 1/);
  assert.match(stdout, /Warnings: 1/);
  await fs.access(malformed);
  await assert.rejects(fs.access(removable));
});

test('does not use similar titles for matching or delete the published file', async (t) => {
  const publishedRelativePath = 'blog/posts/2020-01-01-published.html';
  const cwd = await createWorkspace(t, [{
    id: 1,
    title: '同じようなタイトル',
    draftFile: publishedRelativePath,
    date: '2020-01-02'
  }]);
  const published = await writeDraft(
    cwd,
    publishedRelativePath,
    draftHtml({ title: '<h1>同じようなタイトル</h1>', status: 'published' })
  );
  const removable = await writeDraft(
    cwd,
    'blog/posts/2020-01-01-active.html',
    draftHtml({ title: '<h1>同じようなタイトル</h1>' })
  );

  const { stdout } = await runCleanup(cwd);
  assert.match(stdout, /published draft is retained/);
  assert.match(stdout, /Removed: 1/);
  await fs.access(published);
  await assert.rejects(fs.access(removable));
});

test('missing required directory is the only kind of fatal workspace error', async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'draft-cleanup-fatal-test-'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.writeFile(path.join(cwd, 'posts.json'), '{"posts":[]}\n');

  await assert.rejects(
    runCleanup(cwd),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Required cleanup directory is unavailable/);
      assert.match(error.stdout, /Errors: 1/);
      return true;
    }
  );
});

test('draft index rebuild succeeds with a skipped file and avoids a second write', async (t) => {
  const cwd = await createWorkspace(t);
  await writeDraft(cwd, 'blog/posts/2020-01-01-.html', draftHtml({ title: '' }));

  const firstRun = await execFileAsync(process.execPath, [buildIndexScript], { cwd });
  assert.match(firstRun.stderr, /Draft index skipped/);
  assert.match(firstRun.stdout, /Updated draft index/);

  const indexPath = path.join(cwd, 'blog', 'posts', 'apple-newsroom-drafts', 'index.html');
  const firstStat = await fs.stat(indexPath);
  const secondRun = await execFileAsync(process.execPath, [buildIndexScript], { cwd });
  const secondStat = await fs.stat(indexPath);

  assert.match(secondRun.stdout, /Draft index unchanged/);
  assert.equal(secondStat.mtimeMs, firstStat.mtimeMs);
});
