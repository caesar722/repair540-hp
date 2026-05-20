# Apple Newsroom Drafts

このフォルダには、Apple公式Newsroom 日本版を元に自動生成した Repair540 ブログ用の下書きHTMLを保存します。

## 保存ルール

- 1ファイル1記事のHTML形式
- ファイル名は `YYYY-MM-DD-article-slug.html`
- `apple-newsroom-state.json` で重複チェック済みの記事URLを管理
- 新しいApple公式ニュースを検出した時のみ、新しい下書きを追加

## 公開前の作業

1. 対象の `.html` 下書きを開く
2. タイトル・本文・補足を必要に応じて調整する
3. 公開時は `posts.json` に記事を追加する

この仕組みは下書き作成までで止まり、サイトには自動公開しません。

## GitHub Actions と LINE 通知

GitHub Actions から LINE 通知を送る場合は、GitHub Secrets に以下を登録します。

- `LINE_CHANNEL_ACCESS_TOKEN`
  - LINE Messaging API のチャネルアクセストークン
- `LINE_TO`
  - 通知先の `userId` または `groupId` または `roomId`

通知は「新しいAppleニュースを検出して、下書きHTMLの生成に成功した時のみ」送信されます。
