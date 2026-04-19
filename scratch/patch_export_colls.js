const fs = require('fs');

let content = fs.readFileSync('backend/src/routes/export.js', 'utf8');

const injection = `
        // --- TR? C?T 4: DYNAMIC COLLECTIONS LIST RENDERING ---
        // Expand any <div data-cms-collection-list="slug">
        const listContainers = $('[data-cms-collection-list]');
        if (listContainers.length > 0) {
            const [collections] = await db.execute('SELECT * FROM collections WHERE site_id = ?', [site.id]);
            const [items] = await db.execute('SELECT * FROM collection_items WHERE site_id = ? ORDER BY created_at DESC', [site.id]);
            
            for (let i = 0; i < listContainers.length; i++) {
                const el = listContainers[i];
                const collSlug = $(el).attr('data-cms-collection-list');
                const coll = collections.find(c => c.slug === collSlug);
                if (!coll) continue;
                
                const cItems = items.filter(it => it.collection_id === coll.id);
                // L?y th? con HTML d?u tiên làm template
                const templateHtml = $(el).children().first().prop('outerHTML');
                if (!templateHtml) continue;
                
                let renderedHtml = '';
                cItems.forEach(item => {
                    const dataObj = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
                    let $_t = cheerio.load(templateHtml, null, false);
                    $_t('[data-cms-bind]').each((j, bindEl) => {
                        const key = $_t(bindEl).attr('data-cms-bind');
                        if (dataObj[key]) {
                            if($_t(bindEl)[0].tagName === 'img') {
                                $_t(bindEl).attr('src', dataObj[key]);
                            } else {
                                $_t(bindEl).html(dataObj[key]);
                            }
                        }
                    });
                    
                    // X? lý link bài vi?t
                    $_t('a[data-cms-item-link]').attr('href', mode === 'php' ? \`<?= BASE_URL ?>\${coll.slug}/\${item.slug}.php\` : \`\${isSource ? '' : '../'}\${coll.slug}/\${item.slug}.html\`);
                    
                    renderedHtml += $_t.html();
                });
                
                $(el).html(renderedHtml);
            }
        }
`;

// Insert the rendering logic after injecting fields but before Layout Extraction
if(!content.includes('data-cms-collection-list')) {
    content = content.replace(
      '// EXTRACT LAYOUT (PHP Only)',
      injection + '\n        // EXTRACT LAYOUT (PHP Only)'
    );
}

const detailInjection = `
        // --- TR? C?T 4: EXPORT TRANG CHI TI?T DYNAMIC ---
        const [collectionsDetail] = await db.execute('SELECT * FROM collections WHERE site_id = ? AND template_page_id IS NOT NULL', [site.id]);
        if (collectionsDetail.length > 0) {
            const [items] = await db.execute('SELECT * FROM collection_items WHERE site_id = ?', [site.id]);
            for (let coll of collectionsDetail) {
                // Determine template HTML path
                const templatePage = pages.find(p => p.id === coll.template_page_id);
                if (!templatePage) continue;
                const htmlFilePath = path.join(siteDir, 'html', templatePage.html_file);
                if (!fs.existsSync(htmlFilePath)) continue;
                let tHtml = fs.readFileSync(htmlFilePath, 'utf8');
                
                // Inject fields
                const pageFields = fieldsByPage[templatePage.id] || {};
                tHtml = injectContent(tHtml, pageFields);
                
                const cItems = items.filter(it => it.collection_id === coll.id);
                for (let item of cItems) {
                    const dataObj = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
                    let $_ = cheerio.load(tHtml, { decodeEntities: false });
                    
                    // Replace values
                    $_('[data-cms-bind]').each((j, bindEl) => {
                        const key = $_(bindEl).attr('data-cms-bind');
                        if (dataObj[key]) {
                            if($_(bindEl)[0].tagName === 'img') {
                                $_(bindEl).attr('src', dataObj[key]);
                            } else {
                                $_(bindEl).html(dataObj[key]);
                            }
                        }
                    });
                    
                    // C?p nh?t meta SEO
                    $_('title').text(item.title);
                    
                    let outHtml = $_.html();
                    if (mode === 'php') {
                       outHtml = \`<?php require_once '\${isSource ? '../' : '../../'}export_config.php'; ?>\\n\` + outHtml;
                    }
                    
                    const outExt = mode === 'php' ? '.php' : '.html';
                    const outPath = \`\${langPrefix}\${coll.slug}/\${item.slug}\${outExt}\`;
                    archive.append(outHtml, { name: outPath });
                }
            }
        }
`;

if(!content.includes('TR? C?T 4: EXPORT TRANG CHI TI?T DYNAMIC')) {
    content = content.replace(
      '// Add layout components & .htaccess',
      detailInjection + '\n    // Add layout components & .htaccess'
    );
    fs.writeFileSync('backend/src/routes/export.js', content);
    console.log("Injected Collection Export logic.");
} else {
    console.log("Collection Export logic already injected.");
}

