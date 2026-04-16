const express = require('express');
const router = express.Router();
const db = require('../config/database');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const i18n = require('../services/i18nService');
const { injectContent } = require('../services/schemaService');

// In-memory job tracker cho auto-translate
const translateJobs = {};

/**
 * GET /api/i18n/languages/supported — Danh sách ngôn ngữ hỗ trợ
 */
router.get('/languages/supported', (req, res) => {
  res.json(i18n.getSupportedLanguages());
});

/**
 * GET /api/i18n/:siteId/languages — Ngôn ngữ đã cấu hình của site
 */
router.get('/:siteId/languages', async (req, res) => {
  try {
    const langs = await i18n.getSiteLanguages(req.params.siteId);
    res.json(langs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/i18n/:siteId/languages — Thêm ngôn ngữ cho site
 */
router.post('/:siteId/languages', async (req, res) => {
  try {
    const { lang_code, is_source = false } = req.body;
    if (!lang_code) return res.status(400).json({ error: 'lang_code is required' });

    const result = await i18n.addLanguage(req.params.siteId, lang_code, is_source);
    res.json({ success: true, language: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/i18n/:siteId/languages/:code — Xóa ngôn ngữ
 */
router.delete('/:siteId/languages/:code', async (req, res) => {
  try {
    await i18n.removeLanguage(req.params.siteId, req.params.code);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/i18n/:siteId/languages/:code/source — Đặt làm nguồn
 */
router.put('/:siteId/languages/:code/source', async (req, res) => {
  try {
    await db.execute('UPDATE i18n_languages SET is_source = 0 WHERE site_id = ?', [req.params.siteId]);
    await db.execute(
      'UPDATE i18n_languages SET is_source = 1 WHERE site_id = ? AND lang_code = ?',
      [req.params.siteId, req.params.code]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/i18n/:siteId/stats — Thống kê tổng quan
 */
router.get('/:siteId/stats', async (req, res) => {
  try {
    const stats = await i18n.getTranslationStats(req.params.siteId);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/i18n/:siteId/fields — Lấy các trường cần dịch
 * ?lang=vi — kèm theo status bản dịch nếu có
 * ?page_id=1 — filter theo page
 */
router.get('/:siteId/fields', async (req, res) => {
  try {
    const { lang, page_id } = req.query;
    const fields = await i18n.getTranslatableFields(req.params.siteId, page_id || null);

    if (lang) {
      const translationMap = await i18n.getTranslations(req.params.siteId, lang, page_id || null);
      const enriched = fields.map(f => ({
        ...f,
        translation: translationMap[f.field_id] || null
      }));
      return res.json(enriched);
    }

    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/i18n/:siteId/translations — Lưu bản dịch thủ công
 * Body: { field_id, lang_code, value, page_id }
 */
router.put('/:siteId/translations', async (req, res) => {
  try {
    const { field_id, lang_code, value, page_id } = req.body;
    if (!field_id || !lang_code) return res.status(400).json({ error: 'field_id và lang_code là bắt buộc' });

    await i18n.saveTranslation(req.params.siteId, field_id, lang_code, value, page_id, false);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/i18n/:siteId/auto-translate — Khởi động auto-translate job
 * Body: { from_lang, to_lang }
 */
router.post('/:siteId/auto-translate', async (req, res) => {
  const { from_lang, to_lang } = req.body;
  const siteId = req.params.siteId;

  if (!from_lang || !to_lang) return res.status(400).json({ error: 'from_lang và to_lang là bắt buộc' });
  if (from_lang === to_lang) return res.status(400).json({ error: 'Ngôn ngữ nguồn và đích phải khác nhau' });

  const jobId = `translate_${siteId}_${to_lang}_${Date.now()}`;
  translateJobs[jobId] = { progress: 0, status: 'running', message: 'Đang khởi động...', done: 0, total: 0 };

  res.json({ jobId, message: 'Translation job started' });

  // Chạy async
  i18n.autoTranslateSite(siteId, from_lang, to_lang, (data) => {
    translateJobs[jobId] = { ...data, status: data.progress < 100 ? 'running' : 'done', jobId };
  }).then(result => {
    translateJobs[jobId] = { ...translateJobs[jobId], ...result, status: 'done', progress: 100 };
    console.log(`✅ Translation job ${jobId} done:`, result);
  }).catch(err => {
    translateJobs[jobId] = { status: 'error', message: err.message, progress: 0 };
    console.error(`❌ Translation job failed:`, err);
  });
});

/**
 * GET /api/i18n/translate-status/:jobId — Kiểm tra tiến trình dịch
 */
router.get('/translate-status/:jobId', (req, res) => {
  const job = translateJobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job không tồn tại' });
  res.json(job);
});

/**
 * GET /api/i18n/:siteId/preview/:langCode/:pageId — Preview trang đã dịch
 */
router.get('/:siteId/preview/:langCode/:pageId', async (req, res) => {
  try {
    const { siteId, langCode, pageId } = req.params;

    const [sites] = await db.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
    if (!sites.length) return res.status(404).send('Site not found');
    const site = sites[0];

    const [pages] = await db.execute('SELECT * FROM pages WHERE id = ? AND site_id = ?', [pageId, siteId]);
    if (!pages.length) return res.status(404).send('Page not found');
    const page = pages[0];

    const htmlPath = path.join(__dirname, '../../uploads/sites', site.slug, 'html', page.html_file);
    if (!fs.existsSync(htmlPath)) return res.status(404).send('HTML file not found');

    let html = fs.readFileSync(htmlPath, 'utf8');

    // Inject current content từ DB
    const [fields] = await db.execute(
      'SELECT field_id, field_type, current_value FROM schema_fields WHERE site_id = ? AND page_id = ?',
      [siteId, pageId]
    );
    const fieldMap = {};
    fields.forEach(f => { fieldMap[f.field_id] = f; });
    html = injectContent(html, fieldMap);

    // Overlay bản dịch lên trên
    html = await i18n.buildTranslatedHtml(html, siteId, parseInt(pageId), langCode);

    res.removeHeader('X-Frame-Options');
    res.set('Content-Security-Policy', "frame-ancestors 'self' http://localhost:3000");
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).send('Preview error: ' + err.message);
  }
});

/**
 * GET /api/i18n/:siteId/export — Export toàn bộ site đa ngôn ngữ dạng ZIP
 * ?langs=vi,en,ja — xuất theo các ngôn ngữ đã chọn
 */
router.get('/:siteId/export', async (req, res) => {
  try {
    const { langs } = req.query;
    const siteId = req.params.siteId;

    const [sites] = await db.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
    if (!sites.length) return res.status(404).json({ error: 'Site not found' });
    const site = sites[0];

    const siteDir = path.join(__dirname, '../../uploads/sites', site.slug);
    if (!fs.existsSync(siteDir)) return res.status(404).json({ error: 'Site files not found' });

    // Xác định danh sách ngôn ngữ cần export
    const siteLanguages = await i18n.getSiteLanguages(siteId);
    let exportLangs = langs ? langs.split(',') : siteLanguages.map(l => l.lang_code);

    // Lấy ngôn ngữ nguồn
    const sourceLang = siteLanguages.find(l => l.is_source) || siteLanguages[0];

    const [pages] = await db.execute(
      'SELECT * FROM pages WHERE site_id = ? ORDER BY is_home DESC, path ASC',
      [siteId]
    );
    const [allFields] = await db.execute('SELECT * FROM schema_fields WHERE site_id = ?', [siteId]);

    // Build field map
    const fieldsByPage = {};
    allFields.forEach(f => {
      if (!fieldsByPage[f.page_id]) fieldsByPage[f.page_id] = {};
      fieldsByPage[f.page_id][f.field_id] = f;
    });

    const zipFilename = `${site.slug}-multilang-${Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { throw err; });
    archive.pipe(res);

    // Export từng ngôn ngữ vào subfolder /vi/, /en/, /ja/...
    for (const langCode of exportLangs) {
      const langMeta = siteLanguages.find(l => l.lang_code === langCode);
      const isSource = langMeta?.is_source || langCode === sourceLang?.lang_code;

      for (const page of pages) {
        const htmlFilePath = path.join(siteDir, 'html', page.html_file);
        if (!fs.existsSync(htmlFilePath)) continue;

        let html = fs.readFileSync(htmlFilePath, 'utf8');

        // 1. Inject current content (base)
        const pageFields = fieldsByPage[page.id] || {};
        html = injectContent(html, pageFields);

        // 2. Overlay translation (nếu không phải source lang)
        if (!isSource) {
          html = await i18n.buildTranslatedHtml(html, siteId, page.id, langCode);
        }

        // 3. Xác định output path trong ZIP
        const outputName = page.is_home
          ? `${langCode}/index.html`
          : `${langCode}/${page.path.replace(/^\//, '').replace(/\//g, '_')}.html`;

        archive.append(html, { name: outputName });
      }
    }

    // Share assets (CSS, JS, images) - dùng chung cho mọi ngôn ngữ
    const cssDir = path.join(siteDir, 'assets', 'css');
    if (fs.existsSync(cssDir)) archive.directory(cssDir, 'assets/css');

    const jsDir = path.join(siteDir, 'assets', 'js');
    if (fs.existsSync(jsDir)) archive.directory(jsDir, 'assets/js');

    const imagesDir = path.join(siteDir, 'images');
    if (fs.existsSync(imagesDir)) {
      const imgs = fs.readdirSync(imagesDir).filter(f => !fs.statSync(path.join(imagesDir, f)).isDirectory());
      imgs.forEach(img => archive.file(path.join(imagesDir, img), { name: `images/${img}` }));
    }

    // README hướng dẫn deploy
    const langList = exportLangs.map(l => {
      const meta = i18n.getSupportedLanguages().find(s => s.code === l);
      return `  - /${l}/  →  ${meta?.flag || ''} ${meta?.name || l}`;
    }).join('\n');

    const readme = `# ${site.name} — Multilingual Export
    
Site gốc: ${site.original_url}
Ngày xuất: ${new Date().toLocaleString('vi-VN')}
Số trang: ${pages.length}
Ngôn ngữ đã xuất:
${langList}

## Cấu trúc thư mục

\`\`\`
/
├── vi/          ← Tiếng Việt
│   ├── index.html
│   └── ...
├── en/          ← English
│   ├── index.html
│   └── ...
├── ja/          ← 日本語
│   └── ...
├── assets/
│   ├── css/     ← Stylesheets (dùng chung)
│   └── js/      ← Scripts (dùng chung)
└── images/      ← Hình ảnh (dùng chung)
\`\`\`

## Hướng dẫn deploy

### Netlify / Vercel / GitHub Pages
1. Kéo thả thư mục này vào Netlify Drop
2. Xong!

### Apache / Nginx
1. Copy toàn bộ vào thư mục web root
2. Đặt /vi/index.html làm trang mặc định hoặc thêm redirect

Generated by WebTools CMS — i18n Module
`;
    archive.append(readme, { name: 'README.md' });

    await archive.finalize();

  } catch (err) {
    console.error('i18n Export error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
