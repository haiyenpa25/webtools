const fs = require('fs');
let content = fs.readFileSync('backend/src/routes/sites.js', 'utf8');

const targetRegex = /await fs\.promises\.writeFile\(pagePath, html, 'utf8'\);/g;

// To inject logic right after the file is saved locally.
const syncLogic = `
    await fs.promises.writeFile(pagePath, html, 'utf8');

    // === TR? C?T 1: MASTER COMPONENTS AUTO-SYNC ===
    // 1. Phân tích HTML v?a luu d? tìm Master Components
    const $ = cheerio.load(html);
    const masters = $('[data-cms-master]');
    if (masters.length > 0) {
      // Create master components dictionary
      const masterDict = {};
      masters.each((i, el) => {
         const masterId = $(el).attr('data-cms-master');
         masterDict[masterId] = $(el).prop('outerHTML'); // Capture the exact outer HTML
      });

      // 2. Luu l?i vào kho riêng (Option) ho?c Quét luôn toàn b? site
      const siteDir = path.dirname(pagePath); // Assuming pagePath is in exports/:siteId/ or data/:siteId_pages/
      const exportsDir = path.join(__dirname, '../../exports', req.params.siteId);
      
      if(fs.existsSync(exportsDir)) {
          console.log(\`[MasterSync] B?t d?u d?ng b? \${masters.length} Master Components cho toàn Site\`);
          
          function scanAndSyncDir(dir) {
             const files = fs.readdirSync(dir);
             for(let f of files) {
                const fPath = path.join(dir, f);
                const stat = fs.statSync(fPath);
                
                if (stat.isDirectory()) {
                   scanAndSyncDir(fPath);
                } else if (fPath.endsWith('.html') && fPath !== pagePath) { // B? qua trang hi?n t?i vì v?a luu
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
          scanAndSyncDir(exportsDir);
      }
    }
    // ===============================================
`;

if (!content.includes('MASTER COMPONENTS AUTO-SYNC')) {
    content = content.replace(targetRegex, syncLogic);
    fs.writeFileSync('backend/src/routes/sites.js', content);
    console.log("Injected Master Component Sync Engine.");
} else {
    console.log("Master Sync Engine already injected.");
}
