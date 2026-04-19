/**
 * history.js — Version History UI
 */
const History = {
  async load() {
    if (!currentSiteId) return;
    const list = document.getElementById('historyList');
    list.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Đang tải lịch sử...</p></div>';

    try {
      const resp = await fetch(`${API}/history/${currentSiteId}`);
      const versions = await resp.json();

      if (!versions.length) {
        list.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.47"/></svg>
            <h3>Chưa có lịch sử</h3>
            <p>Nhấn "Lưu Ngay" để tạo checkpoint đầu tiên</p>
          </div>`;
        return;
      }

      list.innerHTML = versions.map((v, i) => `
        <div class="history-item">
          <div class="history-icon">
            <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.47"/></svg>
          </div>
          <div class="history-info">
            <div class="history-label">${v.label || 'Snapshot không tên'}</div>
            <div class="history-meta">
              📦 ${v.field_count} fields · 
              🕐 ${new Date(v.created_at).toLocaleString('vi-VN')}
              ${i === 0 ? ' · <span style="color:var(--green);font-weight:600">Mới nhất</span>' : ''}
            </div>
          </div>
          <div class="history-actions">
            <button class="btn btn-success btn-sm" onclick="History.rollback(${v.id}, \`${v.label?.replace(/`/g, '\\`')}\`)">
              ↩️ Khôi Phục
            </button>
            <button class="btn btn-danger btn-sm" onclick="History.delete(${v.id})">🗑</button>
          </div>
        </div>`).join('');
    } catch (err) {
      list.innerHTML = `<div class="empty-state"><p>❌ ${err.message}</p></div>`;
    }
  },

  async saveNow() {
    if (!currentSiteId) { Toast.error('Chưa chọn website!'); return; }
    const label = prompt('Nhãn cho checkpoint này:', `Lưu thủ công - ${new Date().toLocaleString('vi-VN')}`);
    if (label === null) return;

    try {
      await fetch(`${API}/history/${currentSiteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label || 'Checkpoint' })
      });
      Toast.success('✅ Đã lưu checkpoint!');
      this.load();
    } catch (err) {
      Toast.error('Lỗi: ' + err.message);
    }
  },

  async rollback(versionId, label) {
    if (!confirm(`Bạn có chắc muốn khôi phục về phiên bản:\n"${label}"?\n\nPhiên bản hiện tại sẽ được lưu tự động trước khi rollback.`)) return;

    try {
      const resp = await fetch(`${API}/history/${currentSiteId}/rollback/${versionId}`, { method: 'POST' });
      const result = await resp.json();
      if (result.error) throw new Error(result.error);

      Toast.success(`✅ Đã khôi phục! ${result.restoredFields} fields được phục hồi.`);
      this.load();
    } catch (err) {
      Toast.error('Lỗi rollback: ' + err.message);
    }
  },

  async delete(versionId) {
    if (!confirm('Xóa version này?')) return;
    try {
      await fetch(`${API}/history/${currentSiteId}/${versionId}`, { method: 'DELETE' });
      Toast.success('Đã xóa!');
      this.load();
    } catch (err) {
      Toast.error('Lỗi: ' + err.message);
    }
  }

  previewDiff(versionId, label) {
    this.rollbackTarget = versionId;
    document.getElementById('diffVersionName').textContent = label;
    document.getElementById('diffContainer').innerHTML = '<div class="loading-state"><div class="spinner"></div><p>�ang ph�n t�ch thay d?i...</p></div>';
    document.getElementById('diffModal').style.display = 'flex';

    fetch(`${API}/history/${currentSiteId}/compare/${versionId}`)
      .then(r => r.json())
      .then(data => {
        if(!data.success) {
           document.getElementById('diffContainer').innerHTML = '<p style="color:red">L?i ph�n t�ch: ' + (data.error||'') + '</p>';
           return;
        }
        if(!data.diff || data.diff.length === 0) {
           document.getElementById('diffContainer').innerHTML = '<div style="padding:40px;text-align:center;color:#64748b"><h3>Kh�ng c� s? kh�c bi?t!</h3><p>Phi�n b?n n�y gi?ng h?t hi?n t?i.</p></div>';
           return;
        }
        
        const html = data.diff.map(d => `
          <div style="background:white; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1); overflow:hidden;">
             <div style="background:#e2e8f0; padding:10px 15px; font-weight:600; font-family:var(--font-mono); font-size:12px; color:#475569;">
               ${d.field_id}
             </div>
             <div style="display:grid; grid-template-columns:1fr 1fr; border-top:1px solid #e2e8f0;">
               <div style="padding:15px; border-right:1px solid #e2e8f0; background:#fef2f2;">
                 <span style="display:block; font-size:11px; font-weight:bold; color:#ef4444; margin-bottom:5px;">SAU KHI KH�I PH?C (QU� KH?)</span>
                 <div style="font-size:13px; color:#1e293b; overflow-wrap:anywhere;">${this.escapeHtml(d.old_value)}</div>
               </div>
               <div style="padding:15px; background:#f0fdf4;">
                 <span style="display:block; font-size:11px; font-weight:bold; color:#22c55e; margin-bottom:5px;">HI?N T?I (B? GHI �� TUONG LAI)</span>
                 <div style="font-size:13px; color:#1e293b; overflow-wrap:anywhere;">${this.escapeHtml(d.new_value)}</div>
               </div>
             </div>
          </div>
        `).join('');
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
    if(!confirm('B?n c� ch?c ch?n mu?n ghi d� HTML hi?n t?i b?ng b?n luu n�y? H�nh d?ng n�y s? t?o 1 b?n backup t? d?ng d? ph�ng h?.')) return;
    
    document.getElementById('diffRestoreBtn').innerHTML = '? �ang kh�i ph?c...';
    try {
      const resp = await fetch(`${API}/history/${currentSiteId}/rollback/${this.rollbackTarget}`, { method: 'POST' });
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
      document.getElementById('diffRestoreBtn').innerHTML = 'Kh�i Ph?c Phi�n B?n N�y';
    }
  },

};
