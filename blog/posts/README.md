# Apple Newsroom Drafts

このフォルダには、Apple公式Newsroom 日本版を元に自動生成した Repair540 ブログ用の下書きHTMLを保存します。

## 保存ルール

- 1ファイル1記事のHTML形式
- ファイル名は `YYYY-MM-DD-article-slug.html`
- 管理一覧ページは `index-drafts.html`
- `apple-newsroom-state.json` で重複チェック済みの記事URLを管理
- 新しいApple公式ニュースを検出した時のみ、新しい下書きを追加
- 却下した下書きは `rejected/` に移動

## 公開前の作業

1. 対象の `.html` 下書きを開く
2. タイトル・本文・補足を必要に応じて調整する
3. GitHub Actions の `Publish Apple Newsroom Draft` を実行する
4. 却下する場合は `Reject Apple Newsroom Draft` を実行する

この仕組みは、下書き確認後に承認用 workflow を実行して初めてサイトへ反映します。

iPhone版GitHubアプリから実行する場合:

- `draft_candidates` に候補一覧が表示されます
- `draft_title_manual` に候補一覧の番号、または記事タイトルを入力して実行します
- Web版GitHubでは `draft_title` の選択欄も使えます

公開後の記事表示ルール:

- `投稿日`: 公開 workflow を実行した日
- `元記事日付`: Apple公式Newsroom の掲載日
- `公開状態`: `下書き / 公開済み / 却下`

## GitHub Actions と LINE 通知

GitHub Actions から LINE 通知を送る場合は、GitHub Secrets に以下を登録します。

- `LINE_CHANNEL_ACCESS_TOKEN`
  - LINE Messaging API のチャネルアクセストークン
- `LINE_USER_ID`
  - 通知先管理者の `userId`
- `WORKFLOW_SYNC_TOKEN`（任意）
  - `publish-apple-newsroom-draft.yml` と `reject-apple-newsroom-draft.yml` の候補一覧を自動更新したい場合に使う Personal Access Token
  - workflow 更新権限を含むトークンを設定すると、Apple Newsroom下書きの生成・公開・却下後に GitHub Actions の候補一覧も同期されます

通知は「新しいAppleニュースを検出して、下書きHTMLの生成に成功した時のみ」送信されます。

`LINE_USER_ID` は、LINE公式アカウントを友だち追加したユーザーがボットにメッセージを送信した時の webhook に含まれる `source.userId` を使います。

`Cleanup Rejected Apple Newsroom Drafts` workflow が、`rejected/` 内で 30 日経過した下書きを自動削除します。
