const fs = require('fs');
const file = 'backend/src/routes/history.js';
let content = fs.readFileSync(file, 'utf8');

const injection = `
/**
 * GET /api/history/:siteId/compare/:versionId — Compare current fields with a snapshot
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
`;

if (!content.includes('/compare/:versionId')) {
    const marker = "module.exports = router;";
    content = content.replace(marker, injection + "\n" + marker);
    fs.writeFileSync(file, content);
    console.log("Injected compare endpoint.");
} else {
    console.log("Already exists.");
}
