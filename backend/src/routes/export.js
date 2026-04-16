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

    // Set response headers for ZIP download
    const zipFilename = `${site.slug}-export-${Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { throw err; });
    archive.pipe(res);

    // Add each page HTML (với content đã inject)
    for (const page of pages) {
      const htmlFilePath = path.join(siteDir, 'html', page.html_file);
      if (!fs.existsSync(htmlFilePath)) continue;

      let html = fs.readFileSync(htmlFilePath, 'utf8');
      
      // Inject current content từ DB
      const pageFields = fieldsByPage[page.id] || {};
      html = injectContent(html, pageFields);

      // Fix internal links and asset paths for static deployment
      const $ = cheerio.load(html, { decodeEntities: false });
      // 1. Rewrite Internal Links
      $('a[href]').each((i, el) => {
        let href = $(el).attr('href') || '';
        // Bắt link local / link api test / link gốc
        if (href.includes('/api/sites/') || href.startsWith(site.original_url) || href.startsWith('/')) {
          let relPath = href.replace(site.original_url, '');
          if (relPath.includes('/serve/')) {
             relPath = relPath.split('/serve')[1] || '/';
          }
          if (!relPath.startsWith('/')) relPath = '/' + relPath;
           
          // Strip queries/hashes
          relPath = relPath.split('?')[0].split('#')[0];

          if (relPath === '/' || relPath === '') {
             $(el).attr('href', 'index.html');
          } else {
             const fixedPath = relPath.replace(/^\//, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9_.-]/g, '') + '.html';
             $(el).attr('href', fixedPath);
          }
        }
      });

      // 2. Rewrite CSS paths
      $('link[rel="stylesheet"]').each((i, el) => {
         let href = $(el).attr('href') || '';
         if (href) {
           const filename = href.split('/').pop().split('?')[0];
           $(el).attr('href', 'assets/css/' + filename);
         }
      });

      // 3. Rewrite JS paths
      $('script[src]').each((i, el) => {
         let src = $(el).attr('src') || '';
         if (src) {
           const filename = src.split('/').pop().split('?')[0];
           $(el).attr('src', 'assets/js/' + filename);
         }
      });

      // 4. Rewrite Images 
      $('img[src]').each((i, el) => {
         let src = $(el).attr('src') || '';
         if (src && !src.startsWith('data:')) {
           const filename = src.split('/').pop().split('?')[0];
           
           // Look for standard mappings from DB
           const matchedMedia = mediaItems.find(m => m.original_name === filename || m.fixed_name === filename);
           if (matchedMedia && matchedMedia.file_path) {
             const ext = filename.split('.').pop();
             const cleanPath = matchedMedia.file_path.replace(/\\/g, '/'); // ensure standard slash
             // media.file_path format: images/global/abc.jpg or images/index/xyz.png
             $(el).attr('src', cleanPath);
           } else {
             // Fallback
             const fixedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
             $(el).attr('src', 'images/global/' + fixedName); // safe fallback assuming global if not found
           }
         }
      });

      // Xác định output filename trong ZIP
      const outputName = page.is_home ? 'index.html' : (page.path.replace(/^\//, '').replace(/\//g, '_') + '.html');
      archive.append($.html(), { name: outputName });
    }

    // Add CSS assets
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
