require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../config/database');

/**
 * i18n Translation Service
 * Quß║ún l├╜ ─æa ng├┤n ngß╗»: extract ΓåÆ translate ΓåÆ inject ΓåÆ export
 */

const SUPPORTED_LANGUAGES = [
  { code: 'vi', name: 'Tiß║┐ng Viß╗çt',   flag: '≡ƒç╗≡ƒç│', nativeName: 'Vietnamese' },
  { code: 'en', name: 'English',      flag: '≡ƒç║≡ƒç╕', nativeName: 'English' },
  { code: 'ja', name: 'µùÑµ£¼Φ¬₧',         flag: '≡ƒç»≡ƒç╡', nativeName: 'Japanese' },
  { code: 'ko', name: 'φò£Ω╡¡∞û┤',         flag: '≡ƒç░≡ƒç╖', nativeName: 'Korean' },
  { code: 'zh', name: 'Σ╕¡µûç',          flag: '≡ƒç¿≡ƒç│', nativeName: 'Chinese' },
  { code: 'fr', name: 'Fran├ºais',     flag: '≡ƒç½≡ƒç╖', nativeName: 'French' },
  { code: 'de', name: 'Deutsch',      flag: '≡ƒç⌐≡ƒç¬', nativeName: 'German' },
  { code: 'es', name: 'Espa├▒ol',      flag: '≡ƒç¬≡ƒç╕', nativeName: 'Spanish' },
  { code: 'th', name: 'α╕áα╕▓α╕⌐α╕▓α╣äα╕ùα╕ó',      flag: '≡ƒç╣≡ƒç¡', nativeName: 'Thai' },
  { code: 'id', name: 'Bahasa',       flag: '≡ƒç«≡ƒç⌐', nativeName: 'Indonesian' },
];

/**
 * Lß║Ñy danh s├ích ng├┤n ngß╗» hß╗ù trß╗ú
 */
function getSupportedLanguages() {
  return SUPPORTED_LANGUAGES;
}

/**
 * Lß║Ñy ng├┤n ngß╗» ─æ├ú cß║Ñu h├¼nh cho 1 site
 */
async function getSiteLanguages(siteId) {
  const [rows] = await db.execute(
    'SELECT * FROM i18n_languages WHERE site_id = ? ORDER BY is_source DESC, created_at ASC',
    [siteId]
  );
  return rows;
}

/**
 * Th├¬m ng├┤n ngß╗» cho site
 */
async function addLanguage(siteId, langCode, isSource = false) {
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === langCode);
  if (!lang) throw new Error(`Ng├┤n ngß╗» kh├┤ng hß╗ù trß╗ú: ${langCode}`);

  // Nß║┐u set l├ám nguß╗ôn (source), unset c├íc ng├┤n ngß╗» kh├íc
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
 * X├│a ng├┤n ngß╗» khß╗Åi site
 */
async function removeLanguage(siteId, langCode) {
  // Kh├┤ng cho x├│a ng├┤n ngß╗» nguß╗ôn
  const [[lang]] = await db.execute(
    'SELECT * FROM i18n_languages WHERE site_id = ? AND lang_code = ?',
    [siteId, langCode]
  );
  if (lang?.is_source) throw new Error('Kh├┤ng thß╗â x├│a ng├┤n ngß╗» nguß╗ôn. H├úy ─æß║╖t ng├┤n ngß╗» kh├íc l├ám nguß╗ôn tr╞░ß╗¢c.');

  await db.execute(
    'DELETE FROM i18n_languages WHERE site_id = ? AND lang_code = ?',
    [siteId, langCode]
  );

  // X├│a lu├┤n c├íc bß║ún dß╗ïch cß╗ºa ng├┤n ngß╗» n├áy
  await db.execute(
    'DELETE FROM i18n_translations WHERE site_id = ? AND lang_code = ?',
    [siteId, langCode]
  );
}

/**
 * Lß║Ñy tß║Ñt cß║ú fields cß║ºn dß╗ïch (chß╗ë type text v├á html, bß╗Å qua image)
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
 * Lß║Ñy bß║ún dß╗ïch ─æ├ú c├│ cß╗ºa mß╗Öt site + lang
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

  // Build map: field_id ΓåÆ translation record
  const map = {};
  rows.forEach(r => { map[r.field_id] = r; });
  return map;
}

/**
 * L╞░u bß║ún dß╗ïch thß╗º c├┤ng
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
 * Dß╗ïch mß╗Öt ─æoß║ín text qua Google Translate API (miß╗àn ph├¡, kh├┤ng y├¬u cß║ºu API key)
 */
async function translateText(text, fromLang, toLang) {
  if (!text || !text.trim() || text.trim().length < 2) return text;
  if (fromLang === toLang) return text;

  // B? qua text thu?n s? / k² t? d?c bi?t
  if (/^[\d\s\W]+$/.test(text)) return text;

  // 1. TH? D┘NG GEMINI AI N?U C╙ KEY
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const prompt = `Translate the following text to ${toLang}. Ensure technical MEP and engineering terms are translated accurately and contextually. Return ONLY the translated text, no markdown, no conversational filler:\n\n${text}`;
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return response.data.candidates[0].content.parts[0].text.trim();
      }
    } catch (e) {
      console.warn('[GEMINI] D?ch th?t b?i, Fallback sang Google. L?i:', e.message);
    }
  }

  // 2. FALLBACK SANG GOOGLE TRANSLATE MI?N PH═
  const chunk = text.substring(0, 4000); 
  try {
    const response = await axios.get('https://translate.googleapis.com/translate_a/single', {
      params: { client: 'gtx', sl: fromLang, tl: toLang, dt: 't', q: chunk }
    });

    if (response.data && response.data[0]) {
      return response.data[0].map(x => x[0]).join('');
    }
    return text;
  } catch (err) {
    return text;
  }}

/**
 * Auto-translate to├án bß╗Ö fields cß╗ºa site sang 1 ng├┤n ngß╗» ─æ├¡ch
 * C├│ progress callback
 */
async function autoTranslateSite(siteId, fromLang, toLang, onProgress) {
  const fields = await getTranslatableFields(siteId);
  const total = fields.length;
  let done = 0;
  let successCount = 0;
  let skipCount = 0;

  onProgress?.({ progress: 0, total, done: 0, message: `Bß║»t ─æß║ºu dß╗ïch ${total} tr╞░ß╗¥ng v─ân bß║ún...` });

  for (const field of fields) {
    const source = field.current_value?.trim() || '';

    // Bß╗Å qua HTML phß╗⌐c tß║íp (chß╗⌐a nhiß╗üu tags) ΓÇö chß╗ë dß╗ïch text ─æ╞ín giß║ún
    const isComplexHtml = field.field_type === 'html' && (source.match(/<[^>]+>/g) || []).length > 15;
    if (isComplexHtml || !source || source.length < 2) {
      skipCount++;
      done++;
      continue;
    }

    // Bß╗Å qua text ─æ├ú l├á URL hoß║╖c sß╗æ
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
      console.warn(`   ΓÜá∩╕Å Skip field ${field.field_id}: ${err.message}`);
      skipCount++;
    }

    done++;
    const progress = Math.round((done / total) * 100);
    onProgress?.({ progress, total, done, successCount, skipCount, message: `─Éang dß╗ïch... (${done}/${total})` });

    // Delay nhß╗Å ─æß╗â tr├ính spam
    await new Promise(r => setTimeout(r, 50));
  }

  onProgress?.({ progress: 100, total, done, successCount, skipCount, message: `Ho├án tß║Ñt! ─É├ú dß╗ïch ${successCount} tr╞░ß╗¥ng.` });
  return { total, successCount, skipCount };
}

/**
 * Build HTML ─æ├ú ─æ╞░ß╗úc dß╗ïch cho 1 trang + 1 ng├┤n ngß╗»
 */
async function buildTranslatedHtml(html, siteId, pageId, langCode) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // Lß║Ñy tß║Ñt cß║ú bß║ún dß╗ïch cß╗ºa trang n├áy
  const translationMap = await getTranslations(siteId, langCode, pageId);

  // Chß╗ë replace c├íc field c├│ bß║ún dß╗ïch
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

  // Cß║¡p nhß║¡t lang attribute
  $('html').attr('lang', langCode);

  return $.html();
}

/**
 * Lß║Ñy thß╗æng k├¬ dß╗ïch thuß║¡t cß╗ºa 1 site
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


