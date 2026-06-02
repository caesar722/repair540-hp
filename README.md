# Repair540 Apple Newsroom Draft Automation

Repair540ホームページには、Apple公式Newsroom 日本版の新着記事を検出し、ブログ下書きHTMLを自動生成して管理者へLINE通知する仕組みを入れています。

## 仕組み

- GitHub Actions が 1日1回 Apple公式Newsroom 日本版のRSSを確認
- 新着記事がある時だけ `blog/posts/` に下書きHTMLを生成
- `blog/posts/apple-newsroom-state.json` で重複生成を防止
- 下書き生成に成功した時だけ LINE Messaging API の Push Message を送信
- 下書き本文は Apple公式Newsroom の本文をもとに自然な日本語で要約
- 本文内にニュース元URLを必ず掲載

## 追加・変更ファイル

- `.github/workflows/apple-newsroom-drafts.yml`
- `scripts/generate-apple-newsroom-drafts.mjs`
- `scripts/send-line-draft-notifications.mjs`
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

## 下書きブログの確認場所

- 保存先: `blog/posts/`
- ファイル名: `YYYY-MM-DD-article-slug.html`

下書きは自動公開されません。HTML を確認してから公開用データへ転記します。

## 公開する時に編集するファイル

- `posts.json`

公開時は、生成された下書きHTMLを確認し、必要な表現調整を行ったうえで `posts.json` に記事データを追加します。
