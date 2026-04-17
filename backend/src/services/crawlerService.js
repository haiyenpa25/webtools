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
  const queued = new Set([siteUrl]);
  const queue = [{ url: siteUrl, priority: 1 }];
  const pages = [];
  const assetMap = { css: [], js: [], images: {}, media: [] };
  
  console.log(`🕷️ Starting crawl: ${siteUrl} (max: ${maxPages} pages)`);
  onProgress?.({ status: 'crawling', progress: 5, message: `Khởi động crawl (max: ${maxPages} trang)...` });

  let totalPages = 1;
  let crawledPages = 0;

  while (queue.length > 0 && crawledPages < maxPages) {
    const item = queue.shift();
    const url = item.url;
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

      // Chờ nội dung load tĩnh cơ bản
      await page.waitForTimeout(1000);

      // --- FINAL BOSS 1: SMOOTH SCROLL (VƯỢT TRẦN LAZY-LOAD) ---
      // Cuộn trang tự động để các thư viện JS như IntersectionObserver nạp 100% Ảnh
      await page.evaluate(async () => {
         await new Promise((resolve) => {
             let totalHeight = 0;
             const distance = 300;
             const timer = setInterval(() => {
                 const scrollHeight = document.body.scrollHeight;
                 window.scrollBy(0, distance);
                 totalHeight += distance;
                 if (totalHeight >= scrollHeight) {
                     clearInterval(timer);
                     resolve();
                 }
             }, 100);
         });
      });
      // Đợi thêm 1.5s để server phản hồi hình ảnh sau khi cuộn tới đáy
      await page.waitForTimeout(1500);
      // -------------------------------------------------------------

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
        const results = [];
        const anchors = document.querySelectorAll('a[href]');
        
        anchors.forEach(a => {
          const href = a.href;
          if (!href.startsWith(origin) || href.includes('#')) return;

          let cleanUrl;
          try {
             // Chống miss page có chứa tham số ?page=2, loại bỏ string tracking
             const u = new URL(href);
             ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid'].forEach(param => u.searchParams.delete(param));
             cleanUrl = u.toString();
          } catch(e) { cleanUrl = href; }

          let priority = 3;
          if (a.closest('nav, header, .menu, #menu, .dropdown-menu, .navigation')) priority = 1;
          else if (a.closest('main, article, .content') || a.matches('.btn, button, [class*="btn-"]')) priority = 2;

          results.push({ url: cleanUrl, priority });
        });
        
        return results;
      }, baseUrl.origin);

      // Thêm links mới vào queue
      links.forEach(({ url: cleanLink, priority }) => {
        // Kiểm tra xem link có nằm trong danh sách exclude bỏ qua không
        const isExcluded = excludePaths.some(ex => cleanLink.includes(ex));

        if (!isExcluded && !visited.has(cleanLink) && !queued.has(cleanLink)) {
          queued.add(cleanLink);
          queue.push({ url: cleanLink, priority });
          totalPages++;
        }
      });
      // Ưu tiên Sitemap: link menu sẽ được crawl trước để tránh miss trang nếu vuợt quá giới hạn
      queue.sort((a, b) => a.priority - b.priority);

      // Thu thập CSS, JS, Images, và Media assets
      const assets = await page.evaluate(() => {
        const cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .map(el => el.href).filter(h => h && h.startsWith('http'));
        const jsLinks = Array.from(document.querySelectorAll('script[src]'))
          .map(el => el.src).filter(s => s && s.startsWith('http'));
          
        let imgSrcs = [];
        document.querySelectorAll('img').forEach(el => {
           if (el.src && el.src.startsWith('http')) {
              if (el.width && el.width <= 5 && el.height && el.height <= 5) return;
              imgSrcs.push(el.src);
           }
           if (el.srcset) {
              const parts = el.srcset.split(',').map(p => p.trim().split(/\\s+/)[0]).filter(Boolean);
              parts.forEach(p => {
                 try {
                     const fUrl = new URL(p, document.baseURI).href;
                     if (fUrl.startsWith('http')) imgSrcs.push(fUrl);
                 } catch(e) {}
              });
           }
        });
        
        document.querySelectorAll('source[srcset]').forEach(el => {
           if (el.srcset) {
              const parts = el.srcset.split(',').map(p => p.trim().split(/\\s+/)[0]).filter(Boolean);
              parts.forEach(p => {
                 try {
                     const fUrl = new URL(p, document.baseURI).href;
                     if (fUrl.startsWith('http')) imgSrcs.push(fUrl);
                 } catch(e) {}
              });
           }
        });

        // Other Media (Video, Audio)
        let mediaSrcs = [];
        document.querySelectorAll('video, audio, source[src]').forEach(el => {
           if (el.src && el.src.startsWith('http')) mediaSrcs.push(el.src);
        });

        // --- FINAL BOSS 2: KẺ XUYÊN THẤU INLINE STYLE CSS ---
        document.querySelectorAll('*[style]').forEach(el => {
           const inlineStyle = el.getAttribute('style') || '';
           const match = inlineStyle.match(/url\(['"]?([^'"()]+)['"]?\)/i);
           if (match && match[1] && !match[1].startsWith('data:')) {
               try {
                   const fUrl = new URL(match[1], document.baseURI).href;
                   if (fUrl.startsWith('http')) imgSrcs.push(fUrl);
               } catch(e) {}
           }
        });

        // --- FINAL BOSS 3: BẢN ĐỒ MẠNG XÃ HỘI (OG / TWITTER / FAVICON) ---
        const metaTags = document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], meta[itemprop="image"]');
        metaTags.forEach(el => {
            if (el.content && el.content.startsWith('http')) imgSrcs.push(el.content);
        });
        
        const linkTags = document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]');
        linkTags.forEach(el => {
            if (el.href && el.href.startsWith('http')) imgSrcs.push(el.href);
        });

        return { css: cssLinks, js: jsLinks, images: [...new Set(imgSrcs)], media: [...new Set(mediaSrcs)] };
      });

      // Accumulate assets
      assets.css.forEach(u => !assetMap.css.includes(u) && assetMap.css.push(u));
      assets.js.forEach(u => !assetMap.js.includes(u) && assetMap.js.push(u));
      
      if (!assetMap.images) assetMap.images = {};
      if (!assetMap.media) assetMap.media = [];

      if (!assetMap.images[pagePath]) assetMap.images[pagePath] = [];
      assets.images.forEach(u => !assetMap.images[pagePath].includes(u) && assetMap.images[pagePath].push(u));
      
      assets.media.forEach(u => !assetMap.media.includes(u) && assetMap.media.push(u));

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

  // Download media assets (Video/Audio)
  onProgress?.({ status: 'assets', progress: 80, message: 'Đang tải Media (Video/Audio)...' });
  const uniqueMedia = [...new Set(assetMap.media || [])];
  for (const mediaUrl of uniqueMedia.slice(0, 5)) { // Limit media downloads to 5 heavy ones
    await downloadAsset(mediaUrl, siteDir, 'assets/media', baseUrl.origin);
  }

  // Download images và tổ chức Semantic
  onProgress?.({ status: 'images', progress: 85, message: 'Đang tải và optimize ảnh (phân loại thư mục)...' });
  const mediaItems = [];
  const imageCounts = {};

  // Tính số lần xuất hiện của các hình ảnh để xác định 'global'
  for (const p in assetMap.images) {
     const imgs = [...new Set(assetMap.images[p])];
     imgs.forEach(img => {
         imageCounts[img] = (imageCounts[img] || 0) + 1;
     });
  }

  const allUniqueImages = Object.keys(imageCounts);
  
  for (const imgUrl of allUniqueImages.slice(0, 100)) {
    const count = imageCounts[imgUrl];
    let targetFolder = 'global';
    
    if (count === 1) {
      const findingPagePath = Object.keys(assetMap.images).find(p => assetMap.images[p].includes(imgUrl));
      if (findingPagePath) {
        targetFolder = findingPagePath === '/' ? 'index' : findingPagePath.replace(/^\//, '').replace(/\//g, '_');
      }
    }

    const filename = imgUrl.split('/').pop().split('?')[0];
    const fixedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || `image_${Date.now()}.jpg`;
    
    const result = await downloadAndOptimizeImage(imgUrl, fixedName, siteDir, targetFolder);
    if (result) {
      mediaItems.push({
        fixedName,
        originalUrl: imgUrl,
        folder: targetFolder,
        ...result // includes path like: images/global/abc.jpg
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
    const isCss = subdir.includes('css');
    const response = await axios.get(url, {
      responseType: isCss || subdir.includes('js') ? 'text' : 'arraybuffer',
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 WebTools-CMS-Crawler/1.0' }
    });

    const filename = url.split('/').pop().split('?')[0] || `asset_${Date.now()}`;
    const filePath = path.join(siteDir, subdir, filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    let content = response.data;

    // DEEP CSS PARSING (Ngăn chặn gãy Font / Hình nền ẩn / @import)
    if (isCss && typeof content === 'string') {
      const cssUrlRegex = /(?:url\(['"]?([^'"()]+)['"]?\))|(?:@import\s+['"]([^'"]+)['"])/gi;
      const cssAssetsDir = path.join(siteDir, 'assets', 'css_assets');
      const promises = [];
      let match;
      
      const urlsToReplace = [];
      while ((match = cssUrlRegex.exec(content)) !== null) {
         const assetUrlMatch = match[1] || match[2];
         if (assetUrlMatch && !assetUrlMatch.startsWith('data:')) {
            urlsToReplace.push(assetUrlMatch);
         }
      }

      // Deduplicate
      const uniqueCssAssets = [...new Set(urlsToReplace)];
      
      for (const assetUrl of uniqueCssAssets) {
        let fullAssetUrl;
        try {
          if (assetUrl.startsWith('http')) fullAssetUrl = assetUrl;
          else if (assetUrl.startsWith('/')) fullAssetUrl = new URL(assetUrl, baseOrigin).href;
          else fullAssetUrl = new URL(assetUrl, url).href; // relative to CSS!
        } catch (e) { continue; }

        const assetFilename = fullAssetUrl.split('/').pop().split('?')[0].replace(/[^a-zA-Z0-9._-]/g, '_') || `css_asset_${Date.now()}`;
        
        // Add to promises for parallel download
        promises.push((async () => {
          try {
            const assetRes = await axios.get(fullAssetUrl, { responseType: 'arraybuffer', timeout: 8000 });
            fs.mkdirSync(cssAssetsDir, { recursive: true });
            fs.writeFileSync(path.join(cssAssetsDir, assetFilename), assetRes.data);
          } catch(e) {
            console.warn(`⚠️ Cannot download CSS nested asset: ${fullAssetUrl}`);
          }
        })());
        
        // Replace globally in CSS content for both url() and @import
        const replaceRegex = new RegExp(`url\\(['"]?${assetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\)|@import\\s+['"]${assetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g');
        content = content.replace(replaceRegex, (matchStr) => {
           if (matchStr.startsWith('@import')) return `@import url('../css_assets/${assetFilename}')`;
           return `url('../css_assets/${assetFilename}')`;
        });
      }
      
      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }
    }

    fs.writeFileSync(filePath, content);
    return filename;
  } catch (err) {
    console.warn(`⚠️ Failed to download asset: ${url}`);
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
  const cleanStr = pagePath.replace(/^\//, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
  if (cleanStr.match(/\.(php|html|htm)$/i)) return cleanStr;
  return cleanStr + '.html';
}

module.exports = { crawlSite };
