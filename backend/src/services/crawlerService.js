require('dotenv').config();
const { chromium } = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const { sanitizeContent, rewriteUrls } = require('./sanitizerService');
const { downloadAndOptimizeImage } = require('./imageService');

/**
 * Deep Crawler Service — Playwright-based
 * Phân tích DOM đệ quy, xây dựng Site Map, tải toàn bộ assets
 */

/**
 * Crawl toàn bộ website từ URL gốc
 */
async function crawlSite(siteUrl, siteSlug, uploadDir, onProgress, options = {}) {
  const { maxPages = 50, waitTime = 1000, excludePaths = [] } = options;
  const baseUrl = new URL(siteUrl);
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

  const visited = new Set();
  const queue = [siteUrl];
  const pages = [];
  const assetMap = { css: [], js: [], images: [] };
  
  console.log(`🕷️ Starting crawl: ${siteUrl} (max: ${maxPages} pages)`);
  onProgress?.({ status: 'crawling', progress: 5, message: `Khởi động crawl (max: ${maxPages} trang)...` });

  let totalPages = 1;
  let crawledPages = 0;

  while (queue.length > 0 && crawledPages < maxPages) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const page = await context.newPage();
      
      // Chặn các request không cần thiết để tăng tốc
      await page.route('**/*', route => {
        const resourceType = route.request().resourceType();
        if (['font', 'media'].includes(resourceType)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      console.log(`📄 Crawling: ${url}`);
      
      await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      // Chờ nội dung load
      await page.waitForTimeout(1000);

      // Lấy toàn bộ HTML sau khi JS render
      const html = await page.content();
      const title = await page.title();
      
      // Sanitize HTML
      const { html: cleanHtml, removedCount } = sanitizeContent(html);
      console.log(`   ✂️ Removed ${removedCount} tracking elements`);

      // Tính path tương đối
      const pagePath = getPagePath(url, baseUrl.origin);
      const htmlFilename = pathToFilename(pagePath);
      
      // Lưu HTML đã sanitize
      const htmlPath = path.join(siteDir, 'html', htmlFilename);
      fs.writeFileSync(htmlPath, cleanHtml, 'utf8');

      pages.push({
        url,
        path: pagePath,
        title,
        htmlFile: htmlFilename,
        isHome: url === siteUrl || url === siteUrl + '/',
        rawHtml: cleanHtml
      });

      // Tìm tất cả links trong trang
      const links = await page.evaluate((origin) => {
        return Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href)
          .filter(href => href.startsWith(origin) && !href.includes('#') && !href.includes('?'));
      }, baseUrl.origin);

      // Thêm links mới vào queue
      links.forEach(link => {
        const cleanLink = link.split('#')[0].split('?')[0];
        
        // Kiểm tra xem link có nằm trong danh sách exclude bỏ qua không
        const isExcluded = excludePaths.some(ex => cleanLink.includes(ex));

        if (!isExcluded && !visited.has(cleanLink) && !queue.includes(cleanLink)) {
          queue.push(cleanLink);
          totalPages++;
        }
      });

      // Thu thập CSS và JS assets
      const assets = await page.evaluate(() => {
        const cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .map(el => el.href).filter(h => h.startsWith('http'));
        const jsLinks = Array.from(document.querySelectorAll('script[src]'))
          .map(el => el.src).filter(s => s.startsWith('http'));
        const imgSrcs = Array.from(document.querySelectorAll('img[src]'))
          .map(el => el.src).filter(s => s.startsWith('http'));
        return { css: cssLinks, js: jsLinks, images: imgSrcs };
      });

      // Accumulate assets (fix: push instead of spread-assign)
      assets.css.forEach(u => !assetMap.css.includes(u) && assetMap.css.push(u));
      assets.js.forEach(u => !assetMap.js.includes(u) && assetMap.js.push(u));
      assets.images.forEach(u => !assetMap.images.includes(u) && assetMap.images.push(u));

      crawledPages++;
      const progress = Math.min(10 + Math.round((crawledPages / Math.max(totalPages, 1)) * 50), 60);
      onProgress?.({ status: 'crawling', progress, message: `Đang crawl trang ${crawledPages}/${totalPages}...` });

      await page.close();
    } catch (err) {
      console.error(`   ❌ Error crawling ${url}:`, err.message);
    }
  }

  await browser.close();
  console.log(`✅ Crawled ${pages.length} pages`);

  // Download CSS assets
  onProgress?.({ status: 'assets', progress: 65, message: 'Đang tải CSS assets...' });
  const uniqueCss = [...new Set(assetMap.css || [])];
  for (const cssUrl of uniqueCss.slice(0, 20)) {
    await downloadAsset(cssUrl, siteDir, 'assets/css', baseUrl.origin);
  }

  // Download JS assets
  onProgress?.({ status: 'assets', progress: 75, message: 'Đang tải JS assets...' });
  const uniqueJs = [...new Set(assetMap.js || [])];
  for (const jsUrl of uniqueJs.slice(0, 20)) {
    await downloadAsset(jsUrl, siteDir, 'assets/js', baseUrl.origin);
  }

  // Download images với fixed names
  onProgress?.({ status: 'images', progress: 85, message: 'Đang tải và optimize ảnh...' });
  const uniqueImages = [...new Set(assetMap.images || [])];
  const mediaItems = [];
  
  for (const imgUrl of uniqueImages.slice(0, 100)) {
    const filename = imgUrl.split('/').pop().split('?')[0];
    const fixedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || `image_${Date.now()}.jpg`;
    const result = await downloadAndOptimizeImage(imgUrl, fixedName, siteDir);
    if (result) {
      mediaItems.push({
        fixedName,
        originalUrl: imgUrl,
        ...result
      });
    }
  }

  onProgress?.({ status: 'done', progress: 100, message: 'Hoàn tất!' });

  return { pages, mediaItems, siteDir };
}

/**
 * Download một asset (CSS/JS) về local
 */
async function downloadAsset(url, siteDir, subdir, baseOrigin) {
  try {
    const response = await axios.get(url, {
      responseType: 'text',
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 WebTools-CMS-Crawler' }
    });

    const filename = url.split('/').pop().split('?')[0] || `asset_${Date.now()}`;
    const filePath = path.join(siteDir, subdir, filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, response.data);
    return filename;
  } catch (err) {
    // Không critical nếu 1 asset thất bại
    return null;
  }
}

/**
 * Helper: Chuyển URL thành page path
 */
function getPagePath(url, origin) {
  const path = url.replace(origin, '').replace(/\/$/, '') || '/';
  return path.startsWith('/') ? path : '/' + path;
}

/**
 * Helper: Chuyển path thành filename để lưu
 */
function pathToFilename(pagePath) {
  if (pagePath === '/') return 'index.html';
  return pagePath.replace(/^\//, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9_.-]/g, '') + '.html';
}

module.exports = { crawlSite };
