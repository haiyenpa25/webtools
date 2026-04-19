const fs = require('fs');
let code = fs.readFileSync('backend/src/routes/export.js', 'utf8');

const additionalRewriteLogic = `
        // --- FINAL BOSS REWRITES ---
        // 1. Inline Style Background Images
        $('*[style]').each((i, el) => {
           let inlineStyle = $(el).attr('style') || '';
           const match = inlineStyle.match(/url\\(['"]?([^'"()]+)['"]?\\)/i);
           if (match && match[1] && !match[1].startsWith('data:')) {
               const newUrl = getLocalMediaUrl(match[1]);
               const newStyle = inlineStyle.replace(match[0], \`url('\${newUrl}')\`);
               $(el).attr('style', newStyle);
           }
        });

        // 2. Open Graph Meta Tags & Favicons
        $('meta[property="og:image"], meta[name="twitter:image"], meta[itemprop="image"]').each((i, el) => {
            let content = $(el).attr('content');
            if (content && !content.startsWith('data:')) {
                $(el).attr('content', getLocalMediaUrl(content));
            }
        });
        
        $('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]').each((i, el) => {
            let href = $(el).attr('href');
            if (href && !href.startsWith('data:')) {
                $(el).attr('href', getLocalMediaUrl(href));
            }
        });
`;

const anchorPoint = `// Rewrite HTML5 Video and Audio`;
if (code.includes(anchorPoint) && !code.includes('FINAL BOSS REWRITES')) {
    code = code.replace(anchorPoint, additionalRewriteLogic + '\n        ' + anchorPoint);
    fs.writeFileSync('backend/src/routes/export.js', code);
    console.log("Ultimate Patch applied successfully!");
} else {
    console.log("Ultimate Patch failed or already applied!");
}
