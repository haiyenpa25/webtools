const fs = require('fs');
let content = fs.readFileSync('backend/src/routes/sites.js', 'utf8');

const targetStr = `fs.writeFileSync(htmlPath, html, 'utf8');`;

const syncLogic = `
    fs.writeFileSync(htmlPath, html, 'utf8');

    // === TR? C?T 1: MASTER COMPONENTS AUTO-SYNC ===
    // 1. Phân tích HTML v?a luu d? tìm Master Components
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const masters = $('[data-cms-master]');
    if (masters.length > 0) {
      // Create master components dictionary
      const masterDict = {};
      masters.each((i, el) => {
         const masterId = $(el).attr('data-cms-master');
         masterDict[masterId] = $(el).prop('outerHTML'); // Capture the exact outer HTML
      });

      // 2. Quét kho HTML n?i b? ('uploads/sites/:slug/html')
      const htmlDir = path.join(__dirname, '../../uploads/sites', sites[0].slug, 'html');
      
      if(fs.existsSync(htmlDir)) {
          console.log(\`[MasterSync] B?t d?u d?ng b? \${masters.length} Master Components cho toàn Site\`);
          
          function scanAndSyncDir(dir) {
             const files = fs.readdirSync(dir);
             for(let f of files) {
                const fPath = path.join(dir, f);
                const stat = fs.statSync(fPath);
                
                if (stat.isDirectory()) {
                   scanAndSyncDir(fPath);
                } else if (fPath.endsWith('.html') && fPath !== htmlPath) { // B? qua trang hi?n t?i vì v?a luu
                   let fHtml = fs.readFileSync(fPath, 'utf8');
                   if(fHtml.includes('data-cms-master')) {
                      let $_f = cheerio.load(fHtml);
                      let updatedF = false;
                      $_f('[data-cms-master]').each((i, el) => {
                         const mId = $_f(el).attr('data-cms-master');
                         if(masterDict[mId]) {
                            $_f(el).replaceWith(masterDict[mId]);
                            updatedF = true;
                         }
                      });
                      if(updatedF) {
                         fs.writeFileSync(fPath, $_f.html(), 'utf8');
                         console.log(\`[MasterSync] Ðã ghi dè Component vào \${f}\`);
                      }
                   }
                }
             }
          }
          scanAndSyncDir(htmlDir);
      }
    }
    // ===============================================
`;

if (!content.includes('MASTER COMPONENTS AUTO-SYNC')) {
    content = content.replace(targetStr, syncLogic);
    fs.writeFileSync('backend/src/routes/sites.js', content);
    console.log("Injected Master Component Sync Engine properly!");
} else {
    console.log("Master Sync Engine already injected.");
}
