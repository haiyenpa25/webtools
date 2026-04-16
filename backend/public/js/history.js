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
};
