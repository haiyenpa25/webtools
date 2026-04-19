const fs = require('fs');
let code = fs.readFileSync('backend/src/routes/export.js', 'utf8');

// 1. Add i18nService import
code = code.replace(
  "const { injectContent } = require('../services/schemaService');",
  "const { injectContent } = require('../services/schemaService');\n    const { getSiteLanguages, buildTranslatedHtml } = require('../services/i18nService');"
);

// 2. Wrap loop with Language Map Loop
const oldLoopStart = "    let _extractedHeader = '';\n    let _extractedFooter = '';\n\n    // Add each page HTML (với content đã inject)\n    for (const page of pages) {";
const oldLoopEndRegex = /archive\.append\(finalHtml, \{ name: outputName \}\);\n    \}/;

const newLoopBlock = `    let _extractedHeader = '';
    let _extractedFooter = '';

    const siteLanguages = await getSiteLanguages(site.id);
    if (!siteLanguages.length) {
       siteLanguages.push({ lang_code: 'vi', is_source: 1 });
    }
    const sourceLang = siteLanguages.find(l => l.is_source) || siteLanguages[0];

    // Lặp qua từng ngôn ngữ
    for (const lang of siteLanguages) {
      const isSource = lang.is_source;
      const langPrefix = isSource ? '' : \`\${lang.lang_code}/\`;
      const langBaseUrl = isSource ? defaultBaseUrl : \`\${defaultBaseUrl}\${lang.lang_code}/\`;

      // Add each page HTML
      for (const page of pages) {
        const htmlFilePath = path.join(siteDir, 'html', page.html_file);
        if (!fs.existsSync(htmlFilePath)) continue;

        let html = fs.readFileSync(htmlFilePath, 'utf8');
        
        // Inject current content từ DB
        const pageFields = fieldsByPage[page.id] || {};
        html = injectContent(html, pageFields);

        // Inject I18n Translations
        if (!isSource) {
           html = await buildTranslatedHtml(html, site.id, page.id, lang.lang_code);
        }

        const $ = cheerio.load(html, { decodeEntities: false });

        // EXTRACT LAYOUT (PHP Only)
        if (mode === 'php') {
          const headerEl = $('header').length ? $('header') : ($('nav').length ? $('nav') : null);
          if (headerEl) {
             if (page.is_home && isSource) _extractedHeader = headerEl.prop('outerHTML');
             headerEl.replaceWith(\`<?php require_once "\${isSource ? '' : '../'}header.php"; ?>\`);
          }

          const footerEl = $('footer').length ? $('footer') : null;
          if (footerEl) {
             if (page.is_home && isSource) _extractedFooter = footerEl.prop('outerHTML');
             footerEl.replaceWith(\`<?php require_once "\${isSource ? '' : '../'}footer.php"; ?>\`);
          }
        }

        // Fix internal links and asset paths for static deployment
        $('a[href]').each((i, el) => {
          let href = $(el).attr('href') || '';
          
          // Xử lý Language Switcher Sync
          if ($(el).hasClass('lang-switch') && $(el).attr('data-lang')) {
             const targetLang = $(el).attr('data-lang');
             const isTargetSource = sourceLang.lang_code === targetLang;
             
             let targetRelPath = page.path.replace(/^\\//, '').replace(/\\//g, '_');
             if (page.is_home) targetRelPath = \`index\${mode === 'php' ? '' : '.html'}\`;
             else {
                 const hasExt = targetRelPath.match(/\\.(php|html|htm)$/i);
                 if (!hasExt) targetRelPath += (mode === 'php' ? '' : '.html');
             }
             
             $(el).attr('href', \`<?= BASE_URL ?>\${isTargetSource ? '' : (targetLang + '/')}\${targetRelPath}\`);
             return; 
          }

          // Bắt link local
          if (href.includes('/api/sites/') || href.startsWith(site.original_url) || href.startsWith('/')) {
             let relPath = href.replace(site.original_url, '');
             if (relPath.includes('/serve/')) {
                 relPath = relPath.split('/serve')[1] || '/';
             }
             if (!relPath.startsWith('/')) relPath = '/' + relPath;
             relPath = relPath.split('?')[0].split('#')[0];

             if (relPath === '/' || relPath === '') {
                 const ext = mode === 'php' ? '.php' : '.html';
                 $(el).attr('href', \`<?= BASE_URL ?>\${langPrefix}index\${ext}\`);
             } else {
                 const cleanPath = relPath.replace(/^\\//, '').replace(/\\//g, '_');
                 const hasExt = cleanPath.match(/\\.(php|html|htm)$/i);
                 const ext = mode === 'php' ? '' : '.html';
                 const fixedPath = cleanPath + (hasExt ? '' : ext);
                 
                 $(el).attr('href', \`<?= BASE_URL ?>\${langPrefix}\${fixedPath}\`);
             }
          }
        });

        $('link[rel="stylesheet"]').each((i, el) => {
           let href = $(el).attr('href') || '';
           if (href) {
             const filename = href.split('/').pop().split('?')[0];
             $(el).attr('href', mode === 'php' ? \`<?= BASE_URL ?>assets/css/\${filename}\` : \`\${isSource ? '' : '../'}assets/css/\${filename}\`);
           }
        });

        $('script[src]').each((i, el) => {
           let src = $(el).attr('src') || '';
           if (src) {
             const filename = src.split('/').pop().split('?')[0];
             $(el).attr('src', mode === 'php' ? \`<?= BASE_URL ?>assets/js/\${filename}\` : \`\${isSource ? '' : '../'}assets/js/\${filename}\`);
           }
        });

        $('img[src]').each((i, el) => {
           let src = $(el).attr('src') || '';
           if (src && !src.startsWith('data:')) {
             const filename = src.split('/').pop().split('?')[0];
             const matchedMedia = mediaItems.find(m => m.original_name === filename || m.fixed_name === filename);
             if (matchedMedia && matchedMedia.file_path) {
               const cleanPath = matchedMedia.file_path.replace(/\\\\/g, '/'); 
               let relImagePath = cleanPath;
               if (cleanPath.includes('/images/')) {
                   relImagePath = 'images/' + cleanPath.split('/images/')[1];
               } else if (cleanPath.includes('/assets/')) {
                   relImagePath = 'assets/' + cleanPath.split('/assets/')[1];
               }
               $(el).attr('src', mode === 'php' ? \`<?= BASE_URL ?>\${relImagePath}\` : \`\${isSource ? '' : '../'}\${relImagePath}\`);
             } else {
               const fixedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
               $(el).attr('src', mode === 'php' ? \`<?= BASE_URL ?>images/global/\${fixedName}\` : \`\${isSource ? '' : '../'}images/global/\${fixedName}\`); 
             }
           }
        });

        // Xác định output filename theo Folder
        let outputName;
        if (page.is_home) {
           const ext = mode === 'php' ? '.php' : '.html';
           outputName = \`\${langPrefix}index\${ext}\`;
        } else {
           const cleanPath = page.path.replace(/^\\//, '').replace(/\\//g, '_');
           const hasExt = cleanPath.match(/\\.(php|html|htm)$/i);
           const ext = mode === 'php' ? '.php' : '.html';
           outputName = \`\${langPrefix}\${cleanPath}\${hasExt ? '' : ext}\`;
        }
        
        // Inject Config
        let finalHtml = $.html();
        if (mode === 'php') {
           finalHtml = \`<?php require_once '\${isSource ? '' : '../'}export_config.php'; ?>\\n\` + finalHtml;
        }

        archive.append(finalHtml, { name: outputName });
      }
    }`;

const oldPiece = code.substring(code.indexOf(oldLoopStart), code.search(oldLoopEndRegex) + 64);
code = code.replace(oldPiece, newLoopBlock);

// 3. Append cssAssetsDir
code = code.replace(
  "    const cssDir = path.join(siteDir, 'assets', 'css');",
  "    const cssAssetsDir = path.join(siteDir, 'assets', 'css_assets');\n    if (fs.existsSync(cssAssetsDir)) archive.directory(cssAssetsDir, 'assets/css_assets');\n\n    const cssDir = path.join(siteDir, 'assets', 'css');"
);

fs.writeFileSync('backend/src/routes/export.js', code);
console.log('Patched export.js successfully!');
