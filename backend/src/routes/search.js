const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * GET /api/search/:siteId?q=keyword — Tìm kiếm trong tất cả fields
 */
router.get('/:siteId', async (req, res) => {
  try {
    const { q, type, pageId } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    let sql = `
      SELECT sf.*, p.path as page_path, p.title as page_title
      FROM schema_fields sf
      LEFT JOIN pages p ON sf.page_id = p.id
      WHERE sf.site_id = ?
        AND (sf.current_value LIKE ? OR sf.original_value LIKE ?)
    `;
    const params = [req.params.siteId, `%${q}%`, `%${q}%`];

    if (type) { sql += ' AND sf.field_type = ?'; params.push(type); }
    if (pageId) { sql += ' AND sf.page_id = ?'; params.push(pageId); }

    sql += ' ORDER BY p.is_home DESC, sf.field_type ASC LIMIT 100';

    const [rows] = await db.execute(sql, params);
    res.json({
      query: q,
      count: rows.length,
      results: rows.map(r => ({
        fieldId: r.field_id,
        fieldType: r.field_type,
        pageId: r.page_id,
        pagePath: r.page_path,
        pageTitle: r.page_title,
        siteId: r.site_id,
        match: r.current_value?.substring(0, 200),
        currentValue: r.current_value,
        tag: r.tag
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/search/:siteId/replace — Tìm & thay thế hàng loạt
 * Body: { find, replace, fieldType?, pageId? }
 */
router.put('/:siteId/replace', async (req, res) => {
  try {
    const { find, replace, fieldType, pageId } = req.body;
    if (!find) return res.status(400).json({ error: 'find is required' });

    let sql = `
      UPDATE schema_fields 
      SET current_value = REPLACE(current_value, ?, ?), updated_at = NOW()
      WHERE site_id = ? AND current_value LIKE ?
    `;
    const params = [find, replace || '', req.params.siteId, `%${find}%`];

    if (fieldType) { sql += ' AND field_type = ?'; params.push(fieldType); }
    if (pageId) { sql += ' AND page_id = ?'; params.push(pageId); }

    const [result] = await db.execute(sql, params);

    res.json({
      success: true,
      affectedRows: result.affectedRows,
      message: `Đã thay thế trong ${result.affectedRows} fields`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
