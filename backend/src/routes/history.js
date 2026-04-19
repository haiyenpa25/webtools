const express = require('express');
const router = express.Router();
const db = require('../config/database');
const path = require('path');
const fs = require('fs');
const { createVersionSnapshot } = require('./crawler');

/**
 * GET /api/history/:siteId — Get version history
 */
router.get('/:siteId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, label, field_count, created_at FROM versions WHERE site_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.params.siteId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/history/:siteId — Tạo snapshot thủ công (Save checkpoint)
 */
router.post('/:siteId', async (req, res) => {
  try {
    const { label } = req.body;
    await createVersionSnapshot(req.params.siteId, label || `Manual save - ${new Date().toLocaleString('vi-VN')}`);
    res.json({ success: true, message: 'Snapshot created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/history/:siteId/rollback/:versionId — Rollback to a version
 */
router.post('/:siteId/rollback/:versionId', async (req, res) => {
  try {
    // Lấy snapshot
    const [versions] = await db.execute(
      'SELECT * FROM versions WHERE id = ? AND site_id = ?',
      [req.params.versionId, req.params.siteId]
    );
    if (!versions.length) return res.status(404).json({ error: 'Version not found' });

    const version = versions[0];
    if (!fs.existsSync(version.snapshot_path)) {
      return res.status(404).json({ error: 'Snapshot file not found' });
    }

    // Đọc snapshot
    const snapshot = JSON.parse(fs.readFileSync(version.snapshot_path, 'utf8'));

    // Tạo snapshot hiện tại trước khi rollback (để có thể undo)
    await createVersionSnapshot(req.params.siteId, `Before rollback to: ${version.label}`);

    // Restore từng field
    for (const field of snapshot) {
      await db.execute(
        'UPDATE schema_fields SET current_value = ?, updated_at = NOW() WHERE site_id = ? AND field_id = ?',
        [field.current_value, req.params.siteId, field.field_id]
      );
    }

    res.json({ 
      success: true, 
      message: `Rolled back to: ${version.label}`,
      restoredFields: snapshot.length 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/history/:siteId/:versionId — Delete a version
 */
router.delete('/:siteId/:versionId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM versions WHERE id = ? AND site_id = ?',
      [req.params.versionId, req.params.siteId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Version not found' });

    if (fs.existsSync(rows[0].snapshot_path)) {
      fs.unlinkSync(rows[0].snapshot_path);
    }
    await db.execute('DELETE FROM versions WHERE id = ?', [req.params.versionId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * GET /api/history/:siteId/compare/:versionId � Compare current fields with a snapshot
 */
router.get('/:siteId/compare/:versionId', async (req, res) => {
  try {
    const [versions] = await db.execute(
      'SELECT * FROM versions WHERE id = ? AND site_id = ?',
      [req.params.versionId, req.params.siteId]
    );
    if (!versions.length) return res.status(404).json({ error: 'Version not found' });

    const version = versions[0];
    if (!fs.existsSync(version.snapshot_path)) {
      return res.status(404).json({ error: 'Snapshot file not found' });
    }

    const snapshot = JSON.parse(fs.readFileSync(version.snapshot_path, 'utf8'));

    // Get current fields
    const [currentFields] = await db.execute(
      'SELECT field_id, current_value FROM schema_fields WHERE site_id = ?',
      [req.params.siteId]
    );

    // Map current for fast lookup
    const currentMap = {};
    for (const f of currentFields) currentMap[f.field_id] = f.current_value;

    const diff = [];
    for (const oldF of snapshot) {
      const currentVal = currentMap[oldF.field_id] || '';
      if (oldF.current_value !== currentVal) {
        diff.push({
          field_id: oldF.field_id,
          old_value: oldF.current_value,
          new_value: currentVal
        });
      }
    }

    res.json({
      success: true,
      label: version.label,
      diff: diff
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
