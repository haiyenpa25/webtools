const fs = require('fs');
let js = fs.readFileSync('backend/public/js/history.js', 'utf8');

const injection = `
  previewDiff(versionId, label) {
    this.rollbackTarget = versionId;
    document.getElementById('diffVersionName').textContent = label;
    document.getElementById('diffContainer').innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Ðang phân tích thay d?i...</p></div>';
    document.getElementById('diffModal').style.display = 'flex';

    fetch(\`\${API}/history/\${currentSiteId}/compare/\${versionId}\`)
      .then(r => r.json())
      .then(data => {
        if(!data.success) {
           document.getElementById('diffContainer').innerHTML = '<p style="color:red">L?i phân tích: ' + (data.error||'') + '</p>';
           return;
        }
        if(!data.diff || data.diff.length === 0) {
           document.getElementById('diffContainer').innerHTML = '<div style="padding:40px;text-align:center;color:#64748b"><h3>Không có s? khác bi?t!</h3><p>Phiên b?n này gi?ng h?t hi?n t?i.</p></div>';
           return;
        }
        
        const html = data.diff.map(d => \`
          <div style="background:white; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1); overflow:hidden;">
             <div style="background:#e2e8f0; padding:10px 15px; font-weight:600; font-family:var(--font-mono); font-size:12px; color:#475569;">
               \${d.field_id}
             </div>
             <div style="display:grid; grid-template-columns:1fr 1fr; border-top:1px solid #e2e8f0;">
               <div style="padding:15px; border-right:1px solid #e2e8f0; background:#fef2f2;">
                 <span style="display:block; font-size:11px; font-weight:bold; color:#ef4444; margin-bottom:5px;">SAU KHI KHÔI PH?C (QUÁ KH?)</span>
                 <div style="font-size:13px; color:#1e293b; overflow-wrap:anywhere;">\${this.escapeHtml(d.old_value)}</div>
               </div>
               <div style="padding:15px; background:#f0fdf4;">
                 <span style="display:block; font-size:11px; font-weight:bold; color:#22c55e; margin-bottom:5px;">HI?N T?I (B? GHI ÐÈ TUONG LAI)</span>
                 <div style="font-size:13px; color:#1e293b; overflow-wrap:anywhere;">\${this.escapeHtml(d.new_value)}</div>
               </div>
             </div>
          </div>
        \`).join('');
        document.getElementById('diffContainer').innerHTML = html;
      })
      .catch(e => {
        document.getElementById('diffContainer').innerHTML = '<p style="color:red">L?i m?ng.</p>';
      });
  },

  escapeHtml(text) {
    if (!text) return '(tr?ng)';
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
  },

  closeDiff() {
    document.getElementById('diffModal').style.display = 'none';
    this.rollbackTarget = null;
  },

  async executeRollback() {
    if(!this.rollbackTarget) return;
    if(!confirm('B?n có ch?c ch?n mu?n ghi dè HTML hi?n t?i b?ng b?n luu này? Hành d?ng này s? t?o 1 b?n backup t? d?ng d? phòng h?.')) return;
    
    document.getElementById('diffRestoreBtn').innerHTML = '? Ðang khôi ph?c...';
    try {
      const resp = await fetch(\`\${API}/history/\${currentSiteId}/rollback/\${this.rollbackTarget}\`, { method: 'POST' });
      const data = await resp.json();

      if (data.success) {
        Toast.success(data.message);
        this.closeDiff();
        this.load();
      } else {
        Toast.error(data.error);
      }
    } catch (err) {
      Toast.error('L?i k? thu?t.');
    } finally {
      document.getElementById('diffRestoreBtn').innerHTML = 'Khôi Ph?c Phiên B?n Này';
    }
  },
`;

if(!js.includes('previewDiff(')) {
    // Escape the interpolations inside the template literal replacing function
    js = js.replace(/onclick="History\.rollback\('\${v\.id}'\)"/g, `onclick="History.previewDiff('\${v.id}', '\${v.label}')"`);
    
    const endBrace = js.lastIndexOf('}');
    js = js.substring(0, endBrace) + injection + "\n" + js.substring(endBrace);
    fs.writeFileSync('backend/public/js/history.js', js);
    console.log("Injected Diff logic.");
} else {
    console.log("Diff logic already injected.");
}
