#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  POSTS_JSON_FILE,
  REJECTED_DRAFTS_DIR,
  collectDraftEntries,
  ensureRejectedDir,
  getTokyoTodayIso,
  normalizeTitle,
  relativeDraftPath,
  upsertMetaContent
} from './apple-newsroom-draft-utils.mjs';

function parseArgs(argv) {
  const options = {
    draftTitle: '',
    dryRun: false
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    const [key, value] = arg.split('=');
    if (!value) continue;
    if (key === '--draft-title') options.draftTitle = value.trim();
  }

  return options;
}

async function resolveDraftByTitle(draftTitle) {
  const requested = normalizeTitle(draftTitle);
  if (!requested) {
    throw new Error('Missing --draft-title option.');
  }

  const payload = JSON.parse(await fs.readFile(POSTS_JSON_FILE, 'utf8'));
  const publishedDrafts = new Set((payload.posts || []).map((post) => String(post.draftFile || '').replace(/\\/g, '/')));
  const entries = (await collectDraftEntries()).filter((entry) => (
    entry.status === 'draft' &&
    !publishedDrafts.has(entry.relativePath) &&
    entry.relativePath.startsWith('blog/posts/') &&
    !entry.relativePath.startsWith('blog/posts/rejected/')
  ));

  const exactMatches = entries.filter((entry) => normalizeTitle(entry.title) === requested);
  if (exactMatches.length === 1) return exactMatches[0];

  const partialMatches = entries.filter((entry) => normalizeTitle(entry.title).includes(requested));
  if (partialMatches.length === 1) return partialMatches[0];

  const matches = exactMatches.length > 1 ? exactMatches : partialMatches;
  if (matches.length > 1) {
    throw new Error(
      [
        `Multiple drafts matched title "${draftTitle}". Please use a more specific title.`,
        ...matches.map((entry) => `- ${entry.title}`)
      ].join('\n')
    );
  }

  throw new Error(
    [
      `No active draft matched title "${draftTitle}". Available drafts:`,
      ...entries.map((entry) => `- ${entry.title}`)
    ].join('\n')
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = await resolveDraftByTitle(options.draftTitle);
  const today = getTokyoTodayIso();
  const destination = path.join(REJECTED_DRAFTS_DIR, path.basename(target.filePath));
  const nextRelativePath = relativeDraftPath(destination);

  if (options.dryRun) {
    console.log(JSON.stringify({
      title: target.title,
      currentFile: target.relativePath,
      destinationFile: nextRelativePath,
      rejectedDate: today
    }, null, 2));
    return;
  }

  await ensureRejectedDir();

  let nextHtml = target.html;
  nextHtml = upsertMetaContent(nextHtml, 'draft-status', 'rejected');
  nextHtml = upsertMetaContent(nextHtml, 'draft-rejected-date', today);

  await fs.writeFile(target.filePath, nextHtml, 'utf8');
  await fs.rename(target.filePath, destination);

  console.log(`Rejected draft title: ${target.title}`);
  console.log(`Moved to: ${nextRelativePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
