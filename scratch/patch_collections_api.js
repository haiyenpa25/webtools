const fs = require('fs');
let content = fs.readFileSync('backend/src/routes/collections.js', 'utf8');

const target1 = `const { name, slug, fields } = req.body;`;
const inject1 = `const { name, slug, template_page_id, fields } = req.body;`;

const target2 = `await db.execute('INSERT INTO collections (site_id, name, slug) VALUES (?, ?, ?)', [siteId, name, slug]);`;
const inject2 = `await db.execute('INSERT INTO collections (site_id, name, slug, template_page_id) VALUES (?, ?, ?, ?)', [siteId, name, slug, template_page_id || null]);`;

if(!content.includes('template_page_id')) {
    content = content.replace(target1, inject1);
    content = content.replace(target2, inject2);
    fs.writeFileSync('backend/src/routes/collections.js', content);
    console.log("Updated collections.js API");
} else {
    console.log("Already updated");
}
