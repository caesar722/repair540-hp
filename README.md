# Repair540 Apple Newsroom Draft Automation

Repair540ホームページには、Apple公式Newsroom 日本版の新着記事を検出し、ブログ下書きHTMLを自動生成して管理者へLINE通知する仕組みを入れています。

## 仕組み

- GitHub Actions が 1日1回 Apple公式Newsroom 日本版のRSSを確認
- 新着記事がある時だけ `blog/posts/` に下書きHTMLを生成
- `blog/posts/apple-newsroom-state.json` で重複生成を防止
- 下書き生成に成功した時だけ LINE Messaging API の Push Message を送信
- 下書き本文は Apple公式Newsroom の本文をもとに自然な日本語で要約
- 本文内にニュース元URLを必ず掲載
- LINE通知には下書き確認URLを含める
- 内容確認後は GitHub Actions から公開 workflow を実行して `posts.json` へ自動反映

## 追加・変更ファイル

- `.github/workflows/apple-newsroom-drafts.yml`
- `.github/workflows/test-line-draft-notification.yml`
- `.github/workflows/publish-apple-newsroom-draft.yml`
- `scripts/generate-apple-newsroom-drafts.mjs`
- `scripts/send-line-draft-notifications.mjs`
- `scripts/publish-apple-newsroom-draft.mjs`
- `blog/posts/apple-newsroom-state.json`
- `blog/posts/README.md`

## GitHub Secrets

GitHub Actions の Secrets に以下を登録します。

- `LINE_CHANNEL_ACCESS_TOKEN`
  - LINE Messaging API チャネルアクセストークン
- `LINE_USER_ID`
  - 通知先にする管理者LINEユーザーの `userId`

## LINE_USER_ID の取得方法

LINE Developers の公式仕様では、ユーザーがLINE公式アカウントを友だち追加した時、または1対1チャットでメッセージを送った時の webhook に `source.userId` が含まれます。これを `LINE_USER_ID` として使います。

手順:

1. LINE Developers Console で Messaging API チャネルを作成し、Webhook URL を受け取れるサーバーを設定します。
2. Webhook を有効化します。
3. 通知を受けたい管理者アカウントで、そのLINE公式アカウントを友だち追加します。
4. その管理者アカウントから公式アカウントへ1通メッセージを送ります。
5. 受信した webhook JSON の `events[0].source.userId` を GitHub Secret `LINE_USER_ID` に登録します。

補足:

- Push Message は、友だち追加済みのユーザー、または公式アカウントへメッセージを送ったユーザーに送れます。

## 手動テスト

### 1. 下書き生成の dry run

```bash
node scripts/generate-apple-newsroom-drafts.mjs --dry-run --report-file=/tmp/apple-newsroom-report.json
```

### 2. LINE通知の dry run

```bash
printf '%s\n' '{
  "draftCount": 1,
  "drafts": [
    {
      "title": "テスト用タイトル",
      "date": "2026-06-02",
      "filePath": "blog/posts/2026-06-02-test.html",
      "sourceUrl": "https://www.apple.com/jp/newsroom/"
    }
  ]
}' > /tmp/apple-newsroom-report.json

LINE_CHANNEL_ACCESS_TOKEN=dummy \
LINE_USER_ID=Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
node scripts/send-line-draft-notifications.mjs --report-file=/tmp/apple-newsroom-report.json --dry-run
```

### 3. GitHub Actions の手動実行

GitHub の Actions 画面で `Generate Apple Newsroom Drafts` を `Run workflow` します。

### 4. GitHub Actions で LINE 通知だけを送るテスト

GitHub の Actions 画面で `Test LINE Draft Notification` を `Run workflow` します。

入力項目:

- `title`
- `published_date`
- `file_path`
- `source_url`

この workflow はダミーの下書きレポートをその場で作り、`LINE_CHANNEL_ACCESS_TOKEN` と `LINE_USER_ID` を使って Push Message を1通送ります。Apple公式Newsroom の新着有無には影響されません。

### 5. 下書き確認後にブログへ公開する

LINE通知に記載された `確認URL` を開き、内容確認後に GitHub の Actions 画面で `Publish Apple Newsroom Draft` を実行します。

入力項目:

- `draft_file`
  - 例: `blog/posts/2026-05-21-apple-tv-to-air-first-major-live-pro-sports-event-shot-on-iphone-17-pro.html`
- `category`
  - 通常は `コラム`
- `emoji`
  - 通常は `📰`

この workflow は下書きHTMLから `posts.json` 用データを自動生成し、`posts.json` と `sitemap.xml` を更新して GitHub へ push します。

## 下書きブログの確認場所

- 保存先: `blog/posts/`
- ファイル名: `YYYY-MM-DD-article-slug.html`

下書きは自動公開されません。HTML を確認してから `Publish Apple Newsroom Draft` workflow を実行します。

## 公開する時に編集するファイル

- 基本は手動編集不要
- 必要なら公開前に `blog/posts/*.html` の下書きを修正
- 公開処理自体は workflow が `posts.json` と `sitemap.xml` を自動更新
