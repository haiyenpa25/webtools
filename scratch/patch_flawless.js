const fs = require('fs');
let code = fs.readFileSync('backend/src/routes/export.js', 'utf8');

// 1. htaccess fix
code = code.replace(
  "RewriteRule ^([^\\\\.]+)$ $1.php [NC,L]",
  "RewriteRule ^([^\\\\.]+)$ $1.php [NC,L]\\nRewriteRule ^(.*)\\\\.html$ $1.php [NC,L]"
);

// 2. Srcset and media rewrite snippet
const newMediaRewriter = `
        // Media Helper
        const getLocalMediaUrl = (urlStr) => {
           if (!urlStr || urlStr.startsWith('data:')) return urlStr;
           const filename = urlStr.split('/').pop().split('?')[0];
           
           const matchedMedia = mediaItems.find(m => m.original_name === filename || m.fixed_name === filename);
           if (matchedMedia && matchedMedia.file_path) {
             const cleanPath = matchedMedia.file_path.replace(/\\\\/g, '/'); 
             let relImagePath = cleanPath;
             if (cleanPath.includes('/images/')) relImagePath = 'images/' + cleanPath.split('/images/')[1];
             else if (cleanPath.includes('/assets/')) relImagePath = 'assets/' + cleanPath.split('/assets/')[1];
             return mode === 'php' ? \`<?= BASE_URL ?>\${relImagePath}\` : \`\${isSource ? '' : '../'}\${relImagePath}\`;
           }
           
           // Fallback global media if not found (likely video/audio placed manually or missed)
           const fixedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
           return mode === 'php' ? \`<?= BASE_URL ?>images/global/\${fixedName}\` : \`\${isSource ? '' : '../'}images/global/\${fixedName}\`; 
        };

        // Rewrite Images and Srcset
        $('img, source[srcset]').each((i, el) => {
           let src = $(el).attr('src');
           if (src) $(el).attr('src', getLocalMediaUrl(src));
           
           let srcset = $(el).attr('srcset');
           if (srcset) {
              const newSrcset = srcset.split(',').map(part => {
                 const [pUrl, pSize] = part.trim().split(/\\s+/);
                 if (!pUrl) return part;
                 return \`\${getLocalMediaUrl(pUrl)} \${pSize || ''}\`.trim();
              }).join(', ');
              $(el).attr('srcset', newSrcset);
           }
        });

        // Rewrite HTML5 Video and Audio
        $('video, audio, source[src]').each((i, el) => {
           let src = $(el).attr('src');
           if (src && !src.startsWith('data:')) {
               const filename = src.split('/').pop().split('?')[0];
               // Video audio assets mapped to assets/media
               $(el).attr('src', mode === 'php' ? \`<?= BASE_URL ?>assets/media/\${filename}\` : \`\${isSource ? '' : '../'}assets/media/\${filename}\`);
           }
        });
`;

let oldImageRewriterStr = `        $('img[src]').each((i, el) => {
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
        });`;

// Because Regex matching multiline is brittle, I use indexOf + substring
const idxStart = code.indexOf(`        $('img[src]').each((i, el) => {`);
const idxEnd = code.indexOf(`// Xác định output filename theo Folder`);

if (idxStart !== -1 && idxEnd !== -1) {
   const oldCodeBlock = code.substring(idxStart, idxEnd);
   code = code.replace(oldCodeBlock, newMediaRewriter + '\n        ');
}

fs.writeFileSync('backend/src/routes/export.js', code);
console.log("export.js patched successfully for flawless update.");
