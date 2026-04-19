const fs = require('fs');
let content = fs.readFileSync('backend/src/routes/collections.js', 'utf8');

const targetLogic = `    if (fields && fields.length > 0) {
      for (const field of fields) {
        await conn.execute(
          'INSERT INTO collection_fields (collection_id, name, field_key, field_type, is_required) VALUES (?, ?, ?, ?, ?)',
          [collectionId, field.name, field.field_key, field.field_type || 'text', field.is_required ? 1 : 0]
        );
      }
    }`;

const autoDetectLogic = `    let finalFields = fields || [];
    
    // Auto-detect fields ti HTML
    if (template_page_id) {
       const [pages] = await conn.execute('SELECT html_file FROM pages WHERE id = ?', [template_page_id]);
       if (pages.length) {
          const [sites] = await conn.execute('SELECT slug FROM sites WHERE id = ?', [req.params.siteId]);
          const path = require('path');
          const fs = require('fs');
          const cheerio = require('cheerio');
          
          const htmlPath = path.join(__dirname, '../../uploads/sites', sites[0].slug, 'html', pages[0].html_file);
          if (fs.existsSync(htmlPath)) {
              let html = fs.readFileSync(htmlPath, 'utf8');
              const $ = cheerio.load(html);
              const binds = $('[data-cms-bind]');
              const extractedKeys = new Set();
              
              binds.each((i, el) => {
                  const key = $(el).attr('data-cms-bind');
                  if(key && !extractedKeys.has(key)) {
                     extractedKeys.add(key);
                  }
              });
              
              if (extractedKeys.size > 0) {
                 finalFields = []; 
                 extractedKeys.forEach(k => {
                    const type = (k.includes('img') || k.includes('anh') || k.includes('thumbnail') || k.includes('avatar') || k.includes('logo')) ? 'image' : 'text';
                    finalFields.push({
                        name: k.toUpperCase(),
                        field_key: k,
                        field_type: type,
                        is_required: 0
                    });
                 });
              }
          }
       }
    }

    if (finalFields.length > 0) {
      for (const field of finalFields) {
        await conn.execute(
          'INSERT INTO collection_fields (collection_id, name, field_key, field_type, is_required) VALUES (?, ?, ?, ?, ?)',
          [collectionId, field.name, field.field_key, field.field_type || 'text', field.is_required ? 1 : 0]
        );
      }
    }`;

if(!content.includes('finalFields')) {
    content = content.replace(targetLogic, autoDetectLogic);
    fs.writeFileSync('backend/src/routes/collections.js', content);
    console.log("Patched auto-detect fields");
} else {
    console.log("Already patched");
}
