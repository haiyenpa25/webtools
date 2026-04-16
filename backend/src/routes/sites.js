const express = require('express');
const router = express.Router();
const db = require('../config/database');
const path = require('path');
const fs = require('fs');
const { injectContent, injectVisualEditor } = require('../services/schemaService');

/**
 * GET /api/sites — Get all sites with real page count
 */
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT s.id, s.name, s.original_url, s.slug, s.status, s.crawl_progress, s.created_at,
             COUNT(p.id) as page_count
      FROM sites s
      LEFT JOIN pages p ON p.site_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sites/:id — Get site detail
 */
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM sites WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Site not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/sites/:id — Delete site and all its data
 */
router.delete('/:id', async (req, res) => {
  try {
    const [sites] = await db.execute('SELECT * FROM sites WHERE id = ?', [req.params.id]);
    if (!sites.length) return res.status(404).json({ error: 'Site not found' });
    
    const site = sites[0];
    
    // Delete from DB (cascade handled by FK)
    await db.execute('DELETE FROM sites WHERE id = ?', [req.params.id]);
    
    // Delete uploaded files
    const siteDir = path.join(__dirname, '../../uploads/sites', site.slug);
    if (fs.existsSync(siteDir)) {
      fs.rmSync(siteDir, { recursive: true, force: true });
    }
    
    res.json({ message: 'Site deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sites/:id/pages — Get all pages of a site
 */
router.get('/:id/pages', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM pages WHERE site_id = ? ORDER BY is_home DESC, path ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/sites/:siteId/pages/bulk-delete — Xóa nhiều trang cùng lúc
 */
router.delete('/:siteId/pages/bulk-delete', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { pageIds } = req.body;

    if (!pageIds || !Array.isArray(pageIds) || !pageIds.length) {
      return res.status(400).json({ error: 'pageIds không hợp lệ' });
    }

    // Lấy thông tin site để xóa file vật lý
    const [sites] = await db.execute('SELECT slug FROM sites WHERE id = ?', [siteId]);
    const siteSlug = sites.length ? sites[0].slug : null;

    let deleted = 0;
    for (const pageId of pageIds) {
      const [pages] = await db.execute(
        'SELECT * FROM pages WHERE id = ? AND site_id = ? AND is_home = 0',
        [pageId, siteId]
      );
      if (!pages.length) continue; // Bỏ qua homepage hoặc trang không tồn tại

      const page = pages[0];

      // Xóa file HTML vật lý
      if (siteSlug && page.html_file) {
        const htmlPath = path.join(__dirname, '../../uploads/sites', siteSlug, 'html', page.html_file);
        if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
      }

      await db.execute('DELETE FROM pages WHERE id = ? AND site_id = ?', [pageId, siteId]);
      deleted++;
    }

    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/sites/:siteId/pages/:pageId — Xóa một trang (không cho xóa homepage)
 */
router.delete('/:siteId/pages/:pageId', async (req, res) => {
  try {
    const { siteId, pageId } = req.params;

    // Kiểm tra trang tồn tại + không phải homepage
    const [pages] = await db.execute(
      'SELECT * FROM pages WHERE id = ? AND site_id = ?',
      [pageId, siteId]
    );
    if (!pages.length) return res.status(404).json({ error: 'Trang không tồn tại' });
    if (pages[0].is_home) return res.status(400).json({ error: 'Không thể xóa trang chủ (homepage)' });

    const page = pages[0];

    // Xóa file HTML vật lý nếu có
    const [sites] = await db.execute('SELECT slug FROM sites WHERE id = ?', [siteId]);
    if (sites.length && page.html_file) {
      const htmlPath = path.join(__dirname, '../../uploads/sites', sites[0].slug, 'html', page.html_file);
      if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
    }

    // Xóa trong DB (cascade FK tự xử lý schema_fields, seo_meta, i18n_translations)
    await db.execute('DELETE FROM pages WHERE id = ? AND site_id = ?', [pageId, siteId]);

    res.json({ success: true, message: `Đã xóa trang ${page.path}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sites/:siteId/pages/:pageId/fields — Get editable fields for a page
 */
router.get('/:siteId/pages/:pageId/fields', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM schema_fields WHERE site_id = ? AND page_id = ? ORDER BY id ASC',
      [req.params.siteId, req.params.pageId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/sites/:siteId/fields/:fieldId — Update content field
 */
router.put('/:siteId/fields/:fieldId', async (req, res) => {
  try {
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ error: 'value is required' });

    await db.execute(
      'UPDATE schema_fields SET current_value = ?, updated_at = NOW() WHERE site_id = ? AND field_id = ?',
      [value, req.params.siteId, req.params.fieldId]
    );

    res.json({ success: true, fieldId: req.params.fieldId, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sites/:slug/serve/* — Serve page với live content injection
 * Đây là engine chính: đọc HTML từ file, inject nội dung từ DB, trả về
 */
router.get('/:slug/serve/*', async (req, res) => {
  try {
    const { slug } = req.params;
    const pagePath = '/' + (req.params[0] || '');

    // Tìm site
    const [sites] = await db.execute('SELECT * FROM sites WHERE slug = ?', [slug]);
    if (!sites.length) return res.status(404).send('Site not found');
    const site = sites[0];

    // Tìm page theo path, nếu không thấy mới lấy homepage
    const searchPath = (pagePath === '/' || pagePath === '') ? '/' : pagePath.replace(/\/$/, '');
    
    let [pages] = await db.execute(
      'SELECT * FROM pages WHERE site_id = ? AND path = ? LIMIT 1',
      [site.id, searchPath]
    );
    
    // Fallback: lấy homepage nếu không tìm thấy page cụ thể
    if (!pages.length) {
      [pages] = await db.execute(
        'SELECT * FROM pages WHERE site_id = ? AND is_home = 1 LIMIT 1',
        [site.id]
      );
    }
    
    if (!pages.length) return res.status(404).send('Page not found');
    const page = pages[0];

    // Đọc HTML file
    const htmlPath = path.join(__dirname, '../../uploads/sites', slug, 'html', page.html_file);
    if (!fs.existsSync(htmlPath)) return res.status(404).send('HTML file not found');
    let html = fs.readFileSync(htmlPath, 'utf8');

    // Lấy tất cả fields của trang từ DB
    const [fields] = await db.execute(
      'SELECT field_id, field_type, current_value FROM schema_fields WHERE site_id = ? AND page_id = ?',
      [site.id, page.id]
    );

    // Build field map
    const fieldMap = {};
    fields.forEach(f => { fieldMap[f.field_id] = f; });

    // Inject content (thay thế current_value vào HTML)
    html = injectContent(html, fieldMap);

    // Lấy SEO meta cho trang
    const [seoRows] = await db.execute('SELECT * FROM seo_meta WHERE page_id = ?', [page.id]);
    if (seoRows.length) {
      const { updateSeoMeta } = require('../services/schemaService');
      html = updateSeoMeta(html, seoRows[0]);
    }

    // Inject Visual Editor nếu có query param ?edit=true
    if (req.query.edit === 'true') {
      html = injectVisualEditor(html, site.id, page.id);
    }

    // Cho phép embed trong iframe (tắt X-Frame-Options)
    res.removeHeader('X-Frame-Options');
    res.set('Content-Security-Policy', "frame-ancestors 'self' http://localhost:3000");
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error: ' + err.message);
  }
});

/**
 * GET /api/sites/:slug/assets/* — Serve static assets (CSS/JS)
 */
router.get('/:slug/assets/*', (req, res) => {
  const { slug } = req.params;
  const assetPath = req.params[0];
  const filePath = path.join(__dirname, '../../uploads/sites', slug, 'assets', assetPath);
  if (fs.existsSync(filePath)) res.sendFile(filePath);
  else res.status(404).send('Asset not found');
});

/**
 * GET /api/sites/:slug/images/* — Serve image files
 */
router.get('/:slug/images/*', (req, res) => {
  const { slug } = req.params;
  const imagePath = req.params[0];
  const filePath = path.join(__dirname, '../../uploads/sites', slug, 'images', imagePath);
  if (fs.existsSync(filePath)) res.sendFile(filePath);
  else res.status(404).send('Image not found');
});

/**
 * PUT /api/sites/:id — Update site info (rename, etc.)
 */
router.put('/:id', async (req, res) => {
  try {
    const { name } = req.body;
    await db.execute('UPDATE sites SET name = ?, updated_at = NOW() WHERE id = ?', [name, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
