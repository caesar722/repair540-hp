#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  BLOG_POSTS_DIR,
  REJECTED_DRAFTS_DIR,
  getTokyoTodayIso,
  isDraftHtmlFilename,
  readDraftEntry,
  readPostsMap
} from './apple-newsroom-draft-utils.mjs';

const DRAFT_RETENTION_DAYS = 7;
const REJECTED_RETENTION_DAYS = 30;
const APPLE_NEWSROOM_HOSTS = new Set(['apple.com', 'www.apple.com']);

function createSummary(dryRun) {
  return {
    dryRun,
    scanned: 0,
    removed: 0,
    wouldRemove: 0,
    skipped: 0,
    warnings: 0,
    errors: 0
  };
}

function printSummary(summary) {
  console.log('Cleanup complete.');
  console.log(`Scanned: ${summary.scanned}`);
  console.log(`Removed: ${summary.removed}`);
  console.log(`Would remove: ${summary.wouldRemove}`);
  console.log(`Skipped: ${summary.skipped}`);
  console.log(`Warnings: ${summary.warnings}`);
  console.log(`Errors: ${summary.errors}`);
}

function warn(summary, relativePath, reason) {
  summary.skipped += 1;
  summary.warnings += 1;
  if (reason === 'draft title could not be extracted') {
    console.warn('[WARN] Failed to extract draft title:');
    console.warn(relativePath);
    console.warn('Skipping this file and continuing cleanup.');
    return;
  }
  console.warn(`[WARN] Skipped: ${relativePath}`);
  console.warn(`Reason: ${reason}`);
}

function infoSkipped(summary, relativePath, reason) {
  summary.skipped += 1;
  console.log(`[SKIP] ${relativePath}`);
  console.log(`Reason: ${reason}`);
}

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) return null;
  return timestamp;
}

function diffDays(fromIsoDate, toIsoDate) {
  const from = parseIsoDate(fromIsoDate);
  const to = parseIsoDate(toIsoDate);
  if (!from || !to) return null;
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

function isAppleNewsroomUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      APPLE_NEWSROOM_HOSTS.has(url.hostname.toLowerCase()) &&
      /^\/(?:[a-z]{2}\/)?newsroom\//i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function getDeletionDecision(entry, today) {
  if (!entry.titleFound) {
    return { action: 'warn', reason: 'draft title could not be extracted' };
  }

  if (!isAppleNewsroomUrl(entry.sourceUrl)) {
    return { action: 'skip', reason: 'not an identified Apple Newsroom draft' };
  }

  if (entry.status === 'published') {
    return { action: 'skip', reason: 'published draft is retained' };
  }

  let retentionDays;
  let referenceDate;

  if (entry.status === 'draft' && entry.declaredStatus === 'draft') {
    retentionDays = DRAFT_RETENTION_DAYS;
    referenceDate = entry.generatedDate;
  } else if (entry.status === 'rejected' && entry.declaredStatus === 'rejected') {
    retentionDays = REJECTED_RETENTION_DAYS;
    referenceDate = entry.rejectedDate;
  } else {
    return { action: 'warn', reason: 'draft status or location is ambiguous' };
  }

  const ageDays = diffDays(referenceDate, today);
  if (ageDays === null) {
    return { action: 'warn', reason: 'retention date is missing or invalid' };
  }
  if (ageDays < retentionDays) {
    return { action: 'skip', reason: `retained for ${retentionDays} days (age: ${ageDays} days)` };
  }

  return {
    action: 'remove',
    reason: `${entry.status} retention expired (${ageDays} days old)`,
    ageDays
  };
}

async function assertDirectory(directory) {
  let stat;
  try {
    stat = await fs.stat(directory);
  } catch (error) {
    throw new Error(`Required cleanup directory is unavailable: ${directory} (${error.message})`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Required cleanup path is not a directory: ${directory}`);
  }
}

async function writeGitHubOutput(summary) {
  if (!process.env.GITHUB_OUTPUT) return;
  await fs.appendFile(
    process.env.GITHUB_OUTPUT,
    `removed=${summary.removed}\nwould_remove=${summary.wouldRemove}\nskipped=${summary.skipped}\n`
  );
}

export async function runCleanup({ dryRun = false } = {}) {
  const summary = createSummary(dryRun);
  const today = getTokyoTodayIso();
  let successfullyRead = 0;
  let permissionReadFailures = 0;

  await assertDirectory(BLOG_POSTS_DIR);
  await assertDirectory(REJECTED_DRAFTS_DIR);

  let byDraftFile;
  try {
    ({ byDraftFile } = await readPostsMap());
  } catch (error) {
    throw new Error(`Required posts.json could not be read: ${error.message}`);
  }

  for (const directory of [BLOG_POSTS_DIR, REJECTED_DRAFTS_DIR]) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      throw new Error(`Cleanup directory could not be read: ${directory} (${error.message})`);
    }

    for (const directoryEntry of entries) {
      if (!directoryEntry.isFile() || !isDraftHtmlFilename(directoryEntry.name)) continue;

      summary.scanned += 1;
      const filePath = path.join(directory, directoryEntry.name);
      const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');

      try {
        const draftEntry = await readDraftEntry(filePath, byDraftFile);
        successfullyRead += 1;
        const decision = getDeletionDecision(draftEntry, today);

        if (decision.action === 'warn') {
          warn(summary, relativePath, decision.reason);
          continue;
        }
        if (decision.action === 'skip') {
          infoSkipped(summary, relativePath, decision.reason);
          continue;
        }

        if (dryRun) {
          summary.wouldRemove += 1;
          console.log(`[DRY-RUN] Would remove: ${relativePath}`);
          console.log(`Reason: ${decision.reason}; title source: ${draftEntry.titleSource}`);
          continue;
        }

        await fs.rm(filePath);
        summary.removed += 1;
        console.log(`[REMOVE] ${relativePath}`);
        console.log(`Reason: ${decision.reason}; title source: ${draftEntry.titleSource}`);
      } catch (error) {
        if (error && ['EACCES', 'EPERM'].includes(error.code)) {
          permissionReadFailures += 1;
        }
        warn(summary, relativePath, error instanceof Error ? error.message : String(error));
      }
    }
  }

  if (summary.scanned > 0 && successfullyRead === 0 && permissionReadFailures === summary.scanned) {
    throw new Error('Permission errors prevented every draft file from being read.');
  }

  await writeGitHubOutput(summary);
  printSummary(summary);
  return summary;
}

function parseArguments(argv) {
  const unknownArguments = argv.filter((argument) => argument !== '--dry-run');
  if (unknownArguments.length) {
    throw new Error(`Unknown cleanup option: ${unknownArguments.join(', ')}`);
  }
  return { dryRun: argv.includes('--dry-run') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    await runCleanup(options);
  } catch (error) {
    const summary = createSummary(Boolean(options?.dryRun));
    summary.errors = 1;
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    printSummary(summary);
    process.exitCode = 1;
  }
}
