const express = require('express');
const router = express.Router();
const db = require('../config/database');
const path = require('path');
const fs = require('fs');
const { overwriteImage, createThumbnail, getImageMeta } = require('../services/imageService');

/**
 * GET /api/media/:siteId — Get all media for a site
 */
router.get('/:siteId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM media WHERE site_id = ? ORDER BY created_at DESC',
      [req.params.siteId]
    );
    
    const [sites] = await db.execute('SELECT slug FROM sites WHERE id = ?', [req.params.siteId]);
    const slug = sites[0]?.slug || '';
    
    // Thêm URL để preview
    const mediaWithUrls = rows.map(m => ({
      ...m,
      url: `/api/sites/${slug}/images/${m.fixed_name}`,
      thumbnailUrl: `/api/sites/${slug}/images/thumbs/thumb_${m.fixed_name}`
    }));
    
    res.json(mediaWithUrls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/:siteId/upload — Upload và overwrite ảnh theo tên cố định
 */
router.post('/:siteId/upload', async (req, res) => {
  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { fixedName } = req.body;
    if (!fixedName) return res.status(400).json({ error: 'fixedName is required' });

    const [sites] = await db.execute('SELECT slug FROM sites WHERE id = ?', [req.params.siteId]);
    if (!sites.length) return res.status(404).json({ error: 'Site not found' });
    
    const siteDir = path.join(__dirname, '../../uploads/sites', sites[0].slug);
    const imageFile = req.files.image;

    // Overwrite với Sharp (auto-scale theo kích thước cũ)
    const result = await overwriteImage(imageFile.data, fixedName, siteDir);

    // Tạo thumbnail
    await createThumbnail(result.path, path.join(siteDir, 'images', 'thumbs'));

    // Cập nhật DB
    await db.execute(
      `INSERT INTO media (site_id, fixed_name, original_name, file_path, file_type, width, height, file_size)
       VALUES (?, ?, ?, ?, 'image', ?, ?, ?)
       ON DUPLICATE KEY UPDATE original_name = VALUES(original_name), width = VALUES(width), 
       height = VALUES(height), file_size = VALUES(file_size), updated_at = NOW()`,
      [req.params.siteId, fixedName, imageFile.name, result.path, result.width, result.height, result.size]
    );

    res.json({ 
      success: true, 
      fixedName,
      width: result.width,
      height: result.height,
      size: result.size,
      url: `/api/sites/${sites[0].slug}/images/${fixedName}`
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/media/:siteId/:mediaId/alt — Update alt text
 */
router.put('/:siteId/:mediaId/alt', async (req, res) => {
  try {
    const { alt_text } = req.body;
    await db.execute(
      'UPDATE media SET alt_text = ? WHERE id = ? AND site_id = ?',
      [alt_text, req.params.mediaId, req.params.siteId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/media/:siteId/:mediaId — Delete media item
 */
router.delete('/:siteId/:mediaId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM media WHERE id = ? AND site_id = ?',
      [req.params.mediaId, req.params.siteId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Media not found' });

    const media = rows[0];
    
    // Xóa file vật lý
    if (fs.existsSync(media.file_path)) {
      fs.unlinkSync(media.file_path);
    }

    await db.execute('DELETE FROM media WHERE id = ?', [req.params.mediaId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
