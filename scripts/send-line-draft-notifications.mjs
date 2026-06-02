#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const options = {
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

    if (key === '--report-file') {
      options.reportFile = path.resolve(process.cwd(), value);
    }
  }

  return options;
}

function buildNotificationText(draft) {
  const date = (draft.date || '').replace(/-/g, '/');

  return [
    'Repair540ブログ下書きを作成しました。',
    '',
    'タイトル：',
    draft.title,
    '',
    '投稿日：',
    date,
    '',
    '保存場所：',
    draft.filePath,
    '',
    'ニュース元：',
    draft.sourceUrl,
    '',
    '内容を確認後、公開してください。'
  ].join('\n');
}

async function sendPushMessage({ channelAccessToken, to, text, dryRun }) {
  if (dryRun) {
    console.log(text);
    return;
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`
    },
    body: JSON.stringify({
      to,
      messages: [
        {
          type: 'text',
          text
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE push message failed: ${response.status} ${response.statusText} - ${body}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const reportFile = options.reportFile;

  if (!reportFile) {
    throw new Error('Missing --report-file option.');
  }

  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_USER_ID;

  if (!channelAccessToken) {
    throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN environment variable.');
  }

  if (!to) {
    throw new Error('Missing LINE_USER_ID environment variable.');
  }

  const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
  const drafts = Array.isArray(report.drafts) ? report.drafts : [];

  if (!drafts.length) {
    console.log('No LINE notifications were needed.');
    return;
  }

  for (const draft of drafts) {
    const message = buildNotificationText(draft);
    await sendPushMessage({
      channelAccessToken,
      to,
      text: message,
      dryRun: options.dryRun
    });
  }

  console.log(`Sent ${drafts.length} LINE draft notification(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
