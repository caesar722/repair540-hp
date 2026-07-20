/* Repair540 — 共通 JavaScript */

const LINE_URL = 'https://line.me/R/ti/p/@121zxdau';
const GA4_MEASUREMENT_ID = 'G-VB6TQCK198';

function trackEvent(eventName, params = {}) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', eventName, {
    page_path: window.location.pathname + window.location.search,
    page_title: document.title,
    ...params
  });
}

function getCleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function trackLinkClick(link) {
  if (!link) return;

  const href = link.getAttribute('href') || '';
  const label = getCleanText(link.textContent).slice(0, 100);
  const commonParams = {
    link_text: label || link.getAttribute('aria-label') || '',
    link_url: href
  };

  if (href.startsWith('tel:')) {
    trackEvent('contact_click', {
      ...commonParams,
      contact_method: 'phone'
    });
    return;
  }

  if (href.includes('line.me')) {
    trackEvent('contact_click', {
      ...commonParams,
      contact_method: 'line'
    });
    return;
  }

  if (href.includes('instagram.com')) {
    trackEvent('social_click', {
      ...commonParams,
      social_platform: 'instagram'
    });
    return;
  }

  if (href.includes('youtube.com') || href.includes('youtu.be')) {
    trackEvent('social_click', {
      ...commonParams,
      social_platform: 'youtube'
    });
    return;
  }

  if (
    href.includes('google.com/maps') ||
    href.includes('maps.app.goo.gl') ||
    href.includes('goo.gl/maps')
  ) {
    trackEvent('location_click', {
      ...commonParams,
      destination: 'google_maps'
    });
    return;
  }

  if (/post\.html\?id=\d+/.test(href)) {
    const postId = new URL(href, window.location.href).searchParams.get('id') || '';
    trackEvent('blog_post_open', {
      ...commonParams,
      post_id: postId
    });
    return;
  }

  if (link.closest('.site-nav, .mobile-nav, .footer-nav, .footer-menu, .footer-grid')) {
    trackEvent('navigation_click', {
      ...commonParams,
      navigation_area: link.closest('.mobile-nav')
        ? 'mobile_nav'
        : link.closest('.site-nav')
          ? 'header_nav'
          : 'footer_nav'
    });
  }
}

function initAnalytics() {
  window.Repair540Analytics = {
    measurementId: GA4_MEASUREMENT_ID,
    trackEvent
  };

  document.addEventListener('click', (event) => {
    const faqButton = event.target.closest('.faq-question');
    if (faqButton) {
      const faqItem = faqButton.closest('.faq-item');
      if (faqItem && faqItem.classList.contains('active')) {
        trackEvent('faq_open', {
          faq_question: getCleanText(faqButton.textContent).slice(0, 120)
        });
      }
      return;
    }

    const link = event.target.closest('a');
    if (link) trackLinkClick(link);
  });
}

/* ── ハンバーガーメニュー ────────────────── */
(function () {
  const btn = document.getElementById('hamburger');
  const nav = document.getElementById('mobile-nav');
  if (!btn || !nav) return;

  btn.addEventListener('click', () => {
    const open = btn.classList.toggle('open');
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open);
    if (open) {
      trackEvent('menu_open', {
        menu_type: 'mobile_header'
      });
    }
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
      trackEvent('pricing_category_select', {
        category_name: getCleanText(btn.textContent)
      });
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
    const limit = parseInt(grid.dataset.limit || '', 10);
    const posts = data.posts
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const visiblePosts = Number.isFinite(limit) ? posts.slice(0, limit) : posts;

    grid.innerHTML = visiblePosts.map(post => {
      const date = new Date(post.date).toLocaleDateString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
      const postUrl = post.slug
        ? `post.html?slug=${encodeURIComponent(post.slug)}`
        : `post.html?id=${post.id}`;
      const thumb = post.thumbImage
        ? `<img src="${post.thumbImage}" alt="${post.thumbAlt || post.title}" loading="lazy">`
        : post.emoji;
      return `
        <article class="blog-card">
          <div class="blog-thumb">${thumb}</div>
          <div class="blog-body">
            <div class="blog-meta">
              <span class="blog-cat">${post.category}</span>
              <span class="blog-date">${date}</span>
            </div>
            <h3>${post.title}</h3>
            <p>${post.excerpt}</p>
            <a href="${postUrl}" class="blog-more">続きを読む →</a>
          </div>
        </article>`;
    }).join('');
  } catch (e) {
    grid.innerHTML = '<p>記事の読み込みに失敗しました。</p>';
  }
}

/* ── 初期化 ──────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initAnalytics();
  loadPrices();
  loadPosts();
});
