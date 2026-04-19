const fs = require('fs');
const file = 'backend/public/js/cms-visual-editor.js';
let content = fs.readFileSync(file, 'utf8');

const actionPanelOld = `      <button class="cms-action-btn" id="cms-action-duplicate" title="Nhân b?n ph?n t? này">?? Nhân b?n</button>
      <button class="cms-action-btn" id="cms-action-hide" title="?n ph?n t? này kh?i hi?n th?">??? ?n</button>
      <button class="cms-action-btn danger" id="cms-action-delete" title="Xoá ph?n t? này hoàn toàn">??? Xoá</button>`;

const actionPanelNew = `      <button class="cms-action-btn" id="cms-action-rewrite" title="Dùng AI vi?t l?i nguyên kh?i này chu?n SEO">? AI Rewrite</button>
      <button class="cms-action-btn" id="cms-action-duplicate" title="Nhân b?n ph?n t? này">?? Nhân b?n</button>
      <button class="cms-action-btn" id="cms-action-hide" title="?n ph?n t? này kh?i hi?n th?">??? ?n</button>
      <button class="cms-action-btn danger" id="cms-action-delete" title="Xoá ph?n t? này hoàn toàn">??? Xoá</button>`;

content = content.replace(actionPanelOld, actionPanelNew);

const logicOld = "document.getElementById('cms-action-duplicate').addEventListener('click', (e) => {";

const logicNew = `    // Logic AI Rewrite
    document.getElementById('cms-action-rewrite').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!state.currentStructTarget) return;

        // Overlay loading
        const btn = document.getElementById('cms-action-rewrite');
        btn.innerHTML = '? Ðang vi?t...';
        btn.disabled = true;

        try {
            const htmlToRewrite = state.currentStructTarget.innerHTML;

            const response = await fetch(\`/api/sites/\${window.CMS_CONFIG.siteId}/pages/\${window.CMS_CONFIG.pageId}/ai-rewrite\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html: htmlToRewrite })
            });

            const data = await response.json();
            if (data.success && data.html) {
                state.currentStructTarget.innerHTML = data.html;
                structPanel.style.display = 'none';
                state.currentStructTarget.classList.remove('cms-block-active');
                state.currentStructTarget = null;
                alert('? AI dã vi?t l?i và gi? nguyên c?u trúc thành công! Hãy b?m Luu Mã Ngu?n d? ghi dè.');
            } else {
                alert('L?i AI Rewrite: ' + (data.error || 'Server không ph?n h?i n?i dung.'));
            }
        } catch (err) {
            alert('L?i k? thu?t khi g?i AI.');
        } finally {
            btn.innerHTML = '? AI Rewrite';
            btn.disabled = false;
        }
    });

    document.getElementById('cms-action-duplicate').addEventListener('click', (e) => {`;

content = content.replace(logicOld, logicNew);

fs.writeFileSync(file, content);
console.log("Updated CMS visual editor!");
