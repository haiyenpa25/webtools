const express = require('express');
const router = express.Router();
const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const { injectContent, extractSeoMeta } = require('../services/schemaService');

// Middleware to authenticate, could add an API key check here if needed

/**
 * GET /api/public/v1/:slug/pages -> Returns all active pages of the site
 */
router.get('/:slug/pages', async (req, res) => {
  try {
    const [sites] = await db.execute('SELECT id, name FROM sites WHERE slug = ?', [req.params.slug]);
    if (!sites.length) return res.status(404).json({ error: 'Site not found' });
    
    const [pages] = await db.execute('SELECT id, path, title, is_home FROM pages WHERE site_id = ?', [sites[0].id]);
    res.json({ site: sites[0].name, pages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/public/v1/:slug/content?path=/index -> Returns structured JSON content for a specific page
 */
router.get('/:slug/content', async (req, res) => {
  try {
    const { slug } = req.params;
    let pagePath = req.query.path || '/';
    if (!pagePath.startsWith('/')) pagePath = '/' + pagePath;

    const [sites] = await db.execute('SELECT id, name FROM sites WHERE slug = ?', [slug]);
    if (!sites.length) return res.status(404).json({ error: 'Site not found' });
    const site = sites[0];

    const searchPath = (pagePath === '/') ? '/' : pagePath.replace(/\/$/, '');
    let [pages] = await db.execute('SELECT * FROM pages WHERE site_id = ? AND path = ? LIMIT 1', [site.id, searchPath]);
    if (!pages.length && pagePath === '/') {
       [pages] = await db.execute('SELECT * FROM pages WHERE site_id = ? AND is_home = 1 LIMIT 1', [site.id]);
    }
    
    if (!pages.length) return res.status(404).json({ error: 'Page not found' });
    const page = pages[0];

    // Read Fields
    const [fields] = await db.execute('SELECT field_id, field_type, current_value FROM schema_fields WHERE site_id = ? AND page_id = ?', [site.id, page.id]);
    
    // Read SEO
    const [seo] = await db.execute('SELECT meta_title, meta_description, meta_keywords, og_image FROM seo_meta WHERE page_id = ?', [page.id]);

    // Structured Output
    res.json({
       path: page.path,
       title: page.title,
       seo: seo.length ? seo[0] : null,
       content: fields.reduce((acc, f) => { acc[f.field_id] = f.current_value; return acc; }, {})
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
