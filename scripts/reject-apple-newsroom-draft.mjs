#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  REJECTED_DRAFTS_DIR,
  collectActionableDraftEntries,
  ensureRejectedDir,
  getTokyoTodayIso,
  relativeDraftPath,
  resolveDraftSelection,
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
  if (!String(draftTitle).trim()) {
    throw new Error('Missing --draft-title option.');
  }

  const entries = await collectActionableDraftEntries();
  return resolveDraftSelection(entries, draftTitle, '--draft-title');
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
