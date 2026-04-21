require('dotenv').config();
const { chromium } = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const { sanitizeContent } = require('./sanitizerService');
const { downloadAndOptimizeImage } = require('./imageService');

/**
 * ============================================================
 * WebTools Crawler v4.0 — Graph-Based Tree Crawl
 * Fixes:
 *  - VI-only: Tự phát hiện và bỏ qua các trang ngôn ngữ khác (/en/, /ko/, /ja/)
 *  - Pagination: tin-tuc.php → ?page=2 → ?page=3 → ... đến hết
 *  - Mỗi bài tin tức (Đọc thêm → ?slug=xxx) là 1 trang riêng, crawl đủ
 *  - Catch-all: Không bỏ sót link nào dù nằm trong container nào
 * ============================================================
 */

// Tracking params cần xóa (GIỮ slug, cat, id, page, paged)
const TRACKING_PARAMS = ['utm_source','utm_medium','utm_campaign','utm_content',
  'utm_term','fbclid','gclid','_ga','_gl','mc_eid','msclkid','ref'];

/**
 * Chuẩn hóa URL — giữ query params có nghĩa, xóa tracking
 */
function normalizeUrl(href, origin) {
  try {
    const u = new URL(href, origin);
    if (u.origin !== origin) return null;
    TRACKING_PARAMS.forEach(p => u.searchParams.delete(p));
    const pathname = u.pathname.replace(/\/+$/, '') || '/';
    const searchStr = u.searchParams.toString();
    return u.origin + pathname + (searchStr ? '?' + searchStr : '');
  } catch (e) { return null; }
}

/**
 * Phát hiện xem URL có phải trang ngôn ngữ khác không
 * VD: /en/*, /ko/*, /ja/*, /zh/*, /fr/*
 */
function isAlternateLocale(url, rootLocale) {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/^\/([a-z]{2})(\/|$)/);
    if (!match) return false; // Không có prefix ngôn ngữ → không phải alternate
    const lang = match[1];
    // Nếu rootLocale = null (site VI gốc, không có prefix)
    // → BẤT KỲ URL có /xx/ prefix đều là ngôn ngữ khác → bỏ qua
    if (!rootLocale) return true;
    // Nếu có rootLocale → chỉ bỏ qua nếu lang ≠ rootLocale
    return lang !== rootLocale;
  } catch (e) { return false; }
}

/**
 * Phát hiện locale của root URL
 * apollotech.vn → null (VI mặc định)
 * apollotech.vn/en/ → 'en'
 */
function detectRootLocale(siteUrl) {
  try {
    const u = new URL(siteUrl);
    const match = u.pathname.match(/^\/([a-z]{2})(\/|$)/);
    return match ? match[1] : null; // null = VI gốc (không có prefix)
  } catch (e) { return null; }
}

/**
 * Fetch & parse Sitemap XML
 */
async function fetchSitemapUrls(origin) {
  const urls = [];
  const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/robots.txt`];
  for (const sitemapUrl of candidates) {
    try {
      const res = await axios.get(sitemapUrl, { timeout: 5000, validateStatus: s => s < 400 });
      if (!res.data) continue;
      if (sitemapUrl.endsWith('robots.txt')) {
        const matches = (res.data.match(/Sitemap:\s*(\S+)/gi) || []);
        for (const m of matches) {
          const sub = m.replace(/Sitemap:\s*/i, '').trim();
          if (sub.startsWith('http')) urls.push(...await parseSitemapXml(sub, origin));
        }
      } else if (res.data.includes('<loc>')) {
        const $ = cheerio.load(res.data, { xmlMode: true });
        if ($('sitemap').length > 0) {
          const subs = [];
          $('sitemap > loc').each((_, el) => subs.push($(el).text().trim()));
          for (const sub of subs.slice(0, 10)) urls.push(...await parseSitemapXml(sub, origin));
        } else {
          $('url > loc').each((_, el) => urls.push($(el).text().trim()));
        }
      }
      if (urls.length > 0) break;
    } catch (e) {}
  }
  return urls.filter(u => u.startsWith(origin));
}

async function parseSitemapXml(sitemapUrl, origin) {
  try {
    const res = await axios.get(sitemapUrl, { timeout: 5000, validateStatus: s => s < 400 });
    if (!res.data) return [];
    const $ = cheerio.load(res.data, { xmlMode: true });
    const urls = [];
    $('url > loc').each((_, el) => { const l = $(el).text().trim(); if (l.startsWith(origin)) urls.push(l); });
    return urls;
  } catch (e) { return []; }
}

// ============================================================
// MAIN: crawlSite v4.0
// ============================================================
async function crawlSite(siteUrl, siteSlug, uploadDir, onProgress, options = {}) {
  const {
    maxPages = 200,
    excludePaths = [],
    viOnly = true,          // CHỈ crawl tiếng Việt
  } = options;

  const baseUrl = new URL(siteUrl);
  const origin = baseUrl.origin;
  const siteDir = path.join(uploadDir, 'sites', siteSlug);
  const rootLocale = detectRootLocale(siteUrl);

  ['html', 'assets/css', 'assets/js', 'images', 'images/thumbs'].forEach(dir =>
    fs.mkdirSync(path.join(siteDir, dir), { recursive: true })
  );

  // ── Phase 1: Sitemap ──
  onProgress?.({ status: 'crawling', progress: 3, message: '🗺️ Đang quét Sitemap.xml...' });
  const sitemapUrls = await fetchSitemapUrls(origin);
  console.log(`📍 Sitemap: ${sitemapUrls.length} URLs | VI-Only: ${viOnly} | Root locale: "${rootLocale || 'vi'}"`);

  const browser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== 'false' });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });

  // ── Graph ──
  const visited = new Set();
  const queued = new Set();
  const queue = []; // { url, parentUrl, navGroup, depth, priority }
  const siteGraph = new Map();

  /**
   * Kiểm tra URL có bị loại không
   */
  function shouldSkip(url) {
    if (!url) return true;
    // Loại tracking/asset extensions
    if (/\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|pdf|zip|mp4|mp3|woff|woff2|ttf|eot)(\?|$)/i.test(url)) return true;
    // Loại exclude paths
    if (excludePaths.some(ex => url.includes(ex))) return true;
    // Loại ngôn ngữ khác nếu viOnly
    if (viOnly && isAlternateLocale(url, rootLocale)) return true;
    return false;
  }

  function enqueue(url, parentUrl, navGroup, depth, priority = 3) {
    const norm = normalizeUrl(url, origin);
    if (!norm) return;
    if (visited.has(norm) || queued.has(norm)) return;
    if (shouldSkip(norm)) return;
    queued.add(norm);
    queue.push({ url: norm, parentUrl, navGroup, depth, priority });
  }

  // Root
  const rootNorm = normalizeUrl(siteUrl, origin);
  queued.add(rootNorm);
  queue.push({ url: rootNorm, parentUrl: null, navGroup: 'root', depth: 0, priority: 0 });

  // Sitemap URLs (lọc VI-only)
  if (options.customQueue?.length > 0) {
    options.customQueue.forEach(u => enqueue(u.url || u, rootNorm, 'sitemap', 1, 0));
  } else {
    sitemapUrls.forEach(u => enqueue(u, rootNorm, 'sitemap', 1, 0));
  }

  queue.sort((a, b) => a.priority - b.priority);

  const pages = [];
  const assetMap = { css: [], js: [], images: {}, media: [] };
  let crawledPages = 0;

  console.log(`🕷️ Graph Crawl v4.0: ${siteUrl} | VI-Only: ${viOnly} | Max: ${maxPages}`);
  onProgress?.({ status: 'crawling', progress: 5, message: `🕷️ Bắt đầu crawl (VI-only: ${viOnly}, tối đa ${maxPages} trang)...` });

  while (queue.length > 0 && crawledPages < maxPages) {
    const item = queue.shift();
    const { url, parentUrl, navGroup, depth } = item;

    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const page = await context.newPage();

      // Block font/media/image để tăng tốc (chỉ giữ HTML/CSS/JS)
      await page.route('**/*', route => {
        const rt = route.request().resourceType();
        ['font', 'media'].includes(rt) ? route.abort() : route.continue();
      });

      console.log(`📄 [d${depth}|${navGroup.substring(0,25)}] ${url.replace(origin, '')}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      try { await page.waitForLoadState('networkidle', { timeout: 7000 }); } catch (e) {}

      // Hover nav để trigger dropdowns
      try {
        const navItems = await page.$$('nav > ul > li, header > ul > li, .menu > li, .navbar-nav > li');
        for (const ni of navItems.slice(0, 15)) {
          try { await ni.hover({ timeout: 300 }); } catch (e) {}
        }
        await page.waitForTimeout(300);
      } catch (e) {}

      // Scroll lazy-load
      await page.evaluate(async () => {
        await new Promise(resolve => {
          let h = 0;
          const t = setInterval(() => {
            const sh = document.body.scrollHeight;
            window.scrollBy(0, 400);
            h += 400;
            if (h >= sh) { clearInterval(t); resolve(); }
          }, 80);
        });
      });
      await page.waitForTimeout(400);

      const html = await page.content();
      const title = await page.title();
      const { html: cleanHtml } = sanitizeContent(html);

      const pagePath = getPagePath(url, origin);
      // Tên file: dùng cả query param để không bị trùng
      const queryPart = url.includes('?') ? '_' + slugifyQuery(url.split('?')[1]) : '';
      const htmlFilename = pathToFilename(pagePath + queryPart);
      fs.writeFileSync(path.join(siteDir, 'html', htmlFilename), cleanHtml, 'utf8');

      // Graph node
      siteGraph.set(url, { url, title, depth, parentUrl, navGroup, children: [], htmlFile: htmlFilename, path: pagePath });
      if (parentUrl && siteGraph.has(parentUrl)) siteGraph.get(parentUrl).children.push(url);

      pages.push({
        url, path: pagePath, title, htmlFile: htmlFilename,
        isHome: url === rootNorm || url === siteUrl,
        rawHtml: cleanHtml, parentUrl, navGroup, depth,
      });

      // ══════════════════════════════════════════════════════════
      // PHÂN LOẠI LINKS — ưu tiên từ cao → thấp
      // ══════════════════════════════════════════════════════════
      const discoveredLinks = await page.evaluate((opts) => {
        const { origin, STRIP } = opts;
        const groups = { menu: [], submenu: [], listing: [], article: [], pagination: [], footer: [], other: [] };

        // Set để track đã seen trong từng group
        const seenAll = new Set();

        function cleanUrl(href) {
          if (!href) return null;
          try {
            const u = new URL(href, document.baseURI);
            if (u.origin !== origin) return null;
            // Bỏ anchor-only
            if (u.hash && u.pathname === window.location.pathname && !u.search) return null;
            STRIP.forEach(p => u.searchParams.delete(p));
            return u.origin + (u.pathname.replace(/\/+$/, '') || '/') + (u.search || '');
          } catch (e) { return null; }
        }

        function getLabel(el) {
          const t = el.innerText?.trim().replace(/\s+/g, ' ').substring(0, 60);
          if (t) return t;
          return el.getAttribute('aria-label') || el.title || el.querySelector('img')?.alt || '';
        }

        function push(group, href, el) {
          const url = cleanUrl(href);
          if (!url || seenAll.has(url)) return;
          seenAll.add(url);
          groups[group].push({ url, label: el ? getLabel(el) : '' });
        }

        // 1. MENU CHÍNH (nav > ul > li > a)
        document.querySelectorAll(
          'nav > ul a, header > nav a, .main-menu > li > a, .primary-menu > li > a, ' +
          '.navbar-nav > li > a, [id*="main-menu"] > li > a, .menu > li > a'
        ).forEach(a => push('menu', a.href, a));

        // 2. SUBMENU / DROPDOWN (các cấp con của menu chính)
        document.querySelectorAll(
          '.dropdown-menu a, .sub-menu a, nav ul ul a, ' +
          '[class*="submenu"] a, [class*="sub-menu"] a, ' +
          '.navbar-nav .dropdown-item, [class*="dropdown"] li a'
        ).forEach(a => push('submenu', a.href, a));

        // 3. PAGINATION — quan trọng! trang danh sách có nhiều trang
        // Pattern: ?page=N, ?paged=N, /page/N, hoặc số trang trong pagination
        document.querySelectorAll(
          'a[rel="next"], a[rel="prev"], ' +
          'a[href*="?page="], a[href*="?paged="], a[href*="&page="], ' +
          'a[href*="/page/"], ' +
          '[class*="pagination"] a, [class*="pager"] a, ' +
          '[class*="page-numbers"] a, .wp-pagenavi a, ' +
          '[aria-label*="page"], [aria-label*="trang"]'
        ).forEach(a => push('pagination', a.href, a));

        // 4. ARTICLE LINKS — "Đọc thêm", "Xem thêm", "Read more", tiêu đề bài viết
        // Đây là các link đến trang chi tiết từ trang listing
        document.querySelectorAll(
          // Links có ?slug= hoặc ?id=
          'a[href*="?slug="], a[href*="?id="], a[href*="?post="], ' +
          // "Đọc thêm" type buttons
          'a[class*="read-more"], a[class*="doc-them"], a[class*="more"], ' +
          // Tiêu đề bài viết trong listing
          '[class*="entry-title"] a, [class*="post-title"] a, [class*="article-title"] a, ' +
          '[class*="news-title"] a, h2 a, h3 a, ' +
          // Cards và items
          '[class*="card"] a, [class*="post-item"] a, [class*="news-item"] a, ' +
          '[class*="blog-item"] a, [class*="article-item"] a'
        ).forEach(a => push('article', a.href, a));

        // 5. NỘI DUNG (main, article sections)
        document.querySelectorAll(
          'main a[href], article a[href], ' +
          '[class*="content"] a[href], [class*="widget"] a[href], ' +
          '[class*="sidebar"] a[href]'
        ).forEach(a => push('listing', a.href, a));

        // 6. FOOTER
        document.querySelectorAll('footer a[href]').forEach(a => push('footer', a.href, a));

        // 7. CATCH-ALL: BẮT TẤT CẢ a[href] còn lại chưa được classify
        document.querySelectorAll('a[href]').forEach(a => push('other', a.href, a));

        // Log để debug
        const counts = Object.fromEntries(Object.entries(groups).map(([k,v]) => [k, v.length]));

        return { groups, counts };
      }, { origin, STRIP: TRACKING_PARAMS });

      const { groups, counts } = discoveredLinks;

      console.log(`   ↳ menu:${counts.menu} sub:${counts.submenu} article:${counts.article} page:${counts.pagination} list:${counts.listing} other:${counts.other} | queue:${queue.length}`);

      // Enqueue theo priority
      // Priority 0: pagination của listing pages (tin-tuc?page=2 PHẢI crawl ngay)
      groups.pagination.forEach(({ url: u, label }) =>
        enqueue(u, url, `pagination`, depth, 0)   // depth không tăng, ngang hàng
      );
      // Priority 1: menu & submenu
      groups.menu.forEach(({ url: u, label }) =>
        enqueue(u, url, `menu|${label.substring(0, 30)}`, depth + 1, 1)
      );
      groups.submenu.forEach(({ url: u, label }) =>
        enqueue(u, url, `submenu|${label.substring(0, 30)}`, depth + 1, 1)
      );
      // Priority 2: bài viết chi tiết (slug links)
      groups.article.forEach(({ url: u, label }) =>
        enqueue(u, url, `article|${label.substring(0, 30)}`, depth + 1, 2)
      );
      // Priority 3: listing page links
      groups.listing.forEach(({ url: u, label }) =>
        enqueue(u, url, `content|${label.substring(0, 30)}`, depth + 1, 3)
      );
      // Priority 4: footer
      groups.footer.forEach(({ url: u, label }) =>
        enqueue(u, url, `footer|${label.substring(0, 30)}`, depth + 1, 4)
      );
      // Priority 5: catch-all
      groups.other.forEach(({ url: u, label }) =>
        enqueue(u, url, `other|${label.substring(0, 30)}`, depth + 1, 5)
      );

      // Re-sort queue (priority ASC)
      queue.sort((a, b) => a.priority - b.priority);

      // Thu thập assets
      const assets = await page.evaluate(() => {
        const css = [...document.querySelectorAll('link[rel="stylesheet"]')].map(e => e.href).filter(h => h?.startsWith('http'));
        const js = [...document.querySelectorAll('script[src]')].map(e => e.src).filter(s => s?.startsWith('http'));
        const imgs = new Set();
        document.querySelectorAll('img').forEach(e => {
          if (e.src?.startsWith('http') && !(e.width <= 5 && e.height <= 5)) imgs.add(e.src);
          if (e.dataset.src?.startsWith('http')) imgs.add(e.dataset.src);
          if (e.dataset.lazySrc?.startsWith('http')) imgs.add(e.dataset.lazySrc);
        });
        document.querySelectorAll('*[style]').forEach(el => {
          const m = el.getAttribute('style').match(/url\(['"]?([^'"()]+)['"]?\)/i);
          if (m?.[1] && !m[1].startsWith('data:')) {
            try { const u = new URL(m[1], document.baseURI); if (u.href.startsWith('http')) imgs.add(u.href); } catch(e) {}
          }
        });
        document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]').forEach(e => {
          if (e.content?.startsWith('http')) imgs.add(e.content);
        });
        const media = [...document.querySelectorAll('video[src],audio[src]')].map(e => e.src).filter(Boolean);
        return { css, js, images: [...imgs], media };
      });

      assets.css.forEach(u => !assetMap.css.includes(u) && assetMap.css.push(u));
      assets.js.forEach(u => !assetMap.js.includes(u) && assetMap.js.push(u));
      if (!assetMap.images[pagePath]) assetMap.images[pagePath] = [];
      assets.images.forEach(u => !assetMap.images[pagePath].includes(u) && assetMap.images[pagePath].push(u));
      assets.media.forEach(u => !assetMap.media.includes(u) && assetMap.media.push(u));

      crawledPages++;
      const progress = Math.min(10 + Math.round((crawledPages / Math.max(maxPages, 1)) * 52), 62);
      onProgress?.({
        status: 'crawling', progress,
        message: `[${navGroup.split('|')[0]}] "${title.substring(0, 30)}" (${crawledPages} trang, còn ${queue.length} trong queue)`
      });

      await page.close();
    } catch (err) {
      console.error(`❌ [${url}]: ${err.message}`);
      try {
        for (const p of await context.pages()) { if (!p.isClosed()) await p.close().catch(() => {}); }
      } catch (e) {}
    }
  }

  await browser.close();
  console.log(`\n✅ Done: ${pages.length} pages | ${visited.size} visited | VI-only: ${viOnly}`);

  // Summary by navGroup
  const summary = {};
  pages.forEach(p => {
    const g = p.navGroup.split('|')[0];
    summary[g] = (summary[g] || 0) + 1;
  });
  console.log('📊 Summary:', summary);

  // ── Phase 3: Assets ──
  onProgress?.({ status: 'assets', progress: 65, message: '⬇️ Đang tải CSS...' });
  for (const u of [...new Set(assetMap.css)].slice(0, 30)) await downloadAsset(u, siteDir, 'assets/css', origin);

  onProgress?.({ status: 'assets', progress: 75, message: '⬇️ Đang tải JS...' });
  for (const u of [...new Set(assetMap.js)].slice(0, 30)) await downloadAsset(u, siteDir, 'assets/js', origin);

  onProgress?.({ status: 'assets', progress: 80, message: '⬇️ Đang tải Media...' });
  for (const u of [...new Set(assetMap.media)].slice(0, 5)) await downloadAsset(u, siteDir, 'assets/media', origin);

  // ── Phase 4: Images ──
  onProgress?.({ status: 'images', progress: 85, message: '🖼️ Đang tải ảnh...' });
  const mediaItems = [];
  const imageCounts = {};
  for (const p in assetMap.images) {
    [...new Set(assetMap.images[p])].forEach(img => { imageCounts[img] = (imageCounts[img] || 0) + 1; });
  }

  const targetImages = Object.keys(imageCounts).slice(0, 500);
  const CONCURRENCY = 6;
  for (let i = 0; i < targetImages.length; i += CONCURRENCY) {
    const chunk = targetImages.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async (imgUrl) => {
      const count = imageCounts[imgUrl];
      const folder = count > 1 ? 'global' : (() => {
        const pg = Object.keys(assetMap.images).find(p => assetMap.images[p].includes(imgUrl));
        if (!pg) return 'global';
        return pg === '/' ? 'index' : pg.replace(/^\//, '').replace(/\//g, '_');
      })();
      const filename = (imgUrl.split('/').pop().split('?')[0] || 'img.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
      const result = await downloadAndOptimizeImage(imgUrl, filename, siteDir, folder);
      return result ? { filename, originalUrl: imgUrl, folder, ...result } : null;
    }));
    results.filter(Boolean).forEach(r => mediaItems.push(r));
    const prog = Math.min(85 + Math.round(((i + chunk.length) / targetImages.length) * 10), 98);
    onProgress?.({ status: 'images', progress: prog, message: `🖼️ Ảnh: ${Math.min(i + chunk.length, targetImages.length)}/${targetImages.length}` });
  }

  onProgress?.({ status: 'done', progress: 100, message: `✅ Hoàn tất! ${pages.length} trang (VI-only), ${mediaItems.length} ảnh.` });
  return { pages, mediaItems, siteDir, siteGraph };
}

// ============================================================
// HELPERS
// ============================================================
async function downloadAsset(url, siteDir, subdir, baseOrigin) {
  try {
    const isCss = subdir.includes('css');
    const res = await axios.get(url, {
      responseType: isCss || subdir.includes('js') ? 'text' : 'arraybuffer',
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 WebTools-CMS-Crawler/4.0' }
    });
    const filename = url.split('/').pop().split('?')[0] || `asset_${Date.now()}`;
    const filePath = path.join(siteDir, subdir, filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    let content = res.data;
    if (isCss && typeof content === 'string') {
      const cssAssetsDir = path.join(siteDir, 'assets', 'css_assets');
      const cssUrlRegex = /(?:url\(['"]?([^'"()]+)['"]?\))|(?:@import\s+['"]([^'"]+)['"])/gi;
      const urlsToReplace = [];
      let match;
      while ((match = cssUrlRegex.exec(content)) !== null) {
        const u = match[1] || match[2];
        if (u && !u.startsWith('data:')) urlsToReplace.push(u);
      }
      await Promise.allSettled([...new Set(urlsToReplace)].map(async assetUrl => {
        try {
          let full = assetUrl.startsWith('http') ? assetUrl
            : assetUrl.startsWith('/') ? new URL(assetUrl, baseOrigin).href
            : new URL(assetUrl, url).href;
          const fn = full.split('/').pop().split('?')[0].replace(/[^a-zA-Z0-9._-]/g, '_') || `css_${Date.now()}`;
          const r = await axios.get(full, { responseType: 'arraybuffer', timeout: 8000 });
          fs.mkdirSync(cssAssetsDir, { recursive: true });
          fs.writeFileSync(path.join(cssAssetsDir, fn), r.data);
          const re = new RegExp(`url\\(['"]?${assetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\)`, 'g');
          content = content.replace(re, `url('../css_assets/${fn}')`);
        } catch (e) {}
      }));
    }
    fs.writeFileSync(filePath, content);
    return filename;
  } catch (err) { return null; }
}

function getPagePath(url, origin) {
  try { return new URL(url).pathname.replace(/\/+$/, '') || '/'; }
  catch (e) { return '/'; }
}

function slugifyQuery(query) {
  // "slug=ten-bai-viet&foo=bar" → "slug_ten-bai-viet"
  if (!query) return '';
  return query.substring(0, 60).replace(/[=&]/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
}

function pathToFilename(pagePath) {
  if (pagePath === '/' || pagePath === '/index.html') return 'index.html';
  const clean = pagePath.replace(/^\//, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
  return clean.match(/\.(php|html|htm)$/i) ? clean : clean + '.html';
}

module.exports = { crawlSite };
