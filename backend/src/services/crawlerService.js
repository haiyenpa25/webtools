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
 * Deep Crawler Service ΓÇö Playwright-based
 * Ph├ón t├¡ch DOM ─æß╗ç quy, x├óy dß╗▒ng Site Map, tß║úi to├án bß╗Ö assets
 */

/**
 * Crawl to├án bß╗Ö website tß╗½ URL gß╗æc
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
  
  const customQueue = options.customQueue || [];
  const queue = customQueue.length > 0
    ? customQueue.map(url => ({ url, priority: 1 }))
    : [{ url: siteUrl, priority: 1 }];
    
  const queued = new Set(queue.map(q => q.url));
  const pages = [];
  const assetMap = { css: [], js: [], images: {}, media: [] };
  
  console.log(`≡ƒò╖∩╕Å Starting crawl: ${siteUrl} (max: ${maxPages} pages)`);
  onProgress?.({ status: 'crawling', progress: 5, message: `Khß╗ƒi ─æß╗Öng crawl (max: ${maxPages} trang)...` });

  let totalPages = 1;
  let crawledPages = 0;

  while (queue.length > 0 && crawledPages < maxPages) {
    const item = queue.shift();
    const url = item.url;
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const page = await context.newPage();
      
      // Chß║╖n c├íc request kh├┤ng cß║ºn thiß║┐t ─æß╗â t─âng tß╗æc
      await page.route('**/*', route => {
        const resourceType = route.request().resourceType();
        if (['font', 'media'].includes(resourceType)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      console.log(`≡ƒôä Crawling: ${url}`);
      
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 45000 
      });
      // Wait for additional JS rendering after DOM loaded
      try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch(e) { /* timeout ok */ }

      // Chß╗¥ nß╗Öi dung load t─⌐nh c╞í bß║ún
      await page.waitForTimeout(1000);

      // --- FINAL BOSS 1: SMOOTH SCROLL (V╞»ß╗óT TRß║ªN LAZY-LOAD) ---
      // Cuß╗Ön trang tß╗▒ ─æß╗Öng ─æß╗â c├íc th╞░ viß╗çn JS nh╞░ IntersectionObserver nß║íp 100% ß║ónh
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
      // ─Éß╗úi th├¬m 1.5s ─æß╗â server phß║ún hß╗ôi h├¼nh ß║únh sau khi cuß╗Ön tß╗¢i ─æ├íy
      await page.waitForTimeout(1500);
      // -------------------------------------------------------------

      // Lß║Ñy to├án bß╗Ö HTML sau khi JS render
      const html = await page.content();
      const title = await page.title();
      
      // Sanitize HTML
      const { html: cleanHtml, removedCount } = sanitizeContent(html);
      console.log(`   Γ£é∩╕Å Removed ${removedCount} tracking elements`);

      // T├¡nh path t╞░╞íng ─æß╗æi
      const pagePath = getPagePath(url, baseUrl.origin);
      const htmlFilename = pathToFilename(pagePath);
      
      // L╞░u HTML ─æ├ú sanitize
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

      // T├¼m tß║Ñt cß║ú links trong trang
      const links = await page.evaluate((origin) => {
        const results = [];
        const anchors = document.querySelectorAll('a[href]');
        
        anchors.forEach(a => {
          const href = a.href;
          if (!href.startsWith(origin) || href.includes('#')) return;

          let cleanUrl;
          try {
             // Chß╗æng miss page c├│ chß╗⌐a tham sß╗æ ?page=2, loß║íi bß╗Å string tracking
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

      // Th├¬m links mß╗¢i v├áo queue Nß║╛U kh├┤ng x├ái customQueue
      if (!customQueue || customQueue.length === 0) {
        links.forEach(({ url: cleanLink, priority }) => {
          // Kiß╗âm tra xem link c├│ nß║▒m trong danh s├ích exclude bß╗Å qua kh├┤ng
          const isExcluded = excludePaths.some(ex => cleanLink.includes(ex));

          if (!isExcluded && !visited.has(cleanLink) && !queued.has(cleanLink)) {
            queued.add(cleanLink);
            queue.push({ url: cleanLink, priority });
            totalPages++;
          }
        });
        // ╞»u ti├¬n Sitemap: link menu sß║╜ ─æ╞░ß╗úc crawl tr╞░ß╗¢c ─æß╗â tr├ính miss trang nß║┐u vuß╗út qu├í giß╗¢i hß║ín
        queue.sort((a, b) => a.priority - b.priority);
      }

      // Thu thß║¡p CSS, JS, Images, v├á Media assets
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

        // --- FINAL BOSS 2: Kß║║ XUY├èN THß║ñU INLINE STYLE CSS ---
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

        // --- FINAL BOSS 3: Bß║óN ─Éß╗Æ Mß║áNG X├â Hß╗ÿI (OG / TWITTER / FAVICON) ---
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
      onProgress?.({ status: 'crawling', progress, message: `─Éang crawl trang ${crawledPages}/${totalPages}...` });

      await page.close();
    } catch (err) {
      console.error(`   Γ¥î Error crawling ${url}:`, err.message);
    }
  }

  await browser.close();
  console.log(`Γ£à Crawled ${pages.length} pages`);

  // Download CSS assets
  onProgress?.({ status: 'assets', progress: 65, message: '─Éang tß║úi CSS assets...' });
  const uniqueCss = [...new Set(assetMap.css || [])];
  for (const cssUrl of uniqueCss.slice(0, 20)) {
    await downloadAsset(cssUrl, siteDir, 'assets/css', baseUrl.origin);
  }

  // Download JS assets
  onProgress?.({ status: 'assets', progress: 75, message: '─Éang tß║úi JS assets...' });
  const uniqueJs = [...new Set(assetMap.js || [])];
  for (const jsUrl of uniqueJs.slice(0, 20)) {
    await downloadAsset(jsUrl, siteDir, 'assets/js', baseUrl.origin);
  }

  // Download media assets (Video/Audio)
  onProgress?.({ status: 'assets', progress: 80, message: '─Éang tß║úi Media (Video/Audio)...' });
  const uniqueMedia = [...new Set(assetMap.media || [])];
  for (const mediaUrl of uniqueMedia.slice(0, 5)) { // Limit media downloads to 5 heavy ones
    await downloadAsset(mediaUrl, siteDir, 'assets/media', baseUrl.origin);
  }

  // Download images v├á tß╗ò chß╗⌐c Semantic
  onProgress?.({ status: 'images', progress: 85, message: '─Éang tß║úi v├á optimize ß║únh (ph├ón loß║íi th╞░ mß╗Ñc)...' });
  const mediaItems = [];
  const imageCounts = {};

  // T├¡nh sß╗æ lß║ºn xuß║Ñt hiß╗çn cß╗ºa c├íc h├¼nh ß║únh ─æß╗â x├íc ─æß╗ïnh 'global'
  for (const p in assetMap.images) {
     const imgs = [...new Set(assetMap.images[p])];
     imgs.forEach(img => {
         imageCounts[img] = (imageCounts[img] || 0) + 1;
     });
  }

  const allUniqueImages = Object.keys(imageCounts);
  
  // T?i uu t?i ?nh song song v?i Concurrency = 6
  const concurrencyLimit = 6;
  const targetImages = allUniqueImages.slice(0, 500); 

  for (let i = 0; i < targetImages.length; i += concurrencyLimit) {
    const chunk = targetImages.slice(i, i + concurrencyLimit);
    
    const chunkPromises = chunk.map(async (imgUrl) => {
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
        return { fixedName, originalUrl: imgUrl, folder: targetFolder, ...result };
      }
      return null;
    });

    const results = await Promise.all(chunkPromises);
    results.filter(r => r !== null).forEach(r => mediaItems.push(r));
    
    const currentProgress = Math.min(85 + Math.round(((i + chunk.length) / targetImages.length) * 10), 98);
    onProgress?.({ status: 'images', progress: currentProgress, message: `Đang tải ảnh: ${Math.min(i + chunk.length, targetImages.length)} / ${targetImages.length} ...` });
  }
  onProgress?.({ status: 'done', progress: 100, message: 'Ho├án tß║Ñt!' });

  return { pages, mediaItems, siteDir };
}

/**
 * Download mß╗Öt asset (CSS/JS) vß╗ü local
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

    // DEEP CSS PARSING (Ng─ân chß║╖n g├úy Font / H├¼nh nß╗ün ß║⌐n / @import)
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
            console.warn(`ΓÜá∩╕Å Cannot download CSS nested asset: ${fullAssetUrl}`);
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
    console.warn(`ΓÜá∩╕Å Failed to download asset: ${url}`);
    return null;
  }
}

/**
 * Helper: Chuyß╗ân URL th├ánh page path
 */
function getPagePath(url, origin) {
  const path = url.replace(origin, '').replace(/\/$/, '') || '/';
  return path.startsWith('/') ? path : '/' + path;
}

/**
 * Helper: Chuyß╗ân path th├ánh filename ─æß╗â l╞░u
 */
function pathToFilename(pagePath) {
  if (pagePath === '/') return 'index.html';
  const cleanStr = pagePath.replace(/^\//, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
  if (cleanStr.match(/\.(php|html|htm)$/i)) return cleanStr;
  return cleanStr + '.html';
}

module.exports = { crawlSite };



