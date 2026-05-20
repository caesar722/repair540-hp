# Apple Newsroom Drafts

このフォルダには、Apple公式Newsroom 日本版を元に自動生成したRepair540ブログ用の下書きを保存します。

## 保存ルール

- 1ファイル1記事のMarkdown形式
- frontmatterに日付、タイトル、カテゴリ、要約、元URLを保存
- `apple-newsroom-state.json` で重複チェック済みの記事URLを管理

## 公開前の作業

1. 対象の `.md` 下書きを開く
2. タイトル・本文・補足を必要に応じて調整する
3. 内容を `posts.json` に追加して公開記事として登録する

この仕組みは下書き作成までで止まり、サイトには自動公開しません。
