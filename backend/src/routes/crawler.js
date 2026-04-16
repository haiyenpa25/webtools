const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { crawlSite } = require('../services/crawlerService');
const { detectEditableZones } = require('../services/schemaService');
const { sanitizeContent, detectGlobalVars } = require('../services/sanitizerService');
const { extractSeoMeta } = require('../services/schemaService');
const slugify = require('slugify');
const path = require('path');
const fs = require('fs');

// In-memory job tracker
const crawlJobs = {};

/**
 * POST /api/crawl — Bắt đầu crawl một website mới
 */
router.post('/', async (req, res) => {
  const { url, name, maxPages = 50, waitTime = 1000, excludePaths = [] } = req.body;

  if (!url) return res.status(400).json({ error: 'URL is required' });

  try { new URL(url); } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const siteName = name || new URL(url).hostname;
  const slug = slugify(siteName, { lower: true, strict: true }) + '_' + Date.now();

  const [result] = await db.execute(
    'INSERT INTO sites (name, original_url, slug, status) VALUES (?, ?, ?, ?)',
    [siteName, url, slug, 'pending']
  );
  const siteId = result.insertId;

  const uploadDir = path.join(__dirname, '../../uploads');
  const jobId = `job_${siteId}`;
  crawlJobs[jobId] = { progress: 0, status: 'pending', message: 'Đang khởi tạo...' };

  res.json({ siteId, slug, jobId, message: 'Crawl job started' });

  runCrawlJob(siteId, url, slug, uploadDir, jobId, { maxPages: parseInt(maxPages), waitTime: parseInt(waitTime), excludePaths }).catch(err => {
    console.error('Crawl job failed:', err);
    crawlJobs[jobId] = { progress: 0, status: 'error', message: err.message };
    db.execute('UPDATE sites SET status = ?, error_message = ? WHERE id = ?', ['error', err.message, siteId]).catch(() => {});
  });
});

/**
 * GET /api/crawl/status/:jobId — Lấy trạng thái crawl
 */
router.get('/status/:jobId', (req, res) => {
  const job = crawlJobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

/**
 * Logic crawl chính (chạy async)
 */
async function runCrawlJob(siteId, url, slug, uploadDir, jobId, options = {}) {
  const { maxPages = 50, waitTime = 1000, excludePaths = [] } = options;
  try {
    await db.execute('UPDATE sites SET status = ? WHERE id = ?', ['crawling', siteId]);

    const onProgress = (data) => {
      crawlJobs[jobId] = { ...data, jobId };
      db.execute('UPDATE sites SET crawl_progress = ? WHERE id = ?', [data.progress, siteId]).catch(() => {});
    };

    onProgress({ progress: 5, status: 'crawling', message: `Đang khởi động crawler (tối đa ${maxPages} trang)...` });

    // 1. Crawl website với settings
    const { pages, mediaItems, siteDir } = await crawlSite(url, slug, uploadDir, onProgress, { maxPages, waitTime, excludePaths });

    onProgress({ progress: 88, status: 'processing', message: 'Đang xử lý và lưu dữ liệu...' });

    // 2. Lưu pages vào DB
    const allHtmls = [];
    const insertedPages = [];

    for (const page of pages) {
      const [pageResult] = await db.execute(
        'INSERT INTO pages (site_id, url, path, title, html_file, is_home) VALUES (?, ?, ?, ?, ?, ?)',
        [siteId, page.url, page.path, page.title, page.htmlFile, page.isHome ? 1 : 0]
      );
      const pageId = pageResult.insertId;
      insertedPages.push({ ...page, id: pageId });
      allHtmls.push(page.rawHtml);

      // 3. Auto-detect editable zones cho mỗi trang
      const { processedHtml, fields } = detectEditableZones(page.rawHtml, pageId, siteId);

      // Lưu HTML đã annotated
      const htmlPath = path.join(siteDir, 'html', page.htmlFile);
      fs.writeFileSync(htmlPath, processedHtml, 'utf8');

      // Lưu schema fields vào DB (batch insert)
      for (const field of fields) {
        await db.execute(
          `INSERT INTO schema_fields (site_id, page_id, field_id, field_type, tag, selector, original_value, current_value) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [siteId, pageId, field.field_id, field.field_type, field.tag, field.selector,
           field.original_value?.substring(0, 65535) || '',
           field.current_value?.substring(0, 65535) || '']
        );
      }

      // 4. Extract SEO meta
      const seo = extractSeoMeta(page.rawHtml);
      await db.execute(
        `INSERT INTO seo_meta (site_id, page_id, meta_title, meta_description, meta_keywords, og_title, og_description, og_image, canonical_url, robots)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [siteId, pageId, seo.meta_title, seo.meta_description, seo.meta_keywords,
         seo.og_title, seo.og_description, seo.og_image, seo.canonical_url, seo.robots]
      );
    }

    // 5. Detect Global Variables
    const globalVars = detectGlobalVars(allHtmls);
    for (const gv of globalVars) {
      const label = gv.type === 'email' ? 'Email liên hệ' : gv.type === 'phone' ? 'Số điện thoại' : 'Thông tin chung';
      await db.execute(
        `INSERT IGNORE INTO global_vars (site_id, var_key, var_value, label, var_type, occurrence_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [siteId, `${gv.type}_${Date.now()}`, gv.value, label, gv.type, gv.occurrences]
      ).catch(() => {});
    }

    // 6. Lưu media items
    for (const media of mediaItems) {
      await db.execute(
        `INSERT IGNORE INTO media (site_id, fixed_name, original_name, file_path, file_type, width, height, file_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [siteId, media.fixedName, media.originalUrl?.split('/').pop() || media.fixedName,
         media.path, 'image', media.width || null, media.height || null, media.size || null]
      ).catch(() => {});
    }

    // 7. Cập nhật site status
    await db.execute(
      'UPDATE sites SET status = ?, page_count = ?, crawl_progress = 100 WHERE id = ?',
      ['ready', pages.length, siteId]
    );

    // 8. Tạo initial version snapshot
    await createVersionSnapshot(siteId, 'Initial crawl snapshot');

    crawlJobs[jobId] = { progress: 100, status: 'done', message: 'Hoàn tất!', siteId };
    console.log(`✅ Site ${siteId} crawled successfully: ${pages.length} pages`);

  } catch (err) {
    console.error('❌ Crawl failed:', err);
    await db.execute('UPDATE sites SET status = ?, error_message = ? WHERE id = ?', 
      ['error', err.message, siteId]);
    crawlJobs[jobId] = { progress: 0, status: 'error', message: err.message };
    throw err;
  }
}

async function createVersionSnapshot(siteId, label) {
  const [fields] = await db.execute(
    'SELECT field_id, current_value FROM schema_fields WHERE site_id = ?', [siteId]
  );
  const snapshotData = JSON.stringify(fields);
  const snapshotDir = path.join(__dirname, '../../uploads/snapshots', String(siteId));
  fs.mkdirSync(snapshotDir, { recursive: true });
  const snapshotFile = path.join(snapshotDir, `${Date.now()}.json`);
  fs.writeFileSync(snapshotFile, snapshotData);
  
  await db.execute(
    'INSERT INTO versions (site_id, label, snapshot_path, field_count) VALUES (?, ?, ?, ?)',
    [siteId, label, snapshotFile, fields.length]
  );
}

module.exports = router;
module.exports.createVersionSnapshot = createVersionSnapshot;
