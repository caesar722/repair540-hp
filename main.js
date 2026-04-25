/* Repair540 — 共通 JavaScript */

const LINE_URL = 'https://liff.line.me/2008597169-eYl5poPw?liff_id=2008597169-eYl5poPw&is=PHxf18sZPK';

/* ── ハンバーガーメニュー ────────────────── */
(function () {
  const btn = document.getElementById('hamburger');
  const nav = document.getElementById('mobile-nav');
  if (!btn || !nav) return;

  btn.addEventListener('click', () => {
    const open = btn.classList.toggle('open');
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open);
  });

  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !nav.contains(e.target)) {
      btn.classList.remove('open');
      nav.classList.remove('open');
    }
  });
})();

/* ── アクティブナビ ──────────────────────── */
(function () {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.site-nav a, .mobile-nav a').forEach(a => {
    if (a.getAttribute('href') === page) a.classList.add('active');
  });
})();

/* ── タブ切り替え（menu.html） ───────────── */
function initTabs() {
  const btns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  if (!btns.length) return;

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

/* ── 料金表レンダリング（menu.html） ────── */
async function loadPrices() {
  const container = document.getElementById('prices-root');
  if (!container) return;

  try {
    const res  = await fetch('prices.json');
    const data = await res.json();

    const tabNav    = document.getElementById('tab-nav');
    const tabPanels = document.getElementById('tab-panels');

    data.categories.forEach((cat, i) => {
      /* タブボタン */
      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
      btn.dataset.tab = cat.id;
      btn.textContent = cat.name;
      tabNav.appendChild(btn);

      /* パネル */
      const panel = document.createElement('div');
      panel.id = cat.id;
      panel.className = 'tab-panel' + (i === 0 ? ' active' : '');

      if (cat.items) {
        /* iPhone / 複数カラム */
        panel.innerHTML = `
          <div class="table-wrap">
            <table class="price-table">
              <thead><tr>${cat.columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
              <tbody>
                ${cat.items.map(it => `
                  <tr>
                    <td>${it.model}</td>
                    <td><span class="price-num">¥${it.screen}</span></td>
                    <td><span class="price-num">¥${it.battery}</span></td>
                    <td><span class="price-num">¥${it.camera}</span></td>
                    <td><span class="price-num">¥${it.charging}</span></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <p class="price-note">※ ${cat.note}</p>`;
      } else if (cat.items_android) {
        /* Android / 3カラム */
        panel.innerHTML = `
          <div class="table-wrap">
            <table class="price-table">
              <thead><tr>${cat.columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
              <tbody>
                ${cat.items_android.map(it => `
                  <tr>
                    <td>${it.model}</td>
                    <td><span class="price-num">¥${it.screen}</span></td>
                    <td><span class="price-num">¥${it.battery}</span></td>
                    <td><span class="price-num">¥${it.charging}</span></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <p class="price-note">※ ${cat.note}</p>`;
      } else if (cat.items_simple) {
        /* その他 / シンプル2カラム */
        panel.innerHTML = `
          <div class="table-wrap">
            <table class="price-table">
              <thead><tr>${cat.columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
              <tbody>
                ${cat.items_simple.map(it => `
                  <tr>
                    <td>${it.service}</td>
                    <td><span class="price-num">¥${it.price}</span></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <p class="price-note">※ ${cat.note}</p>`;
      }

      tabPanels.appendChild(panel);
    });

    initTabs();
  } catch (e) {
    container.innerHTML = '<p style="color:#FF3B30">料金データの読み込みに失敗しました。ページを更新してください。</p>';
  }
}

/* ── ブログ記事レンダリング（blog.html） ─── */
async function loadPosts() {
  const grid = document.getElementById('blog-grid');
  if (!grid) return;

  try {
    const res  = await fetch('posts.json');
    const data = await res.json();

    grid.innerHTML = data.posts.map(post => {
      const date = new Date(post.date).toLocaleDateString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
      return `
        <article class="blog-card">
          <div class="blog-thumb">${post.emoji}</div>
          <div class="blog-body">
            <div class="blog-meta">
              <span class="blog-cat">${post.category}</span>
              <span class="blog-date">${date}</span>
            </div>
            <h3>${post.title}</h3>
            <p>${post.excerpt}</p>
            <span class="blog-more">続きを読む →</span>
          </div>
        </article>`;
    }).join('');
  } catch (e) {
    grid.innerHTML = '<p>記事の読み込みに失敗しました。</p>';
  }
}

/* ── 初期化 ──────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadPrices();
  loadPosts();
});
