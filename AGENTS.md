# Repair540 site conventions

## Blog posts

- Every LINE call-to-action banner in `blog/posts/**/*.html` must display the official LINE logo.
- For posts directly under `blog/posts/`, use this exact button content:

  ```html
  <a href="https://line.me/R/ti/p/@121zxdau" class="btn btn-line" target="_blank" rel="noopener"><img src="../../assets/line-brand-icon.png" class="line-logo-img" alt="LINE">LINEで無料相談・予約</a>
  ```

- Adjust the relative asset path for more deeply nested post directories.
- Before publishing a blog post, verify that every `class="btn btn-line"` link contains an image with `class="line-logo-img"` and `alt="LINE"`.
