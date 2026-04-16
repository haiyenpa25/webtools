require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../config/database');

/**
 * i18n Translation Service
 * Quản lý đa ngôn ngữ: extract → translate → inject → export
 */

const SUPPORTED_LANGUAGES = [
  { code: 'vi', name: 'Tiếng Việt',   flag: '🇻🇳', nativeName: 'Vietnamese' },
  { code: 'en', name: 'English',      flag: '🇺🇸', nativeName: 'English' },
  { code: 'ja', name: '日本語',         flag: '🇯🇵', nativeName: 'Japanese' },
  { code: 'ko', name: '한국어',         flag: '🇰🇷', nativeName: 'Korean' },
  { code: 'zh', name: '中文',          flag: '🇨🇳', nativeName: 'Chinese' },
  { code: 'fr', name: 'Français',     flag: '🇫🇷', nativeName: 'French' },
  { code: 'de', name: 'Deutsch',      flag: '🇩🇪', nativeName: 'German' },
  { code: 'es', name: 'Español',      flag: '🇪🇸', nativeName: 'Spanish' },
  { code: 'th', name: 'ภาษาไทย',      flag: '🇹🇭', nativeName: 'Thai' },
  { code: 'id', name: 'Bahasa',       flag: '🇮🇩', nativeName: 'Indonesian' },
];

/**
 * Lấy danh sách ngôn ngữ hỗ trợ
 */
function getSupportedLanguages() {
  return SUPPORTED_LANGUAGES;
}

/**
 * Lấy ngôn ngữ đã cấu hình cho 1 site
 */
async function getSiteLanguages(siteId) {
  const [rows] = await db.execute(
    'SELECT * FROM i18n_languages WHERE site_id = ? ORDER BY is_source DESC, created_at ASC',
    [siteId]
  );
  return rows;
}

/**
 * Thêm ngôn ngữ cho site
 */
async function addLanguage(siteId, langCode, isSource = false) {
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === langCode);
  if (!lang) throw new Error(`Ngôn ngữ không hỗ trợ: ${langCode}`);

  // Nếu set làm nguồn (source), unset các ngôn ngữ khác
  if (isSource) {
    await db.execute('UPDATE i18n_languages SET is_source = 0 WHERE site_id = ?', [siteId]);
  }

  await db.execute(
    `INSERT INTO i18n_languages (site_id, lang_code, lang_name, flag, is_source)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE lang_name = VALUES(lang_name), flag = VALUES(flag), is_source = VALUES(is_source)`,
    [siteId, langCode, lang.name, lang.flag, isSource ? 1 : 0]
  );

  return { code: langCode, name: lang.name, flag: lang.flag, is_source: isSource };
}

/**
 * Xóa ngôn ngữ khỏi site
 */
async function removeLanguage(siteId, langCode) {
  // Không cho xóa ngôn ngữ nguồn
  const [[lang]] = await db.execute(
    'SELECT * FROM i18n_languages WHERE site_id = ? AND lang_code = ?',
    [siteId, langCode]
  );
  if (lang?.is_source) throw new Error('Không thể xóa ngôn ngữ nguồn. Hãy đặt ngôn ngữ khác làm nguồn trước.');

  await db.execute(
    'DELETE FROM i18n_languages WHERE site_id = ? AND lang_code = ?',
    [siteId, langCode]
  );

  // Xóa luôn các bản dịch của ngôn ngữ này
  await db.execute(
    'DELETE FROM i18n_translations WHERE site_id = ? AND lang_code = ?',
    [siteId, langCode]
  );
}

/**
 * Lấy tất cả fields cần dịch (chỉ type text và html, bỏ qua image)
 */
async function getTranslatableFields(siteId, pageId = null) {
  let query = `
    SELECT sf.id, sf.field_id, sf.field_type, sf.tag, sf.selector,
           sf.current_value, sf.page_id,
           p.title as page_title, p.path as page_path
    FROM schema_fields sf
    LEFT JOIN pages p ON p.id = sf.page_id
    WHERE sf.site_id = ?
      AND sf.field_type IN ('text', 'html')
      AND LENGTH(TRIM(sf.current_value)) > 2
  `;
  const params = [siteId];

  if (pageId) {
    query += ' AND sf.page_id = ?';
    params.push(pageId);
  }

  query += ' ORDER BY sf.page_id, sf.id ASC';

  const [rows] = await db.execute(query, params);
  return rows;
}

/**
 * Lấy bản dịch đã có của một site + lang
 */
async function getTranslations(siteId, langCode, pageId = null) {
  let query = `
    SELECT t.field_id, t.lang_code, t.translated_value, t.is_auto, t.is_approved,
           t.updated_at
    FROM i18n_translations t
    WHERE t.site_id = ? AND t.lang_code = ?
  `;
  const params = [siteId, langCode];

  if (pageId) {
    query += ' AND t.page_id = ?';
    params.push(pageId);
  }

  const [rows] = await db.execute(query, params);

  // Build map: field_id → translation record
  const map = {};
  rows.forEach(r => { map[r.field_id] = r; });
  return map;
}

/**
 * Lưu bản dịch thủ công
 */
async function saveTranslation(siteId, fieldId, langCode, translatedValue, pageId, isAuto = false) {
  await db.execute(
    `INSERT INTO i18n_translations (site_id, field_id, lang_code, translated_value, page_id, is_auto, is_approved)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE translated_value = VALUES(translated_value), is_auto = VALUES(is_auto),
                             is_approved = VALUES(is_approved), updated_at = NOW()`,
    [siteId, fieldId, langCode, translatedValue, pageId, isAuto ? 1 : 0, isAuto ? 0 : 1]
  );
}

/**
 * Dịch một đoạn text qua MyMemory API (miễn phí, không cần API key)
 */
async function translateText(text, fromLang, toLang) {
  if (!text || !text.trim() || text.trim().length < 2) return text;
  if (fromLang === toLang) return text;

  // Bỏ qua text thuần số / ký tự đặc biệt
  if (/^[\d\s\W]+$/.test(text)) return text;

  // Giới hạn độ dài (MyMemory max 500 chars)
  const chunk = text.substring(0, 499);

  try {
    const response = await axios.get('https://api.mymemory.translated.net/get', {
      params: {
        q: chunk,
        langpair: `${fromLang}|${toLang}`,
        de: 'webtools@cms.local' // optional email để tráng rate limit
      },
      timeout: 12000
    });

    const data = response.data;
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return data.responseData.translatedText;
    }
    return text; // fallback: trả về text gốc nếu lỗi API
  } catch (err) {
    console.warn(`⚠️ Translate failed (${fromLang}→${toLang}): ${err.message}`);
    return text;
  }
}

/**
 * Auto-translate toàn bộ fields của site sang 1 ngôn ngữ đích
 * Có progress callback
 */
async function autoTranslateSite(siteId, fromLang, toLang, onProgress) {
  const fields = await getTranslatableFields(siteId);
  const total = fields.length;
  let done = 0;
  let successCount = 0;
  let skipCount = 0;

  onProgress?.({ progress: 0, total, done: 0, message: `Bắt đầu dịch ${total} trường văn bản...` });

  for (const field of fields) {
    const source = field.current_value?.trim() || '';

    // Bỏ qua HTML phức tạp (chứa nhiều tags) — chỉ dịch text đơn giản
    const isComplexHtml = field.field_type === 'html' && (source.match(/<[^>]+>/g) || []).length > 6;
    if (isComplexHtml || !source || source.length < 3) {
      skipCount++;
      done++;
      continue;
    }

    // Bỏ qua text đã là URL hoặc số
    if (/^https?:\/\//.test(source) || /^[\d\s.,]+$/.test(source)) {
      skipCount++;
      done++;
      continue;
    }

    try {
      const translated = await translateText(source, fromLang, toLang);

      if (translated && translated !== source) {
        await saveTranslation(siteId, field.field_id, toLang, translated, field.page_id, true);
        successCount++;
      } else {
        skipCount++;
      }
    } catch (err) {
      console.warn(`   ⚠️ Skip field ${field.field_id}: ${err.message}`);
      skipCount++;
    }

    done++;
    const progress = Math.round((done / total) * 100);
    onProgress?.({ progress, total, done, successCount, skipCount, message: `Đang dịch... (${done}/${total})` });

    // Delay nhỏ để tránh rate limit
    await new Promise(r => setTimeout(r, 120));
  }

  onProgress?.({ progress: 100, total, done, successCount, skipCount, message: `Hoàn tất! Đã dịch ${successCount} trường.` });
  return { total, successCount, skipCount };
}

/**
 * Build HTML đã được dịch cho 1 trang + 1 ngôn ngữ
 */
async function buildTranslatedHtml(html, siteId, pageId, langCode) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // Lấy tất cả bản dịch của trang này
  const translationMap = await getTranslations(siteId, langCode, pageId);

  // Chỉ replace các field có bản dịch
  $('[data-cms-field-id]').each((i, el) => {
    const fieldId = $(el).attr('data-cms-field-id');
    const translation = translationMap[fieldId];
    if (!translation?.translated_value) return;

    const type = $(el).attr('data-cms-type');
    if (type === 'html') {
      $(el).html(translation.translated_value);
    } else if (type !== 'image') {
      $(el).text(translation.translated_value);
    }
  });

  // Cập nhật lang attribute
  $('html').attr('lang', langCode);

  return $.html();
}

/**
 * Lấy thống kê dịch thuật của 1 site
 */
async function getTranslationStats(siteId) {
  const [[{ total_fields }]] = await db.execute(
    `SELECT COUNT(*) as total_fields FROM schema_fields
     WHERE site_id = ? AND field_type IN ('text','html') AND LENGTH(TRIM(current_value)) > 2`,
    [siteId]
  );

  const [langs] = await db.execute(
    'SELECT * FROM i18n_languages WHERE site_id = ? ORDER BY is_source DESC',
    [siteId]
  );

  const stats = { total_fields, languages: [] };

  for (const lang of langs) {
    const [[{ translated }]] = await db.execute(
      `SELECT COUNT(*) as translated FROM i18n_translations
       WHERE site_id = ? AND lang_code = ? AND translated_value IS NOT NULL`,
      [siteId, lang.lang_code]
    );
    const [[{ approved }]] = await db.execute(
      `SELECT COUNT(*) as approved FROM i18n_translations
       WHERE site_id = ? AND lang_code = ? AND is_approved = 1`,
      [siteId, lang.lang_code]
    );

    stats.languages.push({
      ...lang,
      translated,
      approved,
      total: total_fields,
      percent: total_fields > 0 ? Math.round((translated / total_fields) * 100) : 0
    });
  }

  return stats;
}

module.exports = {
  getSupportedLanguages,
  getSiteLanguages,
  addLanguage,
  removeLanguage,
  getTranslatableFields,
  getTranslations,
  saveTranslation,
  translateText,
  autoTranslateSite,
  buildTranslatedHtml,
  getTranslationStats
};
