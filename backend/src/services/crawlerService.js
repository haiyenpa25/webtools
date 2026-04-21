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
 * Deep Crawler Service — Playwright-based v2.0
 * Fix: Sitemap pre-scan, dropdown hover, pagination, URL normalize, anchor-only filter
 */

// ============================================================
// HELPER: Chuẩn hóa URL — giữ query params có nghĩa, xóa tracking
// ============================================================
// Các params TRACKING cần xóa
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'fbclid', 'gclid', '_ga', '_gl', 'mc_eid', 'msclkid', 'ref'
]);

// Các params NGÔN NGỮ cần xóa để normalize (ko ảnh hưởng nội dung)
const LANG_PARAMS = new Set(['lang', 'language', 'locale']);

function normalizeUrl(href, origin, keepLangParams = false) {
  try {
    const u = new URL(href, origin);
    // Xóa tracking params
    TRACKING_PARAMS.forEach(p => u.searchParams.delete(p));
    // Xóa lang params (trừ khi cần giữ)
    if (!keepLangParams) {
      LANG_PARAMS.forEach(p => u.searchParams.delete(p));
    }
    // GIỮ LẠI các query param có nghĩa: slug, cat, id, type, page, paged...
    // Bỏ trailing slash ở pathname (trừ root)
    const pathname = u.pathname.replace(/\/+$/, '') || '/';
    // Tái tạo URL chuẩn
    const searchStr = u.searchParams.toString();
    return u.origin + pathname + (searchStr ? '?' + searchStr : '');
  } catch (e) {
    return null;
  }
}

// ============================================================
// HELPER: Fetch và parse Sitemap XML (kể cả sitemap index)
// ============================================================
async function fetchSitemapUrls(siteUrl, origin) {
  const urls = new Set();
  const candidateSitemaps = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemaps.xml`,
    `${origin}/sitemap/sitemap.xml`,
    `${origin}/robots.txt`,
  ];

  for (const sitemapUrl of candidateSitemaps) {
    try {
      const res = await axios.get(sitemapUrl, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 WebTools-CMS-Crawler/2.0' },
        validateStatus: s => s < 400
      });

      if (!res.data || typeof res.data !== 'string') continue;

      // robots.txt: tìm Sitemap: lines
      if (sitemapUrl.endsWith('robots.txt')) {
        const matches = res.data.match(/Sitemap:\s*(\S+)/gi) || [];
        for (const m of matches) {
          const url = m.replace(/Sitemap:\s*/i, '').trim();
          if (url.startsWith('http')) {
            const subUrls = await parseSitemapXml(url, origin);
            subUrls.forEach(u => urls.add(u));
          }
        }
        continue;
      }

      // Sitemap index: tìm <sitemap><loc>
      if (res.data.includes('<sitemapindex') || res.data.includes('<sitemap>')) {
        const $ = cheerio.load(res.data, { xmlMode: true });
        const subSitemaps = [];
        $('sitemap > loc').each((_, el) => subSitemaps.push($(el).text().trim()));
        for (const sub of subSitemaps.slice(0, 10)) {
          const subUrls = await parseSitemapXml(sub, origin);
          subUrls.forEach(u => urls.add(u));
        }
      } else {
        // Regular sitemap
        const $ = cheerio.load(res.data, { xmlMode: true });
        $('url > loc').each((_, el) => {
          const loc = $(el).text().trim();
          if (loc.startsWith(origin)) urls.add(loc);
        });
      }

      if (urls.size > 0) break; // Đã tìm thấy sitemap, dừng
    } catch (e) {
      // Skip this sitemap candidate
    }
  }

  console.log(`📍 Sitemap: Found ${urls.size} URLs`);
  return [...urls];
}

async function parseSitemapXml(sitemapUrl, origin) {
  const urls = [];
  try {
    const res = await axios.get(sitemapUrl, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 WebTools-CMS-Crawler/2.0' },
      validateStatus: s => s < 400
    });
    if (!res.data) return urls;
    const $ = cheerio.load(res.data, { xmlMode: true });
    $('url > loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (loc.startsWith(origin)) urls.push(loc);
    });
  } catch (e) {}
  return urls;
}

// ============================================================
// MAIN CRAWL FUNCTION
// ============================================================
async function crawlSite(siteUrl, siteSlug, uploadDir, onProgress, options = {}) {
  const { maxPages = 100, waitTime = 800, excludePaths = [] } = options;
  const baseUrl = new URL(siteUrl);
  const origin = baseUrl.origin;
  const siteDir = path.join(uploadDir, 'sites', siteSlug);

  ['html', 'assets/css', 'assets/js', 'images', 'images/thumbs'].forEach(dir => {
    fs.mkdirSync(path.join(siteDir, dir), { recursive: true });
  });

  const browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false'
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });

  // ─────────────────────────────────────────────────────────
  // PHASE 1: Pre-load Sitemap để có URL đầy đủ ngay từ đầu
  // ─────────────────────────────────────────────────────────
  onProgress?.({ status: 'crawling', progress: 3, message: 'Đang quét Sitemap.xml...' });

  const customQueue = options.customQueue || [];
  const visited = new Set();
  const queued = new Set();

  // Priority queue structure: { url, priority }
  // priority 0 = sitemap (cao nhất), 1 = menu nav, 2 = content, 3 = footer
  const queue = [];

  // Thêm URL gốc
  const normalRoot = normalizeUrl(siteUrl, origin);
  if (normalRoot) {
    queue.push({ url: normalRoot, priority: 0 });
    queued.add(normalRoot);
  }

  // Nếu có customQueue (từ X-Ray scanner), dùng ngay
  if (customQueue.length > 0) {
    for (const cu of customQueue) {
      const norm = normalizeUrl(cu.url || cu, origin);
      if (norm && !queued.has(norm)) {
        queue.push({ url: norm, priority: 1 });
        queued.add(norm);
      }
    }
  } else {
    // Fetch sitemap URLs và add vào queue với priority 0
    try {
      const sitemapUrls = await fetchSitemapUrls(siteUrl, origin);
      for (const su of sitemapUrls) {
        const norm = normalizeUrl(su, origin);
        if (norm && !queued.has(norm)) {
          const isExcluded = excludePaths.some(ex => norm.includes(ex));
          if (!isExcluded) {
            queue.push({ url: norm, priority: 0 });
            queued.add(norm);
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Sitemap fetch failed:', e.message);
    }
  }

  queue.sort((a, b) => a.priority - b.priority);

  const pages = [];
  const assetMap = { css: [], js: [], images: {}, media: [] };

  console.log(`🕷️ Starting crawl: ${siteUrl} (max: ${maxPages} pages, queue: ${queue.length})`);
  onProgress?.({ status: 'crawling', progress: 5, message: `Bắt đầu crawl (${queue.length} URLs từ sitemap, tối đa ${maxPages} trang)...` });

  let crawledPages = 0;

  while (queue.length > 0 && crawledPages < maxPages) {
    const item = queue.shift();
    const url = item.url;

    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const page = await context.newPage();

      // Chặn font, media để tăng tốc
      await page.route('**/*', route => {
        const rt = route.request().resourceType();
        if (['font', 'media'].includes(rt)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      console.log(`📄 [${crawledPages + 1}/${Math.max(queue.length + crawledPages, 1)}] Crawling: ${url}`);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });

      // Chờ thêm JS render (tối đa 8s)
      try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch (e) {}

      await page.waitForTimeout(800);

      // ── PHASE 2A: Hover vào nav items để trigger dropdown sub-menus ──
      try {
        const navSelectors = [
          'nav a', 'header a', '.menu > li', '.navbar-nav > li',
          '[class*="menu-item"]', '[class*="nav-item"]', '.dropdown > a',
          '.has-children > a', '.has-submenu > a'
        ];
        for (const sel of navSelectors) {
          const navItems = await page.$$(sel);
          for (const navItem of navItems.slice(0, 20)) {
            try { await navItem.hover({ timeout: 500 }); } catch (e) {}
          }
        }
        await page.waitForTimeout(300);
      } catch (e) {}

      // ── Scroll để trigger lazy-load ──
      await page.evaluate(async () => {
        await new Promise(resolve => {
          let h = 0;
          const timer = setInterval(() => {
            const sh = document.body.scrollHeight;
            window.scrollBy(0, 400);
            h += 400;
            if (h >= sh) { clearInterval(timer); resolve(); }
          }, 80);
        });
      });
      await page.waitForTimeout(500);

      // Lấy HTML sau khi JS render
      const html = await page.content();
      const title = await page.title();

      const { html: cleanHtml, removedCount } = sanitizeContent(html);
      console.log(`   ✅ Removed ${removedCount} tracking elements`);

      const pagePath = getPagePath(url, origin);
      const htmlFilename = pathToFilename(pagePath);
      const htmlPath = path.join(siteDir, 'html', htmlFilename);
      fs.writeFileSync(htmlPath, cleanHtml, 'utf8');

      pages.push({
        url,
        path: pagePath,
        title,
        htmlFile: htmlFilename,
        isHome: url === siteUrl || url === normalizeUrl(siteUrl + '/', origin),
        rawHtml: cleanHtml
      });

      // ── PHASE 2B: Quét links thông minh ──
      const links = await page.evaluate((opts) => {
        const { origin, excludePaths } = opts;
        const results = new Map(); // url -> priority

        // Các tracking params cần xóa
        const STRIP_PARAMS = ['utm_source','utm_medium','utm_campaign','utm_content',
          'utm_term','fbclid','gclid','_ga','_gl','mc_eid','msclkid','ref'];

        const addLink = (href, priority) => {
          if (!href) return;
          try {
            const u = new URL(href, document.baseURI);
            if (u.origin !== origin) return;
            // Bỏ qua anchor-only cùng pathname
            if (u.hash && u.pathname === window.location.pathname && !u.search) return;
            // Xóa tracking params, GIỮ slug/cat/id/page...
            STRIP_PARAMS.forEach(p => u.searchParams.delete(p));
            const norm = u.origin + (u.pathname.replace(/\/+$/, '') || '/') + (u.search || '');
            if (excludePaths.some(ex => norm.includes(ex))) return;
            if (!results.has(norm) || results.get(norm) > priority) {
              results.set(norm, priority);
            }
          } catch (e) {}
        };

        // Priority 1: Navigation links
        document.querySelectorAll(
          'nav a[href], header a[href], .menu a[href], .navbar a[href], '+
          '[class*="menu-item"] a[href], [class*="nav-item"] a[href], '+
          '[class*="navigation"] a[href]'
        ).forEach(a => addLink(a.href, 1));

        // Priority 1: Pagination links (đặc biệt quan trọng!)
        document.querySelectorAll(
          '[class*="pagination"] a[href], [class*="pager"] a[href], '+
          '[rel="next"], a[href*="/page/"], a[href*="?paged="], a[href*="?page="]'
        ).forEach(a => addLink(a.href, 1));

        // Priority 2: Content + category links
        document.querySelectorAll(
          'main a[href], article a[href], .content a[href], '+
          '[class*="post"] a[href], [class*="article"] a[href], '+
          '[class*="category"] a[href], [class*="product"] a[href], '+
          '[class*="service"] a[href], [class*="card"] a[href], '+
          '[class*="item"] a[href], [class*="list"] a[href]'
        ).forEach(a => addLink(a.href, 2));

        // Priority 2: data-href attributes (PHP/WordPress/custom sites)
        document.querySelectorAll('[data-href], [data-url], [data-link]').forEach(el => {
          const href = el.getAttribute('data-href') || el.getAttribute('data-url') || el.getAttribute('data-link');
          addLink(href, 2);
        });

        // Priority 3: Tất cả link còn lại
        document.querySelectorAll('a[href]').forEach(a => addLink(a.href, 3));

        return [...results.entries()].map(([url, priority]) => ({ url, priority }));
      }, { origin, excludePaths });

      // Add links to queue (chỉ nếu không dùng customQueue)
      if (!customQueue || customQueue.length === 0) {
        for (const { url: linkUrl, priority } of links) {
          if (!visited.has(linkUrl) && !queued.has(linkUrl)) {
            queued.add(linkUrl);
            queue.push({ url: linkUrl, priority });
          }
        }
        // Re-sort để ưu tiên nav links và sitemap
        queue.sort((a, b) => a.priority - b.priority);
      }

      // Thu thập assets (CSS, JS, Images)
      const assets = await page.evaluate(() => {
        const css = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(el => el.href).filter(h => h && h.startsWith('http'));
        const js = Array.from(document.querySelectorAll('script[src]')).map(el => el.src).filter(s => s && s.startsWith('http'));

        const imgs = new Set();

        document.querySelectorAll('img').forEach(el => {
          if (el.src && el.src.startsWith('http') && !(el.width <= 5 && el.height <= 5)) imgs.add(el.src);
          if (el.dataset.src && el.dataset.src.startsWith('http')) imgs.add(el.dataset.src);
          if (el.dataset.lazySrc && el.dataset.lazySrc.startsWith('http')) imgs.add(el.dataset.lazySrc);
          if (el.srcset) {
            el.srcset.split(',').map(p => p.trim().split(/\s+/)[0]).filter(Boolean).forEach(p => {
              try { const u = new URL(p, document.baseURI); if (u.href.startsWith('http')) imgs.add(u.href); } catch (e) {}
            });
          }
        });

        document.querySelectorAll('source[srcset], source[src]').forEach(el => {
          if (el.src && el.src.startsWith('http')) imgs.add(el.src);
          if (el.srcset) {
            el.srcset.split(',').map(p => p.trim().split(/\s+/)[0]).filter(Boolean).forEach(p => {
              try { const u = new URL(p, document.baseURI); if (u.href.startsWith('http')) imgs.add(u.href); } catch (e) {}
            });
          }
        });

        // Inline style background images
        document.querySelectorAll('*[style]').forEach(el => {
          const m = el.getAttribute('style').match(/url\(['"]?([^'"()]+)['"]?\)/i);
          if (m && m[1] && !m[1].startsWith('data:')) {
            try { const u = new URL(m[1], document.baseURI); if (u.href.startsWith('http')) imgs.add(u.href); } catch (e) {}
          }
        });

        // OG/Twitter meta images
        document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"],meta[itemprop="image"]').forEach(el => {
          if (el.content && el.content.startsWith('http')) imgs.add(el.content);
        });

        // Favicons
        document.querySelectorAll('link[rel*="icon"]').forEach(el => {
          if (el.href && el.href.startsWith('http')) imgs.add(el.href);
        });

        const media = [];
        document.querySelectorAll('video[src], audio[src], source[src]').forEach(el => {
          if (el.src && el.src.startsWith('http')) media.push(el.src);
        });

        return { css, js, images: [...imgs], media };
      });

      // Accumulate assets
      assets.css.forEach(u => !assetMap.css.includes(u) && assetMap.css.push(u));
      assets.js.forEach(u => !assetMap.js.includes(u) && assetMap.js.push(u));
      if (!assetMap.images[pagePath]) assetMap.images[pagePath] = [];
      assets.images.forEach(u => !assetMap.images[pagePath].includes(u) && assetMap.images[pagePath].push(u));
      assets.media.forEach(u => !assetMap.media.includes(u) && assetMap.media.push(u));

      crawledPages++;
      const totalEstimate = Math.max(queued.size, crawledPages + queue.length);
      const progress = Math.min(10 + Math.round((crawledPages / Math.max(totalEstimate, 1)) * 50), 60);
      onProgress?.({ status: 'crawling', progress, message: `Đang crawl trang ${crawledPages} (queue: ${queue.length} còn lại)...` });

      await page.close();

    } catch (err) {
      console.error(`   ❌ Error crawling ${url}:`, err.message);
      try { await context.pages().then(ps => ps.forEach(p => p.isClosed() || p.close())); } catch (e) {}
    }
  }

  await browser.close();
  console.log(`✅ Crawled ${pages.length} pages. (${visited.size} URLs visited)`);

  // === Download CSS, JS, Media ===
  onProgress?.({ status: 'assets', progress: 65, message: 'Đang tải CSS assets...' });
  for (const cssUrl of [...new Set(assetMap.css)].slice(0, 30)) {
    await downloadAsset(cssUrl, siteDir, 'assets/css', origin);
  }

  onProgress?.({ status: 'assets', progress: 75, message: 'Đang tải JS assets...' });
  for (const jsUrl of [...new Set(assetMap.js)].slice(0, 30)) {
    await downloadAsset(jsUrl, siteDir, 'assets/js', origin);
  }

  onProgress?.({ status: 'assets', progress: 80, message: 'Đang tải Media (Video/Audio)...' });
  for (const mediaUrl of [...new Set(assetMap.media)].slice(0, 5)) {
    await downloadAsset(mediaUrl, siteDir, 'assets/media', origin);
  }

  // === Download & Optimize Images ===
  onProgress?.({ status: 'images', progress: 85, message: 'Đang tải và optimize ảnh...' });
  const mediaItems = [];
  const imageCounts = {};

  for (const p in assetMap.images) {
    [...new Set(assetMap.images[p])].forEach(img => {
      imageCounts[img] = (imageCounts[img] || 0) + 1;
    });
  }

  const targetImages = Object.keys(imageCounts).slice(0, 500);
  const concurrencyLimit = 6;

  for (let i = 0; i < targetImages.length; i += concurrencyLimit) {
    const chunk = targetImages.slice(i, i + concurrencyLimit);
    const chunkPromises = chunk.map(async (imgUrl) => {
      const count = imageCounts[imgUrl];
      let targetFolder = count > 1 ? 'global' : (() => {
        const pg = Object.keys(assetMap.images).find(p => assetMap.images[p].includes(imgUrl));
        if (!pg) return 'global';
        return pg === '/' ? 'index' : pg.replace(/^\//, '').replace(/\//g, '_');
      })();

      const filename = imgUrl.split('/').pop().split('?')[0] || 'image.jpg';
      const fixedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || `image_${Date.now()}.jpg`;
      const result = await downloadAndOptimizeImage(imgUrl, fixedName, siteDir, targetFolder);
      if (result) return { fixedName, originalUrl: imgUrl, folder: targetFolder, ...result };
      return null;
    });

    const results = await Promise.all(chunkPromises);
    results.filter(r => r !== null).forEach(r => mediaItems.push(r));

    const prog = Math.min(85 + Math.round(((i + chunk.length) / targetImages.length) * 10), 98);
    onProgress?.({ status: 'images', progress: prog, message: `Đang tải ảnh: ${Math.min(i + chunk.length, targetImages.length)} / ${targetImages.length} ...` });
  }

  onProgress?.({ status: 'done', progress: 100, message: `Hoàn tất! ${pages.length} trang, ${mediaItems.length} ảnh.` });
  return { pages, mediaItems, siteDir };
}

// ============================================================
// HELPER: Download CSS/JS asset
// ============================================================
async function downloadAsset(url, siteDir, subdir, baseOrigin) {
  try {
    const isCss = subdir.includes('css');
    const response = await axios.get(url, {
      responseType: isCss || subdir.includes('js') ? 'text' : 'arraybuffer',
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 WebTools-CMS-Crawler/2.0' }
    });

    const filename = url.split('/').pop().split('?')[0] || `asset_${Date.now()}`;
    const filePath = path.join(siteDir, subdir, filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    let content = response.data;

    if (isCss && typeof content === 'string') {
      const cssUrlRegex = /(?:url\(['"]?([^'"()]+)['"]?\))|(?:@import\s+['"]([^'"]+)['"])/gi;
      const cssAssetsDir = path.join(siteDir, 'assets', 'css_assets');
      const urlsToReplace = [];
      let match;

      while ((match = cssUrlRegex.exec(content)) !== null) {
        const assetUrlMatch = match[1] || match[2];
        if (assetUrlMatch && !assetUrlMatch.startsWith('data:')) {
          urlsToReplace.push(assetUrlMatch);
        }
      }

      const promises = [];
      for (const assetUrl of [...new Set(urlsToReplace)]) {
        let fullAssetUrl;
        try {
          fullAssetUrl = assetUrl.startsWith('http') ? assetUrl
            : assetUrl.startsWith('/') ? new URL(assetUrl, baseOrigin).href
            : new URL(assetUrl, url).href;
        } catch (e) { continue; }

        const assetFilename = fullAssetUrl.split('/').pop().split('?')[0].replace(/[^a-zA-Z0-9._-]/g, '_') || `css_asset_${Date.now()}`;

        promises.push((async () => {
          try {
            const assetRes = await axios.get(fullAssetUrl, { responseType: 'arraybuffer', timeout: 8000 });
            fs.mkdirSync(cssAssetsDir, { recursive: true });
            fs.writeFileSync(path.join(cssAssetsDir, assetFilename), assetRes.data);
          } catch (e) {
            console.warn(`⚠️ Cannot download CSS nested asset: ${fullAssetUrl}`);
          }
        })());

        const replaceRegex = new RegExp(
          `url\\(['"]?${assetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\)|@import\\s+['"]${assetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
          'g'
        );
        content = content.replace(replaceRegex, matchStr => {
          if (matchStr.startsWith('@import')) return `@import url('../css_assets/${assetFilename}')`;
          return `url('../css_assets/${assetFilename}')`;
        });
      }

      if (promises.length > 0) await Promise.allSettled(promises);
    }

    fs.writeFileSync(filePath, content);
    return filename;
  } catch (err) {
    console.warn(`⚠️ Failed to download asset: ${url}`);
    return null;
  }
}

// ============================================================
// HELPERS: URL → Path → Filename
// ============================================================
function getPagePath(url, origin) {
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/+$/, '') || '/';
    return p.startsWith('/') ? p : '/' + p;
  } catch (e) {
    return '/';
  }
}

function pathToFilename(pagePath) {
  if (pagePath === '/') return 'index.html';
  const cleanStr = pagePath.replace(/^\//, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
  if (cleanStr.match(/\.(php|html|htm)$/i)) return cleanStr;
  return cleanStr + '.html';
}

module.exports = { crawlSite };
