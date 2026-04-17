require('dotenv').config();
const cheerio = require('cheerio');

/**
 * Auto-detect editable zones trong HTML và tạo schema map
 * Đây là "trái tim" của hệ thống Shadow Mapping
 */
function detectEditableZones(html, pageId, siteId) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const fields = [];
  let counter = 1;

  // Các thẻ text có thể chỉnh sửa
  const TEXT_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'strong', 'em', 'b', 'li', 'td', 'th'];
  const LINK_TAGS = ['a', 'button'];

  // 1. Detect text fields
  TEXT_TAGS.forEach(tag => {
    $(tag).each((index, element) => {
      const el = $(element);
      const textContent = el.text().trim();

      // Bỏ qua nếu quá ngắn, rỗng, hoặc chứa thẻ con phức tạp (ví dụ li chứa ul menu con)
      if (!textContent || textContent.length < 2) return;
      if (el.children('div, p, section, article, ul, ol, nav, menu, table').length > 0) return;

      // Tạo selector duy nhất
      const className = (el.attr('class') || '').split(' ')[0].replace(/[^a-zA-Z0-9_-]/g, '') || '';
      const idAttr = el.attr('id') || '';
      const selector = idAttr ? `#${idAttr}` : (className ? `${tag}.${className}` : tag);
      
      const fieldId = `${tag}_${className || 'text'}_${pageId}_${counter++}`;

      // Kiểm tra xem có HTML con không
      const innerHtml = el.html() || '';
      const hasChildTags = /<[a-z]/i.test(innerHtml);
      const fieldType = hasChildTags ? 'html' : 'text';

      // Gắn data attributes để visual editor nhận diện
      el.attr('data-cms-editable', 'true');
      el.attr('data-cms-field-id', fieldId);
      el.attr('data-cms-type', fieldType);

      fields.push({
        field_id: fieldId,
        field_type: fieldType,
        tag,
        selector,
        original_value: fieldType === 'html' ? innerHtml : textContent,
        current_value: fieldType === 'html' ? innerHtml : textContent,
        site_id: siteId,
        page_id: pageId
      });
    });
  });

  // 2. Detect links (button text + href)
  LINK_TAGS.forEach(tag => {
    $(tag).each((index, element) => {
      const el = $(element);
      const textContent = el.text().trim();
      if (!textContent || textContent.length < 2) return;
      if (el.attr('data-cms-editable')) return; // đã xử lý rồi

      const className = (el.attr('class') || '').split(' ')[0].replace(/[^a-zA-Z0-9_-]/g, '') || '';
      const fieldId = `${tag}_${className || 'link'}_${pageId}_${counter++}`;

      // Giống với thẻ text: Kiểm tra HTML con để tránh vỡ menu khi replace raw text
      const innerHtml = el.html() || '';
      const hasChildTags = /<[a-z]/i.test(innerHtml);
      const fieldType = hasChildTags ? 'html' : 'text';

      el.attr('data-cms-editable', 'true');
      el.attr('data-cms-field-id', fieldId);
      el.attr('data-cms-type', fieldType);

      fields.push({
        field_id: fieldId,
        field_type: fieldType,
        tag,
        selector: tag + (className ? `.${className}` : ''),
        original_value: fieldType === 'html' ? innerHtml : textContent,
        current_value: fieldType === 'html' ? innerHtml : textContent,
        site_id: siteId,
        page_id: pageId
      });
    });
  });

  // 3. Detect images
  $('img').each((index, element) => {
    const el = $(element);
    const src = el.attr('src') || '';
    if (!src || src.startsWith('data:')) return;

    // Tạo fixed name từ filename
    const filename = src.split('/').pop().split('?')[0];
    const fixedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || `image_${counter}`;
    const fieldId = `img_${fixedName.replace(/\.[^.]+$/, '')}_${index}`;

    el.attr('data-cms-editable', 'true');
    el.attr('data-cms-field-id', fieldId);
    el.attr('data-cms-type', 'image');

    fields.push({
      field_id: fieldId,
      field_type: 'image',
      tag: 'img',
      selector: `img[data-cms-field-id="${fieldId}"]`,
      original_value: src,
      current_value: src,
      site_id: siteId,
      page_id: pageId
    });

    counter++;
  });

  return {
    processedHtml: $.html(),
    fields,
    summary: {
      textFields: fields.filter(f => f.field_type === 'text').length,
      htmlFields: fields.filter(f => f.field_type === 'html').length,
      imageFields: fields.filter(f => f.field_type === 'image').length,
      total: fields.length
    }
  };
}

/**
 * Inject CMS content vào HTML khi serve trang (replace data với giá trị từ DB)
 */
function injectContent(html, fieldMap) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $('[data-cms-field-id]').each((i, el) => {
    const fieldId = $(el).attr('data-cms-field-id');
    const field = fieldMap[fieldId];
    if (!field) return;

    const type = $(el).attr('data-cms-type');
    if (type === 'image') {
      $(el).attr('src', field.current_value);
    } else if (type === 'html') {
      $(el).html(field.current_value);
    } else {
      $(el).text(field.current_value);
    }
  });

  return $.html();
}

/**
 * Inject Visual Editor overlay JS vào trang
 */
function injectVisualEditor(html, siteId, pageId) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const port = process.env.PORT || 3000;
  const apiBase = `http://localhost:${port}/api`;
  const staticBase = `http://localhost:${port}`;

  // Xóa <base> tag cũ nếu có (tránh conflict)
  $('base').remove();

  // Inject CSS overlay (dùng absolute URL để chắc hoạt động trong iframe)
  $('head').append(`<link rel="stylesheet" href="${staticBase}/cms-overlay.css">`);

  // Inject Visual Editor script vào cuối body
  $('body').append(`
    <script>
      window.CMS_CONFIG = {
        siteId: ${siteId},
        pageId: ${pageId},
        apiBase: '${apiBase}'
      };
    </script>
    <script src="${staticBase}/cms-visual-editor.js"></script>
  `);

  return $.html();
}

/**
 * Extract SEO meta tags từ HTML
 */
function extractSeoMeta(html) {
  const $ = cheerio.load(html);
  return {
    meta_title: $('title').text() || '',
    meta_description: $('meta[name="description"]').attr('content') || '',
    meta_keywords: $('meta[name="keywords"]').attr('content') || '',
    og_title: $('meta[property="og:title"]').attr('content') || '',
    og_description: $('meta[property="og:description"]').attr('content') || '',
    og_image: $('meta[property="og:image"]').attr('content') || '',
    canonical_url: $('link[rel="canonical"]').attr('href') || '',
    robots: $('meta[name="robots"]').attr('content') || 'index, follow'
  };
}

/**
 * Cập nhật SEO meta trong HTML
 */
function updateSeoMeta(html, seoData) {
  const $ = cheerio.load(html, { decodeEntities: false });

  if (seoData.meta_title) $('title').text(seoData.meta_title);
  if (seoData.meta_description) {
    if ($('meta[name="description"]').length) {
      $('meta[name="description"]').attr('content', seoData.meta_description);
    } else {
      $('head').append(`<meta name="description" content="${seoData.meta_description}">`);
    }
  }

  return $.html();
}

module.exports = {
  detectEditableZones,
  injectContent,
  injectVisualEditor,
  extractSeoMeta,
  updateSeoMeta
};
