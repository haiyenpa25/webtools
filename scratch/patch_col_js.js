const fs = require('fs');
let content = fs.readFileSync('backend/public/js/collections.js', 'utf8');

const targetMethod = `  showCreateForm() {
     document.getElementById('colCreateModal').style.display = 'flex';
  },`;

const injectionShowCreateForm = `  async showCreateForm() {
     document.getElementById('colCreateModal').style.display = 'flex';
     // Load trang mau de assign template_page_id
     try {
        const resp = await fetch(\`\${API}/sites/\${currentSiteId}/pages\`);
        const pages = await resp.json();
        
        const sel = document.getElementById('colTemplatePage');
        if (sel) {
           sel.innerHTML = '<option value="">-- Không c?n xu?t Trang Chi Ti?t --</option>' + 
                         pages.map(p => \`<option value="\${p.id}">\${p.is_home ? 'Trang Ch?' : p.path} (\${p.html_file})</option>\`).join('');
        }
     } catch(e) {}
  },`;

const targetSave = `const name = document.getElementById('colName').value;
     const slug = document.getElementById('colSlug').value;`;

const injectionSave = `const name = document.getElementById('colName').value;
     const slug = document.getElementById('colSlug').value;
     const templateId = document.getElementById('colTemplatePage') ? document.getElementById('colTemplatePage').value : null;`;

const targetBody = `body: JSON.stringify({ name, slug, fields })`;
const injectionBody = `body: JSON.stringify({ name, slug, template_page_id: templateId, fields })`;

if(!content.includes('colTemplatePage')) {
    content = content.replace(targetMethod, injectionShowCreateForm);
    content = content.replace(targetSave, injectionSave);
    content = content.replace(targetBody, injectionBody);
    fs.writeFileSync('backend/public/js/collections.js', content);
    console.log("Updated collections.js");
} else {
    console.log("collections.js already updated");
}
