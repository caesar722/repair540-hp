# Repair540 site conventions

## Blog posts

- Every LINE call-to-action banner in `blog/posts/**/*.html` must display the official LINE logo.
- For posts directly under `blog/posts/`, use this exact button content:

  ```html
  <a href="https://line.me/R/ti/p/@121zxdau" class="btn btn-line" target="_blank" rel="noopener"><img src="../../assets/line-brand-icon.png" class="line-logo-img" alt="LINE">LINEで無料相談・予約</a>
  ```

- Adjust the relative asset path for more deeply nested post directories.
- Before publishing a blog post, verify that every `class="btn btn-line"` link contains an image with `class="line-logo-img"` and `alt="LINE"`.

## Scope of changes

- Only make the changes the owner explicitly requested. Do not add new pages, sections, files, or data on your own initiative (including "SEO improvements"), even if they seem helpful. If you think something extra would help, propose it and wait for approval.
- When a request is broad (e.g. "improve SEO"), list the planned changes first and get approval before editing.

## Repair prices

- `menu.html` is the single source of truth for repair prices. Never create, copy, or generate prices from any other file or from guesses.
- Do not add price data files (e.g. `prices.json`) or pages that display prices outside `menu.html` unless the owner explicitly asks.
- Never change a price unless the owner gives the exact new amount.

## 日本語の要約（オーナー向け）

- 頼まれていないページ・ファイル・データは追加しない。必要そうなら提案して許可を待つ。
- 修理価格は `menu.html` だけが正しい。価格は他のファイルや推測から作らない。
