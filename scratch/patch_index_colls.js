const fs = require('fs');
let content = fs.readFileSync('backend/public/index.html', 'utf8');

const targetLabel = `<label class="form-label">Ðu?ng D?n Slug (VD: san-pham)</label>
                <input type="text" id="colSlug" class="form-input">
              </div>`;
              
const injectionLabel = `<label class="form-label">Ðu?ng D?n Slug (VD: san-pham)</label>
                <input type="text" id="colSlug" class="form-input">
              </div>
              <div class="form-group">
                <label class="form-label">Template HTML (Khuôn dúc chi ti?t)</label>
                <select id="colTemplatePage" class="form-input"></select>
              </div>`;

if(!content.includes('colTemplatePage')) {
    content = content.replace(targetLabel, injectionLabel);
    fs.writeFileSync('backend/public/index.html', content);
    console.log("Updated index.html");
} else {
    console.log("Already updated");
}
