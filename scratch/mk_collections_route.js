const fs = require('fs');
const content = `const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET all collections for a site
router.get('/:siteId', async (req, res) => {
  try {
    const [collections] = await db.query('SELECT * FROM collections WHERE site_id = ?', [req.params.siteId]);
    for(let c of collections) {
      const [fields] = await db.query('SELECT * FROM collection_fields WHERE collection_id = ?', [c.id]);
      c.fields = fields;
    }
    res.json(collections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create a collection
router.post('/:siteId', async (req, res) => {
  const { name, slug, template_page_id, fields } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      'INSERT INTO collections (site_id, name, slug, template_page_id) VALUES (?, ?, ?, ?)',
      [req.params.siteId, name, slug, template_page_id || null]
    );
    const collectionId = result.insertId;

    if (fields && fields.length > 0) {
      for (const field of fields) {
        await conn.execute(
          'INSERT INTO collection_fields (collection_id, name, field_key, field_type, is_required) VALUES (?, ?, ?, ?, ?)',
          [collectionId, field.name, field.field_key, field.field_type || 'text', field.is_required ? 1 : 0]
        );
      }
    }
    await conn.commit();
    res.json({ success: true, id: collectionId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// DELETE a collection
router.delete('/:siteId/:collectionId', async (req, res) => {
  try {
    await db.execute('DELETE FROM collections WHERE id = ? AND site_id = ?', [req.params.collectionId, req.params.siteId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET items for a collection
router.get('/:siteId/:collectionId/items', async (req, res) => {
  try {
    const [items] = await db.query('SELECT * FROM collection_items WHERE collection_id = ? AND site_id = ? ORDER BY created_at DESC', 
      [req.params.collectionId, req.params.siteId]);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create an item
router.post('/:siteId/:collectionId/items', async (req, res) => {
  const { title, slug, data } = req.body;
  try {
    const [result] = await db.execute(
      'INSERT INTO collection_items (collection_id, site_id, title, slug, data) VALUES (?, ?, ?, ?, ?)',
      [req.params.collectionId, req.params.siteId, title, slug, JSON.stringify(data || {})]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update an item
router.put('/:siteId/:collectionId/items/:itemId', async (req, res) => {
  const { title, slug, data } = req.body;
  try {
    await db.execute(
      'UPDATE collection_items SET title = ?, slug = ?, data = ? WHERE id = ? AND collection_id = ? AND site_id = ?',
      [title, slug, JSON.stringify(data || {}), req.params.itemId, req.params.collectionId, req.params.siteId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE an item
router.delete('/:siteId/:collectionId/items/:itemId', async (req, res) => {
  try {
    await db.execute('DELETE FROM collection_items WHERE id = ? AND collection_id = ? AND site_id = ?', 
      [req.params.itemId, req.params.collectionId, req.params.siteId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
`;
fs.writeFileSync('backend/src/routes/collections.js', content);
console.log("Created collections.js");
