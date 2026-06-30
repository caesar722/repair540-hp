#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  BLOG_POSTS_DIR,
  REJECTED_DRAFTS_DIR,
  extractMetaContent,
  getTokyoTodayIso,
  isDraftHtmlFilename,
  parseDateFromFileName,
  readDraftEntry,
  readPostsMap,
  relativeDraftPath
} from './apple-newsroom-draft-utils.mjs';

const DRAFT_RETENTION_DAYS = 7;
const REJECTED_RETENTION_DAYS = 30;

function diffDays(fromIsoDate, toIsoDate) {
  const from = new Date(`${fromIsoDate}T00:00:00+09:00`);
  const to = new Date(`${toIsoDate}T00:00:00+09:00`);
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

async function main() {
  const today = getTokyoTodayIso();
  const removedDrafts = [];
  const removedRejectedDrafts = [];
  const { byDraftFile } = await readPostsMap();

  try {
    const directories = [BLOG_POSTS_DIR, REJECTED_DRAFTS_DIR];

    for (const directory of directories) {
      let entries = [];

      try {
        entries = await fs.readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (error && error.code === 'ENOENT') continue;
        throw error;
      }

      for (const entry of entries) {
        if (!entry.isFile() || !isDraftHtmlFilename(entry.name)) continue;

        const filePath = path.join(directory, entry.name);
        const draftEntry = await readDraftEntry(filePath, byDraftFile);

        if (draftEntry.status === 'draft') {
          const generatedDate = draftEntry.generatedDate || parseDateFromFileName(filePath);
          if (diffDays(generatedDate, today) < DRAFT_RETENTION_DAYS) continue;

          await fs.rm(filePath, { force: true });
          removedDrafts.push(relativeDraftPath(filePath));
          continue;
        }

        if (draftEntry.status === 'rejected') {
          const rejectedDate = extractMetaContent(draftEntry.html, 'draft-rejected-date') || parseDateFromFileName(filePath);
          if (diffDays(rejectedDate, today) < REJECTED_RETENTION_DAYS) continue;

          await fs.rm(filePath, { force: true });
          removedRejectedDrafts.push(relativeDraftPath(filePath));
        }
      }
    }
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
  }

  if (!removedDrafts.length && !removedRejectedDrafts.length) {
    console.log('No Apple Newsroom drafts were old enough to remove.');
    return;
  }

  if (removedDrafts.length) {
    console.log(`Removed ${removedDrafts.length} stale draft(s) older than ${DRAFT_RETENTION_DAYS} day(s):`);
    for (const filePath of removedDrafts) {
      console.log(`- ${filePath}`);
    }
  }

  if (removedRejectedDrafts.length) {
    console.log(`Removed ${removedRejectedDrafts.length} rejected draft(s) older than ${REJECTED_RETENTION_DAYS} day(s):`);
    for (const filePath of removedRejectedDrafts) {
      console.log(`- ${filePath}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
