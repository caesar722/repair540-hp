import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const siteUrl = 'https://caesar722.github.io/repair540-hp/';
const key = process.env.INDEXNOW_KEY?.trim();
const before = process.env.BEFORE_SHA;
const after = process.env.AFTER_SHA || 'HEAD';

if (!key) {
  console.log('INDEXNOW_KEY is not configured; skipping IndexNow submission.');
  process.exit(0);
}
if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) {
  throw new Error('INDEXNOW_KEY has an invalid format.');
}
if (!existsSync(`${key}.txt`) || readFileSync(`${key}.txt`, 'utf8').trim() !== key) {
  throw new Error(`Add the IndexNow verification file ${key}.txt to the repository root.`);
}

const sitemap = readFileSync('sitemap.xml', 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) =>
  url.replaceAll('&amp;', '&')
);

let changedFiles = [];
if (before && !/^0+$/.test(before)) {
  changedFiles = execFileSync('git', ['diff', '--name-only', before, after], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
}

const submitAll = !changedFiles.length || changedFiles.some(file =>
  ['posts.json', 'sitemap.xml', 'post.html'].includes(file)
);
const changedPaths = new Set(changedFiles.filter(file => file.endsWith('.html')));
const urlList = submitAll
  ? sitemapUrls
  : sitemapUrls.filter(url => {
      const path = decodeURI(new URL(url).pathname).replace('/repair540-hp/', '');
      return changedPaths.has(path) || (path === '' && changedPaths.has('index.html'));
    });

if (!urlList.length) {
  console.log('No indexable URL changed; skipping IndexNow submission.');
  process.exit(0);
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: 'caesar722.github.io',
    key,
    keyLocation: `${siteUrl}${key}.txt`,
    urlList
  })
});

if (!response.ok && response.status !== 202) {
  throw new Error(`IndexNow returned HTTP ${response.status}: ${await response.text()}`);
}
console.log(`Submitted ${urlList.length} URL(s) to IndexNow (HTTP ${response.status}).`);
