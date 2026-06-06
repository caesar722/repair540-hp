#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  REJECTED_DRAFTS_DIR,
  extractMetaContent,
  getTokyoTodayIso,
  isDraftHtmlFilename,
  parseDateFromFileName,
  relativeDraftPath
} from './apple-newsroom-draft-utils.mjs';

const RETENTION_DAYS = 30;

function diffDays(fromIsoDate, toIsoDate) {
  const from = new Date(`${fromIsoDate}T00:00:00+09:00`);
  const to = new Date(`${toIsoDate}T00:00:00+09:00`);
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

async function main() {
  const today = getTokyoTodayIso();
  const removed = [];

  try {
    const entries = await fs.readdir(REJECTED_DRAFTS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !isDraftHtmlFilename(entry.name)) continue;

      const filePath = path.join(REJECTED_DRAFTS_DIR, entry.name);
      const html = await fs.readFile(filePath, 'utf8');
      const rejectedDate = extractMetaContent(html, 'draft-rejected-date') || parseDateFromFileName(filePath);

      if (diffDays(rejectedDate, today) < RETENTION_DAYS) continue;

      await fs.rm(filePath, { force: true });
      removed.push(relativeDraftPath(filePath));
    }
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
  }

  if (!removed.length) {
    console.log('No rejected drafts were old enough to remove.');
    return;
  }

  console.log(`Removed ${removed.length} rejected draft(s):`);
  for (const filePath of removed) {
    console.log(`- ${filePath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
