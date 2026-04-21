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
 * WebTools Crawler v3.0 — Graph-Based Tree Crawl
 * Logic: index → scan <a> (menu/submenu/content) → vào từng link → lại scan
 * Lưu theo nhóm: biết từ trang nào → trỏ đến đâu → navGroup là gì
 * ============================================================
 */

// Tracking params cần xóa (GIỮ slug, cat, id, page)
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
  } catch (e) {
    return null;
  }
}

/**
 * Fetch & parse Sitemap XML để có thêm URLs
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
          if (sub.startsWith('http')) {
            const subUrls = await parseSitemapXml(sub, origin);
            urls.push(...subUrls);
          }
        }
      } else if (res.data.includes('<loc>')) {
        const $ = cheerio.load(res.data, { xmlMode: true });
        if ($('sitemap').length > 0) {
          // sitemap index
          const subs = [];
          $('sitemap > loc').each((_, el) => subs.push($(el).text().trim()));
          for (const sub of subs.slice(0, 10)) {
            const subUrls = await parseSitemapXml(sub, origin);
            urls.push(...subUrls);
          }
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
    $('url > loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (loc.startsWith(origin)) urls.push(loc);
    });
    return urls;
  } catch (e) { return []; }
}

// ============================================================
// MAIN: crawlSite — Graph-Based Tree Crawl
// ============================================================
async function crawlSite(siteUrl, siteSlug, uploadDir, onProgress, options = {}) {
  const { maxPages = 150, excludePaths = [] } = options;
  const baseUrl = new URL(siteUrl);
  const origin = baseUrl.origin;
  const siteDir = path.join(uploadDir, 'sites', siteSlug);

  ['html', 'assets/css', 'assets/js', 'images', 'images/thumbs'].forEach(dir =>
    fs.mkdirSync(path.join(siteDir, dir), { recursive: true })
  );

  // ── Phase 1: Pre-load sitemap ──
  onProgress?.({ status: 'crawling', progress: 3, message: '🗺️ Đang quét Sitemap.xml...' });
  const sitemapUrls = await fetchSitemapUrls(origin);
  console.log(`📍 Sitemap: ${sitemapUrls.length} URLs`);

  const browser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== 'false' });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });

  // ── Graph data structures ──
  const visited = new Set();
  const queued = new Set();

  // Queue item: { url, parentUrl, navGroup, depth, priority }
  const queue = [];

  // Site graph: url -> PageNode
  const siteGraph = new Map();

  // Helper: thêm URL vào queue với dedup
  function enqueue(url, parentUrl, navGroup, depth, priority = 3) {
    const norm = normalizeUrl(url, origin);
    if (!norm) return;
    if (visited.has(norm) || queued.has(norm)) return;
    const isExcluded = excludePaths.some(ex => norm.includes(ex));
    if (isExcluded) return;
    queued.add(norm);
    queue.push({ url: norm, parentUrl, navGroup, depth, priority });
  }

  // Root URL
  const rootNorm = normalizeUrl(siteUrl, origin);
  queued.add(rootNorm);
  queue.push({ url: rootNorm, parentUrl: null, navGroup: 'root', depth: 0, priority: 0 });

  // Sitemap URLs vào queue
  if (options.customQueue?.length > 0) {
    options.customQueue.forEach(u => enqueue(u.url || u, rootNorm, 'sitemap', 1, 0));
  } else {
    sitemapUrls.forEach(u => enqueue(u, rootNorm, 'sitemap', 1, 0));
  }

  queue.sort((a, b) => a.priority - b.priority);

  const pages = [];
  const assetMap = { css: [], js: [], images: {}, media: [] };
  let crawledPages = 0;

  console.log(`🕷️ Graph Crawl: ${siteUrl} | Queue: ${queue.length} | Max: ${maxPages}`);
  onProgress?.({ status: 'crawling', progress: 5, message: `🕷️ Bắt đầu Tree Crawl (${queue.length} URLs, tối đa ${maxPages} trang)...` });

  // ── Phase 2: Crawl từng trang theo cây ──
  while (queue.length > 0 && crawledPages < maxPages) {
    const item = queue.shift();
    const { url, parentUrl, navGroup, depth } = item;

    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const page = await context.newPage();

      // Block font/media để tăng tốc
      await page.route('**/*', route => {
        const rt = route.request().resourceType();
        ['font', 'media'].includes(rt) ? route.abort() : route.continue();
      });

      console.log(`📄 [d${depth}|${navGroup}] ${url.replace(origin, '')}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch (e) {}

      // Hover vào nav để trigger dropdowns
      try {
        const navItems = await page.$$('nav > ul > li, header > ul > li, .menu > li, .navbar-nav > li');
        for (const ni of navItems.slice(0, 15)) {
          try { await ni.hover({ timeout: 300 }); } catch (e) {}
        }
        await page.waitForTimeout(300);
      } catch (e) {}

      // Scroll để load lazy content
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
      const { html: cleanHtml, removedCount } = sanitizeContent(html);

      const pagePath = getPagePath(url, origin);
      const htmlFilename = pathToFilename(pagePath + (url.includes('?') ? '_' + Buffer.from(url.split('?')[1] || '').toString('base64').substring(0, 16) : ''));
      const htmlPath = path.join(siteDir, 'html', htmlFilename);
      fs.writeFileSync(htmlPath, cleanHtml, 'utf8');

      // Tạo PageNode trong siteGraph
      const pageNode = {
        url,
        normalizedUrl: url,
        title,
        depth,
        parentUrl,
        navGroup,
        children: [],
        htmlFile: htmlFilename,
        path: pagePath,
      };
      siteGraph.set(url, pageNode);

      // Gắn node này vào children của parent
      if (parentUrl && siteGraph.has(parentUrl)) {
        siteGraph.get(parentUrl).children.push(url);
      }

      pages.push({
        url,
        path: pagePath,
        title,
        htmlFile: htmlFilename,
        isHome: url === rootNorm || url === siteUrl,
        rawHtml: cleanHtml,
        parentUrl,
        navGroup,
        depth,
      });

      // ── Phân loại & quét links theo nhóm ──
      const discoveredLinks = await page.evaluate((opts) => {
        const { origin, STRIP } = opts;
        const groups = { menu: [], submenu: [], content: [], pagination: [], footer: [] };

        function cleanUrl(href) {
          if (!href) return null;
          try {
            const u = new URL(href, document.baseURI);
            if (u.origin !== origin) return null;
            if (u.hash && u.pathname === window.location.pathname && !u.search) return null;
            STRIP.forEach(p => u.searchParams.delete(p));
            return u.origin + (u.pathname.replace(/\/+$/, '') || '/') + (u.search || '');
          } catch (e) { return null; }
        }

        function getLabel(el) {
          const t = el.innerText?.trim().replace(/\s+/g, ' ').substring(0, 50);
          if (t) return t;
          const img = el.querySelector('img');
          if (img) return img.alt || img.title || 'Image';
          return el.title || el.getAttribute('aria-label') || '';
        }

        // MENU CHÍNH
        document.querySelectorAll(
          'nav > ul a, header > nav a, .main-menu a, .primary-menu a, ' +
          '[class*="main-nav"] a, [id*="main-menu"] a, [id*="primary"] a, ' +
          '.navbar-nav > li > a, .menu > li > a'
        ).forEach(a => {
          const url = cleanUrl(a.href);
          if (url) groups.menu.push({ url, label: getLabel(a) });
        });

        // SUBMENU / DROPDOWN
        document.querySelectorAll(
          '.dropdown-menu a, .sub-menu a, ul ul a, ' +
          '[class*="submenu"] a, [class*="sub-menu"] a, [class*="dropdown"] li a, ' +
          '.navbar-nav .dropdown-menu a, [aria-haspopup] + ul a'
        ).forEach(a => {
          const url = cleanUrl(a.href);
          if (url) groups.submenu.push({ url, label: getLabel(a) });
        });

        // NỘI DUNG CHÍNH (articles, cards, posts)
        document.querySelectorAll(
          'main a[href], article a[href], [class*="content"] a[href], ' +
          '[class*="card"] a[href], [class*="post"] a[href], ' +
          '[class*="item"] a[href], [class*="article"] a[href], ' +
          '[class*="news"] a[href], [class*="product"] a[href], ' +
          '[class*="blog"] a[href], [class*="entry"] a[href]'
        ).forEach(a => {
          const url = cleanUrl(a.href);
          if (url) groups.content.push({ url, label: getLabel(a) });
        });

        // PAGINATION
        document.querySelectorAll(
          '[class*="pagination"] a, [class*="pager"] a, ' +
          'a[rel="next"], a[rel="prev"], ' +
          'a[href*="/page/"], a[href*="?paged="], a[href*="?page="]'
        ).forEach(a => {
          const url = cleanUrl(a.href);
          if (url) groups.pagination.push({ url, label: getLabel(a) || 'Page' });
        });

        // FOOTER links
        document.querySelectorAll('footer a[href]').forEach(a => {
          const url = cleanUrl(a.href);
          if (url) groups.footer.push({ url, label: getLabel(a) });
        });

        // data-href (PHP custom sites)
        document.querySelectorAll('[data-href], [data-url]').forEach(el => {
          const href = el.getAttribute('data-href') || el.getAttribute('data-url');
          const url = cleanUrl(href);
          if (url) groups.content.push({ url, label: el.innerText?.trim().substring(0, 50) || '' });
        });

        // ════ CATCH-ALL: BẮT TẤT CẢ LINK CÒN LẠI (quan trọng nhất!) ════
        // Đảm bảo không bỏ sót link nào dù nằm trong container nào
        const allKnown = new Set([
          ...groups.menu.map(l => l.url),
          ...groups.submenu.map(l => l.url),
          ...groups.content.map(l => l.url),
          ...groups.pagination.map(l => l.url),
          ...groups.footer.map(l => l.url),
        ]);
        document.querySelectorAll('a[href]').forEach(a => {
          const url = cleanUrl(a.href);
          if (url && !allKnown.has(url)) {
            groups.other = groups.other || [];
            groups.other.push({ url, label: getLabel(a) });
          }
        });

        // Dedup từng group
        for (const k of Object.keys(groups)) {
          const seen = new Set();
          groups[k] = (groups[k] || []).filter(l => {
            if (seen.has(l.url)) return false;
            seen.add(l.url);
            return true;
          });
        }

        return groups;
      }, { origin, STRIP: TRACKING_PARAMS });

      // Enqueue theo nhóm với priority và navGroup label
      const menuLabels = new Map(discoveredLinks.menu.map(l => [l.url, l.label]));

      discoveredLinks.menu.forEach(({ url: linkUrl, label }) => {
        enqueue(linkUrl, url, `menu|${label.substring(0, 30)}`, depth + 1, 1);
      });
      discoveredLinks.submenu.forEach(({ url: linkUrl, label }) => {
        const parentLabel = menuLabels.get(linkUrl) || label;
        enqueue(linkUrl, url, `submenu|${parentLabel.substring(0, 30)}`, depth + 1, 1);
      });
      discoveredLinks.pagination.forEach(({ url: linkUrl, label }) => {
        enqueue(linkUrl, url, `pagination`, depth + 1, 1);
      });
      discoveredLinks.content.forEach(({ url: linkUrl, label }) => {
        enqueue(linkUrl, url, `content|${label.substring(0, 30)}`, depth + 1, 2);
      });
      discoveredLinks.footer.forEach(({ url: linkUrl, label }) => {
        enqueue(linkUrl, url, `footer|${label.substring(0, 30)}`, depth + 1, 3);
      });
      // CATCH-ALL: các link chưa được classify
      (discoveredLinks.other || []).forEach(({ url: linkUrl, label }) => {
        enqueue(linkUrl, url, `other|${label.substring(0, 30)}`, depth + 1, 4);
      });

      const totalDisc = Object.values(discoveredLinks).reduce((s, a) => s + a.length, 0);
      console.log(`   ↳ Found: ${discoveredLinks.menu?.length}M ${discoveredLinks.submenu?.length}S ${discoveredLinks.content?.length}C ${discoveredLinks.pagination?.length}P ${discoveredLinks.other?.length || 0}O | Queue: ${queue.length}`);

      // Re-sort để ưu tiên menu/submenu/pagination
      queue.sort((a, b) => a.priority - b.priority);

      // Thu thập assets
      const assets = await page.evaluate(() => {
        const css = [...document.querySelectorAll('link[rel="stylesheet"]')].map(e => e.href).filter(h => h?.startsWith('http'));
        const js = [...document.querySelectorAll('script[src]')].map(e => e.src).filter(s => s?.startsWith('http'));
        const imgs = new Set();
        document.querySelectorAll('img').forEach(e => {
          if (e.src?.startsWith('http') && !(e.width <= 5 && e.height <= 5)) imgs.add(e.src);
          if (e.dataset.src?.startsWith('http')) imgs.add(e.dataset.src);
          if (e.srcset) e.srcset.split(',').map(p => p.trim().split(/\s+/)[0]).forEach(p => {
            try { const u = new URL(p, document.baseURI); if (u.href.startsWith('http')) imgs.add(u.href); } catch(e) {}
          });
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
      onProgress?.({ status: 'crawling', progress, message: `[d${depth}] ${navGroup} → "${title.substring(0, 30)}" | ${crawledPages} trang, queue: ${queue.length}` });

      await page.close();
    } catch (err) {
      console.error(`❌ Error [${url}]:`, err.message);
      try {
        const ps = context.pages();
        for (const p of await ps) { if (!p.isClosed()) await p.close().catch(() => {}); }
      } catch (e) {}
    }
  }

  await browser.close();
  console.log(`✅ Graph Crawl done: ${pages.length} pages | ${siteGraph.size} nodes | ${visited.size} visited`);

  // In tree summary
  const depths = {};
  const navGroups = {};
  for (const [, node] of siteGraph) {
    depths[node.depth] = (depths[node.depth] || 0) + 1;
    const g = node.navGroup.split('|')[0];
    navGroups[g] = (navGroups[g] || 0) + 1;
  }
  console.log('📊 Depth distribution:', depths);
  console.log('📊 NavGroup distribution:', navGroups);

  // ── Phase 3: Download assets ──
  onProgress?.({ status: 'assets', progress: 65, message: '⬇️ Đang tải CSS assets...' });
  for (const cssUrl of [...new Set(assetMap.css)].slice(0, 30)) {
    await downloadAsset(cssUrl, siteDir, 'assets/css', origin);
  }

  onProgress?.({ status: 'assets', progress: 75, message: '⬇️ Đang tải JS assets...' });
  for (const jsUrl of [...new Set(assetMap.js)].slice(0, 30)) {
    await downloadAsset(jsUrl, siteDir, 'assets/js', origin);
  }

  onProgress?.({ status: 'assets', progress: 80, message: '⬇️ Đang tải Media...' });
  for (const mediaUrl of [...new Set(assetMap.media)].slice(0, 5)) {
    await downloadAsset(mediaUrl, siteDir, 'assets/media', origin);
  }

  // ── Phase 4: Download & Optimize Images ──
  onProgress?.({ status: 'images', progress: 85, message: '🖼️ Đang tải và optimize ảnh...' });
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
      const targetFolder = count > 1 ? 'global' : (() => {
        const pg = Object.keys(assetMap.images).find(p => assetMap.images[p].includes(imgUrl));
        if (!pg) return 'global';
        return pg === '/' ? 'index' : pg.replace(/^\//, '').replace(/\//g, '_');
      })();
      const filename = imgUrl.split('/').pop().split('?')[0] || 'image.jpg';
      const fixedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || `image_${Date.now()}.jpg`;
      const result = await downloadAndOptimizeImage(imgUrl, fixedName, siteDir, targetFolder);
      return result ? { fixedName, originalUrl: imgUrl, folder: targetFolder, ...result } : null;
    }));
    results.filter(r => r !== null).forEach(r => mediaItems.push(r));
    const prog = Math.min(85 + Math.round(((i + chunk.length) / targetImages.length) * 10), 98);
    onProgress?.({ status: 'images', progress: prog, message: `🖼️ Ảnh: ${Math.min(i + chunk.length, targetImages.length)} / ${targetImages.length}` });
  }

  onProgress?.({ status: 'done', progress: 100, message: `✅ Hoàn tất! ${pages.length} trang, ${mediaItems.length} ảnh.` });
  return { pages, mediaItems, siteDir, siteGraph };
}

// ============================================================
// HELPER: Download CSS/JS asset
// ============================================================
async function downloadAsset(url, siteDir, subdir, baseOrigin) {
  try {
    const isCss = subdir.includes('css');
    const res = await axios.get(url, {
      responseType: isCss || subdir.includes('js') ? 'text' : 'arraybuffer',
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 WebTools-CMS-Crawler/3.0' }
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
      const promises = [...new Set(urlsToReplace)].map(async assetUrl => {
        let full;
        try {
          full = assetUrl.startsWith('http') ? assetUrl
            : assetUrl.startsWith('/') ? new URL(assetUrl, baseOrigin).href
            : new URL(assetUrl, url).href;
        } catch (e) { return; }
        const fn = full.split('/').pop().split('?')[0].replace(/[^a-zA-Z0-9._-]/g, '_') || `css_${Date.now()}`;
        try {
          const r = await axios.get(full, { responseType: 'arraybuffer', timeout: 8000 });
          fs.mkdirSync(cssAssetsDir, { recursive: true });
          fs.writeFileSync(path.join(cssAssetsDir, fn), r.data);
          const re = new RegExp(`url\\(['"]?${assetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\)`, 'g');
          content = content.replace(re, `url('../css_assets/${fn}')`);
        } catch (e) {}
      });
      await Promise.allSettled(promises);
    }
    fs.writeFileSync(filePath, content);
    return filename;
  } catch (err) {
    console.warn(`⚠️ Asset download failed: ${url}`);
    return null;
  }
}

// ============================================================
// HELPERS
// ============================================================
function getPagePath(url, origin) {
  try {
    const u = new URL(url);
    return (u.pathname.replace(/\/+$/, '') || '/');
  } catch (e) { return '/'; }
}

function pathToFilename(pagePath) {
  if (pagePath === '/' || pagePath === '/index.html') return 'index.html';
  const clean = pagePath.replace(/^\//, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
  return clean.match(/\.(php|html|htm)$/i) ? clean : clean + '.html';
}

module.exports = { crawlSite };
