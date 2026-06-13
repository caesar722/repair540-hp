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
- `blog/posts/apple-newsroom-drafts/index.html` に下書き管理一覧を生成
- 下書きには `元記事日付` を表示し、`投稿日` は公開 workflow 実行日で自動設定
- 内容確認後は GitHub Actions から公開 workflow を実行して `posts.json` へ自動反映
- 却下した下書きは `blog/posts/rejected/` に移動
- `rejected/` 内で 30 日経過した下書きは日次 workflow で自動削除

## 追加・変更ファイル

- `.github/workflows/apple-newsroom-drafts.yml`
- `.github/workflows/test-line-draft-notification.yml`
- `.github/workflows/publish-apple-newsroom-draft.yml`
- `.github/workflows/reject-apple-newsroom-draft.yml`
- `.github/workflows/cleanup-rejected-apple-newsroom-drafts.yml`
- `scripts/generate-apple-newsroom-drafts.mjs`
- `scripts/build-apple-newsroom-drafts-index.mjs`
- `scripts/send-line-draft-notifications.mjs`
- `scripts/publish-apple-newsroom-draft.mjs`
- `scripts/reject-apple-newsroom-draft.mjs`
- `scripts/cleanup-rejected-apple-newsroom-drafts.mjs`
- `scripts/apple-newsroom-draft-utils.mjs`
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

下書きの全体一覧は `blog/posts/apple-newsroom-drafts/index.html` で確認できます。ここに

- 記事タイトル
- 元記事日付
- 生成日
- 公開状態

が表示されます。

入力項目:

- `draft_title_manual`
  - `blog/posts/apple-newsroom-drafts/index.html` に表示される選択番号、または記事タイトルを入力します
- `category`
  - 通常は `コラム`
- `emoji`
  - 通常は `📰`

この workflow は下書きHTMLから `posts.json` 用データを自動生成し、`posts.json` と `sitemap.xml` を更新して GitHub へ push します。実行ログには、選択された記事タイトルも表示されます。

公開された記事では、以下のように表示されます。

- `投稿日`: `Publish Apple Newsroom Draft` を実行した日
- `元記事日付`: Apple公式Newsroom の掲載日

### 6. 却下する

GitHub の Actions 画面で `Reject Apple Newsroom Draft` を実行します。

- `draft_title_manual`
  - `blog/posts/apple-newsroom-drafts/index.html` に表示される選択番号、または記事タイトルを入力します
  - 入力した下書きは `blog/posts/rejected/` へ移動します

### 7. 却下済み記事の自動整理

`Cleanup Rejected Apple Newsroom Drafts` が 1 日 1 回実行され、`rejected/` 内で 30 日経過した下書きを削除します。

## 下書きブログの確認場所

- 保存先: `blog/posts/`
- ファイル名: `YYYY-MM-DD-article-slug.html`
- 一覧ページ: `blog/posts/apple-newsroom-drafts/index.html`

下書きは自動公開されません。HTML を確認してから `Publish Apple Newsroom Draft` workflow を実行します。

## 公開する時に編集するファイル

- 基本は手動編集不要
- 必要なら公開前に `blog/posts/*.html` の下書きを修正
- 公開処理自体は workflow が `posts.json` と `sitemap.xml` を自動更新
