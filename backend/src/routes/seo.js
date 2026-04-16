const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * GET /api/seo/:siteId — Get all pages SEO
 */
router.get('/:siteId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT sm.*, p.path, p.title as page_title 
       FROM seo_meta sm 
       JOIN pages p ON sm.page_id = p.id 
       WHERE sm.site_id = ? ORDER BY p.is_home DESC, p.path ASC`,
      [req.params.siteId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/seo/:siteId/:pageId — Get SEO for a specific page
 */
router.get('/:siteId/:pageId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM seo_meta WHERE site_id = ? AND page_id = ?',
      [req.params.siteId, req.params.pageId]
    );
    if (!rows.length) return res.status(404).json({ error: 'SEO data not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/seo/:siteId/:pageId — Update SEO meta
 */
router.put('/:siteId/:pageId', async (req, res) => {
  try {
    const { meta_title, meta_description, meta_keywords, og_title, og_description, og_image, robots } = req.body;

    await db.execute(
      `UPDATE seo_meta SET 
        meta_title = COALESCE(?, meta_title),
        meta_description = COALESCE(?, meta_description),
        meta_keywords = COALESCE(?, meta_keywords),
        og_title = COALESCE(?, og_title),
        og_description = COALESCE(?, og_description),
        og_image = COALESCE(?, og_image),
        robots = COALESCE(?, robots),
        updated_at = NOW()
       WHERE site_id = ? AND page_id = ?`,
      [meta_title, meta_description, meta_keywords, og_title, og_description, og_image, robots,
       req.params.siteId, req.params.pageId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
