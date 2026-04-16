const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * GET /api/globals/:siteId — Get all global variables
 */
router.get('/:siteId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM global_vars WHERE site_id = ? ORDER BY occurrence_count DESC',
      [req.params.siteId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/globals/:siteId — Create new global variable
 */
router.post('/:siteId', async (req, res) => {
  try {
    const { var_key, var_value, label, var_type } = req.body;
    if (!var_key || !var_value) return res.status(400).json({ error: 'var_key and var_value required' });

    const [result] = await db.execute(
      'INSERT INTO global_vars (site_id, var_key, var_value, label, var_type) VALUES (?, ?, ?, ?, ?)',
      [req.params.siteId, var_key, var_value, label || var_key, var_type || 'text']
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Variable key already exists' });
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/globals/:siteId/:id — Update global variable
 * Khi cập nhật, tự động find/replace trong tất cả fields chứa giá trị cũ
 */
router.put('/:siteId/:id', async (req, res) => {
  try {
    const { var_value, label } = req.body;
    
    // Lấy giá trị cũ
    const [rows] = await db.execute(
      'SELECT * FROM global_vars WHERE id = ? AND site_id = ?',
      [req.params.id, req.params.siteId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Variable not found' });
    
    const oldValue = rows[0].var_value;
    const newValue = var_value;

    // Update global var
    await db.execute(
      'UPDATE global_vars SET var_value = ?, label = COALESCE(?, label), updated_at = NOW() WHERE id = ?',
      [newValue, label, req.params.id]
    );

    // Auto-propagate: replace trong tất cả schema_fields chứa giá trị cũ
    if (oldValue && newValue && oldValue !== newValue) {
      await db.execute(
        `UPDATE schema_fields 
         SET current_value = REPLACE(current_value, ?, ?), updated_at = NOW()
         WHERE site_id = ? AND current_value LIKE ?`,
        [oldValue, newValue, req.params.siteId, `%${oldValue}%`]
      );
    }

    res.json({ success: true, propagated: oldValue !== newValue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/globals/:siteId/:id
 */
router.delete('/:siteId/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM global_vars WHERE id = ? AND site_id = ?', 
      [req.params.id, req.params.siteId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
