const fs = require('fs');
let content = fs.readFileSync('backend/src/routes/history.js', 'utf8');

const target = `    // Restore tng field
    for (const field of snapshot) {
      await db.execute(
        'UPDATE schema_fields SET current_value = ?, updated_at = NOW() WHERE site_id = ? AND field_id = ?',
        [field.current_value, req.params.siteId, field.field_id]
      );
    }

    res.json({ `;

const injection = `    // Restore tung field
    for (const field of snapshot) {
      await db.execute(
        'UPDATE schema_fields SET current_value = ?, updated_at = NOW() WHERE site_id = ? AND field_id = ?',
        [field.current_value, req.params.siteId, field.field_id]
      );
    }
    
    // === VÁ L?I KI?N TRÚC: Ð?NG B? TH?NG T? DB XU?NG FILE TINH SAU KHI ROLLBACK ===
    const [sites] = await db.execute('SELECT slug FROM sites WHERE id = ?', [req.params.siteId]);
    if (sites.length > 0) {
        const siteSlug = sites[0].slug;
        const [pages] = await db.execute('SELECT * FROM pages WHERE site_id = ?', [req.params.siteId]);
        const [allFields] = await db.execute('SELECT * FROM schema_fields WHERE site_id = ?', [req.params.siteId]);
        
        const fieldsByPage = {};
        allFields.forEach(f => {
           if (!fieldsByPage[f.page_id]) fieldsByPage[f.page_id] = {};
           fieldsByPage[f.page_id][f.field_id] = f;
        });

        const { injectContent } = require('../services/schemaService');
        const path = require('path');
        
        for (const page of pages) {
            const htmlPath = path.join(__dirname, '../../uploads/sites', siteSlug, 'html', page.html_file);
            if (fs.existsSync(htmlPath)) {
                let html = fs.readFileSync(htmlPath, 'utf8');
                let newHtml = injectContent(html, fieldsByPage[page.id] || {});
                fs.writeFileSync(htmlPath, newHtml, 'utf8');
            }
        }
        console.log('[TimeMachine] Da dong bo HTML File theo du lieu cu!');
    }
    // =========================================================================

    res.json({ `;

if (!content.includes('VÁ L?I KI?N TRÚC: Ð?NG B? TH?NG T? DB XU?NG FILE TINH SAU KHI ROLLBACK')) {
    content = content.replace(target, injection);
    fs.writeFileSync('backend/src/routes/history.js', content);
    console.log("Patched TimeMachine Rollback Logic");
} else {
    console.log("Already patched");
}
