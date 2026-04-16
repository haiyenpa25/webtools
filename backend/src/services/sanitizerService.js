const cheerio = require('cheerio');
const sanitizeHtml = require('sanitize-html');

/**
 * Danh sách các pattern tracking/quảng cáo cần xóa
 */
const TRACKING_PATTERNS = [
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /facebook\.net/i,
  /fbevents\.js/i,
  /hotjar\.com/i,
  /fullstory\.com/i,
  /intercom\.com/i,
  /hubspot\.com/i,
  /mixpanel\.com/i,
  /segment\.com/i,
  /analytics\.js/i,
  /gtag\(/i,
  /fbq\(/i,
  /_hjSettings/i,
  /dataLayer\.push/i,
  /adsbygoogle/i,
  /doubleclick\.net/i
];

/**
 * Sanitize HTML: Xóa mã độc, tracking scripts, quảng cáo
 */
function sanitizeContent(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  let removedCount = 0;

  // 1. Xóa toàn bộ tracking scripts
  $('script').each((i, el) => {
    const src = $(el).attr('src') || '';
    const content = $(el).html() || '';
    const isTracking = TRACKING_PATTERNS.some(p => p.test(src) || p.test(content));
    if (isTracking) {
      $(el).remove();
      removedCount++;
    }
  });

  // 2. Xóa tracking pixels (img 1x1)
  $('img').each((i, el) => {
    const w = parseInt($(el).attr('width') || '100');
    const h = parseInt($(el).attr('height') || '100');
    if (w <= 1 && h <= 1) {
      $(el).remove();
      removedCount++;
    }
  });

  // 3. Xóa iframe quảng cáo
  $('iframe').each((i, el) => {
    const src = $(el).attr('src') || '';
    const isAd = /doubleclick|adsense|adnxs|googlesyndication/i.test(src);
    if (isAd) {
      $(el).remove();
      removedCount++;
    }
  });

  // 4. Xóa noscript tracking
  $('noscript').each((i, el) => {
    const content = $(el).html() || '';
    const isTracking = TRACKING_PATTERNS.some(p => p.test(content));
    if (isTracking) {
      $(el).remove();
      removedCount++;
    }
  });

  // 5. Xóa meta refresh redirect
  $('meta[http-equiv="refresh"]').remove();

  // 6. Xóa link preconnect tới tracking domains
  $('link[rel="preconnect"], link[rel="dns-prefetch"]').each((i, el) => {
    const href = $(el).attr('href') || '';
    const isTracking = TRACKING_PATTERNS.some(p => p.test(href));
    if (isTracking) $(el).remove();
  });

  return {
    html: $.html(),
    removedCount
  };
}

/**
 * Phát hiện header và footer (phần lặp lại giữa các trang)
 */
function extractComponents(pages) {
  if (!pages || pages.length < 2) return { header: null, footer: null };

  const components = { header: null, footer: null };

  // So sánh header
  const headers = pages.map(html => {
    const $ = cheerio.load(html);
    return $('header').first().html() || $('nav').first().html() || '';
  }).filter(h => h.length > 0);

  if (headers.length > 1 && headers[0] === headers[1]) {
    components.header = headers[0];
  }

  // So sánh footer
  const footers = pages.map(html => {
    const $ = cheerio.load(html);
    return $('footer').last().html() || '';
  }).filter(f => f.length > 0);

  if (footers.length > 1 && footers[0] === footers[1]) {
    components.footer = footers[0];
  }

  return components;
}

/**
 * Phát hiện Global Variables tự động (phone, email, address)
 */
function detectGlobalVars(htmlArray) {
  const patterns = {
    phone: /(\+?[\d\s\-\(\)]{10,})/g,
    email: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  };

  const candidates = {};

  htmlArray.forEach(html => {
    const $ = cheerio.load(html);
    const text = $('body').text();

    // Phones
    const phones = text.match(patterns.phone) || [];
    phones.forEach(p => {
      const clean = p.trim();
      if (clean.length >= 10 && clean.length <= 20) {
        candidates[clean] = (candidates[clean] || 0) + 1;
      }
    });

    // Emails
    const emails = text.match(patterns.email) || [];
    emails.forEach(e => {
      const clean = e.trim().toLowerCase();
      candidates[clean] = (candidates[clean] || 0) + 1;
    });
  });

  // Chỉ lấy những value xuất hiện nhiều lần (global)
  const globalVars = [];
  Object.entries(candidates).forEach(([val, count]) => {
    if (count >= 2) {
      let type = 'text';
      if (/@/.test(val)) type = 'email';
      else if (/^[\d\s\+\-\(\)]+$/.test(val)) type = 'phone';
      globalVars.push({ value: val, type, occurrences: count });
    }
  });

  return globalVars;
}

/**
 * Rewrite URLs trong HTML cho phù hợp với local path
 */
function rewriteUrls(html, originalBaseUrl, siteSlug) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // Rewrite CSS links
  $('link[rel="stylesheet"]').each((i, el) => {
    const href = $(el).attr('href') || '';
    if (href && !href.startsWith('http') && !href.startsWith('//')) {
      $(el).attr('href', `/api/sites/${siteSlug}/assets/${href.replace(/^\//, '')}`);
    }
  });

  // Rewrite script src
  $('script[src]').each((i, el) => {
    const src = $(el).attr('src') || '';
    if (src && !src.startsWith('http') && !src.startsWith('//')) {
      $(el).attr('src', `/api/sites/${siteSlug}/assets/${src.replace(/^\//, '')}`);
    }
  });

  // Rewrite img src (local only)
  $('img').each((i, el) => {
    const src = $(el).attr('src') || '';
    if (src && !src.startsWith('http') && !src.startsWith('//') && !src.startsWith('data:')) {
      $(el).attr('src', `/api/sites/${siteSlug}/assets/${src.replace(/^\//, '')}`);
    }
  });

  return $.html();
}

module.exports = { sanitizeContent, extractComponents, detectGlobalVars, rewriteUrls };
