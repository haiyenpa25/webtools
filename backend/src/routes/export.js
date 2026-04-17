const express = require('express');
const router = express.Router();
const db = require('../config/database');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const cheerio = require('cheerio');

/**
 * GET /api/export/:siteId — Export site as ZIP
 * Tạo file ZIP chứa toàn bộ HTML đã inject content + assets
 */
router.get('/:siteId', async (req, res) => {
  try {
    const [sites] = await db.execute('SELECT * FROM sites WHERE id = ?', [req.params.siteId]);
    if (!sites.length) return res.status(404).json({ error: 'Site not found' });
    const site = sites[0];

    const siteDir = path.join(__dirname, '../../uploads/sites', site.slug);
    if (!fs.existsSync(siteDir)) {
      return res.status(404).json({ error: 'Site files not found. Please crawl first.' });
    }

    // Lấy toàn bộ pages + fields
    const [pages] = await db.execute(
      'SELECT * FROM pages WHERE site_id = ? ORDER BY is_home DESC, path ASC',
      [site.id]
    );
    const [allFields] = await db.execute(
      'SELECT * FROM schema_fields WHERE site_id = ?',
      [site.id]
    );
    const [mediaItems] = await db.execute(
      'SELECT original_name, fixed_name, file_path FROM media WHERE site_id = ?',
      [site.id]
    );

    // Build field map theo page
    const fieldsByPage = {};
    allFields.forEach(f => {
      if (!fieldsByPage[f.page_id]) fieldsByPage[f.page_id] = {};
      fieldsByPage[f.page_id][f.field_id] = f;
    });

    const { injectContent } = require('../services/schemaService');
    const { getSiteLanguages, buildTranslatedHtml } = require('../services/i18nService');

    // Set response headers for ZIP download
    const zipFilename = `${site.slug}-export-${Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { throw err; });
    archive.pipe(res);

    const mode = req.query.mode || 'php'; // Tùy chọn 'php' hoặc 'html'
    const defaultBaseUrl = req.query.base_url || `/${site.slug}/`;

    // Khởi tạo Custom Config File (Nếu là PHP)
    if (mode === 'php') {
      const configCode = `<?php\n// Tự động sinh bởi WebTools CMS\n// Cấu hình URL Gốc của thư mục để tránh gãy link tài sản\ndefine('BASE_URL', '${defaultBaseUrl}');\n?>`;
      archive.append(configCode, { name: 'export_config.php' });
    } else {
      // Html config, no-op or generate a simple js config if needed
    }

    let _extractedHeader = '';
    let _extractedFooter = '';

    const siteLanguages = await getSiteLanguages(site.id);
    if (!siteLanguages.length) {
       siteLanguages.push({ lang_code: 'vi', is_source: 1 });
    }
    const sourceLang = siteLanguages.find(l => l.is_source) || siteLanguages[0];

    // Lặp qua từng ngôn ngữ
    for (const lang of siteLanguages) {
      const isSource = lang.is_source;
      const langPrefix = isSource ? '' : `${lang.lang_code}/`;
      const langBaseUrl = isSource ? defaultBaseUrl : `${defaultBaseUrl}${lang.lang_code}/`;

      // Add each page HTML
      for (const page of pages) {
        const htmlFilePath = path.join(siteDir, 'html', page.html_file);
        if (!fs.existsSync(htmlFilePath)) continue;

        let html = fs.readFileSync(htmlFilePath, 'utf8');
        
        // Inject current content từ DB
        const pageFields = fieldsByPage[page.id] || {};
        html = injectContent(html, pageFields);

        // Inject I18n Translations
        if (!isSource) {
           html = await buildTranslatedHtml(html, site.id, page.id, lang.lang_code);
        }

        const $ = cheerio.load(html, { decodeEntities: false });

        // EXTRACT LAYOUT (PHP Only)
        if (mode === 'php') {
          const headerEl = $('header').length ? $('header') : ($('nav').length ? $('nav') : null);
          if (headerEl) {
             if (page.is_home && isSource) _extractedHeader = headerEl.prop('outerHTML');
             headerEl.replaceWith(`<?php require_once "${isSource ? '' : '../'}header.php"; ?>`);
          }

          const footerEl = $('footer').length ? $('footer') : null;
          if (footerEl) {
             if (page.is_home && isSource) _extractedFooter = footerEl.prop('outerHTML');
             footerEl.replaceWith(`<?php require_once "${isSource ? '' : '../'}footer.php"; ?>`);
          }
        }

        // Fix internal links and asset paths for static deployment
        $('a[href]').each((i, el) => {
          let href = $(el).attr('href') || '';
          
          // Xử lý Language Switcher Sync
          if ($(el).hasClass('lang-switch') && $(el).attr('data-lang')) {
             const targetLang = $(el).attr('data-lang');
             const isTargetSource = sourceLang.lang_code === targetLang;
             
             let targetRelPath = page.path.replace(/^\//, '').replace(/\//g, '_');
             if (page.is_home) targetRelPath = `index${mode === 'php' ? '.php' : '.html'}`;
             else {
                 targetRelPath = targetRelPath.replace(/\.(php|html|htm)$/i, '') + (mode === 'php' ? '.php' : '.html');
             }
             
             const targetHref = `${isTargetSource ? '' : (targetLang + '/')}${targetRelPath}`;
             $(el).attr('href', mode === 'php' ? `<?= BASE_URL ?>${targetHref}` : `${isSource ? '' : '../'}${targetHref}`);
             return; 
          }

          // Bắt link local
          if (href.includes('/api/sites/') || href.startsWith(site.original_url) || href.startsWith('/')) {
             let relPath = href.replace(site.original_url, '');
             if (relPath.includes('/serve/')) {
                 relPath = relPath.split('/serve')[1] || '/';
             }
             if (!relPath.startsWith('/')) relPath = '/' + relPath;
             relPath = relPath.split('?')[0].split('#')[0];

             if (relPath === '/' || relPath === '') {
                 const ext = mode === 'php' ? '.php' : '.html';
                 $(el).attr('href', mode === 'php' ? `<?= BASE_URL ?>${langPrefix}index${ext}` : `${isSource ? '' : '../'}${langPrefix}index${ext}`);
             } else {
                 const cleanPath = relPath.replace(/^\//, '').replace(/\//g, '_');
                 const ext = mode === 'php' ? '.php' : '.html';
                 const fixedPath = cleanPath.replace(/\.(php|html|htm)$/i, '') + ext;
                 
                 $(el).attr('href', mode === 'php' ? `<?= BASE_URL ?>${langPrefix}${fixedPath}` : `${isSource ? '' : '../'}${langPrefix}${fixedPath}`);
             }
          }
        });

        $('link[rel="stylesheet"]').each((i, el) => {
           let href = $(el).attr('href') || '';
           if (href) {
             const filename = href.split('/').pop().split('?')[0];
             $(el).attr('href', mode === 'php' ? `<?= BASE_URL ?>assets/css/${filename}` : `${isSource ? '' : '../'}assets/css/${filename}`);
           }
        });

        $('script[src]').each((i, el) => {
           let src = $(el).attr('src') || '';
           if (src) {
             const filename = src.split('/').pop().split('?')[0];
             $(el).attr('src', mode === 'php' ? `<?= BASE_URL ?>assets/js/${filename}` : `${isSource ? '' : '../'}assets/js/${filename}`);
           }
        });


        // Media Helper
        const getLocalMediaUrl = (urlStr) => {
           if (!urlStr || urlStr.startsWith('data:')) return urlStr;
           const filename = urlStr.split('/').pop().split('?')[0];
           
           const matchedMedia = mediaItems.find(m => m.original_name === filename || m.fixed_name === filename);
           if (matchedMedia && matchedMedia.file_path) {
             const cleanPath = matchedMedia.file_path.replace(/\\/g, '/'); 
             let relImagePath = cleanPath;
             if (cleanPath.includes('/images/')) relImagePath = 'images/' + cleanPath.split('/images/')[1];
             else if (cleanPath.includes('/assets/')) relImagePath = 'assets/' + cleanPath.split('/assets/')[1];
             return mode === 'php' ? `<?= BASE_URL ?>${relImagePath}` : `${isSource ? '' : '../'}${relImagePath}`;
           }
           
           // Fallback global media if not found (likely video/audio placed manually or missed)
           const fixedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
           return mode === 'php' ? `<?= BASE_URL ?>images/global/${fixedName}` : `${isSource ? '' : '../'}images/global/${fixedName}`; 
        };

        // Rewrite Images and Srcset
        $('img, source[srcset]').each((i, el) => {
           let src = $(el).attr('src');
           if (src) $(el).attr('src', getLocalMediaUrl(src));
           
           let srcset = $(el).attr('srcset');
           if (srcset) {
              const newSrcset = srcset.split(',').map(part => {
                 const [pUrl, pSize] = part.trim().split(/\s+/);
                 if (!pUrl) return part;
                 return `${getLocalMediaUrl(pUrl)} ${pSize || ''}`.trim();
              }).join(', ');
              $(el).attr('srcset', newSrcset);
           }
        });

        
        // --- FINAL BOSS REWRITES ---
        // 1. Inline Style Background Images
        $('*[style]').each((i, el) => {
           let inlineStyle = $(el).attr('style') || '';
           const match = inlineStyle.match(/url\(['"]?([^'"()]+)['"]?\)/i);
           if (match && match[1] && !match[1].startsWith('data:')) {
               const newUrl = getLocalMediaUrl(match[1]);
               const newStyle = inlineStyle.replace(match[0], `url('${newUrl}')`);
               $(el).attr('style', newStyle);
           }
        });

        // 2. Open Graph Meta Tags & Favicons
        $('meta[property="og:image"], meta[name="twitter:image"], meta[itemprop="image"]').each((i, el) => {
            let content = $(el).attr('content');
            if (content && !content.startsWith('data:')) {
                $(el).attr('content', getLocalMediaUrl(content));
            }
        });
        
        $('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]').each((i, el) => {
            let href = $(el).attr('href');
            if (href && !href.startsWith('data:')) {
                $(el).attr('href', getLocalMediaUrl(href));
            }
        });

        // Rewrite HTML5 Video and Audio
        $('video, audio, source[src]').each((i, el) => {
           let src = $(el).attr('src');
           if (src && !src.startsWith('data:')) {
               const filename = src.split('/').pop().split('?')[0];
               // Video audio assets mapped to assets/media
               $(el).attr('src', mode === 'php' ? `<?= BASE_URL ?>assets/media/${filename}` : `${isSource ? '' : '../'}assets/media/${filename}`);
           }
        });

        // Xác định output filename theo Folder
        let outputName;
        if (page.is_home) {
           const ext = mode === 'php' ? '.php' : '.html';
           outputName = `${langPrefix}index${ext}`;
        } else {
           const cleanPath = page.path.replace(/^\//, '').replace(/\//g, '_');
           const ext = mode === 'php' ? '.php' : '.html';
           outputName = `${langPrefix}${cleanPath.replace(/\.(php|html|htm)$/i, '')}${ext}`;
        }
        
        // Inject Config
        let finalHtml = $.html();
        if (mode === 'php') {
           finalHtml = `<?php require_once '${isSource ? '' : '../'}export_config.php'; ?>\n` + finalHtml;
        }

        archive.append(finalHtml, { name: outputName });
      }
    }

    // Add layout components & .htaccess
    if (mode === 'php') {
      if (_extractedHeader) archive.append(_extractedHeader, { name: 'header.php' });
      if (_extractedFooter) archive.append(_extractedFooter, { name: 'footer.php' });
      
      const htaccess = `RewriteEngine On\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteCond %{REQUEST_FILENAME} !-d\nRewriteRule ^([^\\.]+)$ $1.php [NC,L]\nRewriteRule ^(.*)\\.html$ $1.php [NC,L]`;
      archive.append(htaccess, { name: '.htaccess' });
    }

    // Add CSS assets
    const cssAssetsDir = path.join(siteDir, 'assets', 'css_assets');
    if (fs.existsSync(cssAssetsDir)) archive.directory(cssAssetsDir, 'assets/css_assets');

    const cssDir = path.join(siteDir, 'assets', 'css');
    if (fs.existsSync(cssDir)) {
      archive.directory(cssDir, 'assets/css');
    }

    // Add JS assets
    const jsDir = path.join(siteDir, 'assets', 'js');
    if (fs.existsSync(jsDir)) {
      archive.directory(jsDir, 'assets/js');
    }

    // Add images recursively (ignores root files conceptually if we strict to subdirs, but directory() copies all)
    const imagesDir = path.join(siteDir, 'images');
    if (fs.existsSync(imagesDir)) {
       // We use a custom recursive approach to skip 'thumbs' directory explicitly
       const includeDirectory = (dirPath, zipPath) => {
          if (!fs.existsSync(dirPath)) return;
          const items = fs.readdirSync(dirPath);
          items.forEach(item => {
             if (item === 'thumbs') return; // ignore thumbs
             const fullPath = path.join(dirPath, item);
             const relativeZip = zipPath ? `${zipPath}/${item}` : item;
             if (fs.statSync(fullPath).isDirectory()) {
                includeDirectory(fullPath, relativeZip);
             } else {
                archive.file(fullPath, { name: relativeZip });
             }
          });
       };
       includeDirectory(imagesDir, 'images');
    }

    // Add README
    const readme = `# ${site.name} — Exported by WebTools CMS
    
Original URL: ${site.original_url}
Exported: ${new Date().toLocaleString('vi-VN')}
Pages: ${pages.length}

## Deployment Instructions

### Option A: Upload to any static host (Netlify, GitHub Pages, Vercel)
1. Drag & drop this folder to Netlify Drop
2. Done!

### Option B: Apache/Nginx
1. Copy all files to your web root (htdocs / www / public_html)
2. Done!

### Files
- index.html — Homepage
- *.html — Other pages
- assets/css/ — Stylesheets
- assets/js/ — Scripts  
- images/ — Images

Generated by WebTools CMS — Website Re-generator
`;
    archive.append(readme, { name: 'README.md' });

    await archive.finalize();

  } catch (err) {
    console.error('Export error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

/**
 * GET /api/export/:siteId/preview — Preview export info (không tạo ZIP)
 */
router.get('/:siteId/preview', async (req, res) => {
  try {
    const [sites] = await db.execute('SELECT * FROM sites WHERE id = ?', [req.params.siteId]);
    if (!sites.length) return res.status(404).json({ error: 'Site not found' });
    const site = sites[0];

    const [[pageCount]] = await db.execute('SELECT COUNT(*) as c FROM pages WHERE site_id = ?', [site.id]);
    const [[fieldCount]] = await db.execute('SELECT COUNT(*) as c FROM schema_fields WHERE site_id = ?', [site.id]);
    const [[mediaCount]] = await db.execute('SELECT COUNT(*) as c FROM media WHERE site_id = ?', [site.id]);

    // Tính kích thước ước tính
    const siteDir = path.join(__dirname, '../../uploads/sites', site.slug);
    let totalSize = 0;
    function getDirSize(dir) {
      if (!fs.existsSync(dir)) return;
      fs.readdirSync(dir).forEach(f => {
        const fp = path.join(dir, f);
        if (fs.statSync(fp).isDirectory()) getDirSize(fp);
        else totalSize += fs.statSync(fp).size;
      });
    }
    getDirSize(siteDir);

    res.json({
      site: { name: site.name, url: site.original_url },
      pages: pageCount.c,
      fields: fieldCount.c,
      media: mediaCount.c,
      estimatedSize: Math.round(totalSize / 1024) + 'KB',
      ready: site.status === 'ready'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
