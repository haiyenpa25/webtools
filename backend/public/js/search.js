/**
 * search.js — Search & Replace UI
 */
const Search = {
  _debounceTimer: null,
  _replaceVisible: false,

  debounce(value) {
    clearTimeout(this._debounceTimer);
    if (value.length < 2) {
      document.getElementById('searchResults').innerHTML = '';
      return;
    }
    this._debounceTimer = setTimeout(() => this.run(), 600);
  },

  async run() {
    if (!currentSiteId) { Toast.error('Chưa chọn website!'); return; }
    const q = document.getElementById('searchQuery').value.trim();
    if (!q || q.length < 2) { Toast.info('Nhập ít nhất 2 ký tự'); return; }

    const type = document.getElementById('searchTypeFilter').value;
    const container = document.getElementById('searchResults');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Đang tìm kiếm...</p></div>';

    try {
      let url = `${API}/search/${currentSiteId}?q=${encodeURIComponent(q)}`;
      if (type) url += `&type=${type}`;

      const resp = await fetch(url);
      const data = await resp.json();

      if (data.error) throw new Error(data.error);

      if (!data.count) {
        container.innerHTML = `<div class="empty-state"><h3>Không tìm thấy kết quả nào</h3><p>Thử từ khóa khác hoặc bỏ bộ lọc loại</p></div>`;
        return;
      }

      // Group by page
      const byPage = {};
      data.results.forEach(r => {
        const key = r.pagePath || '/';
        if (!byPage[key]) byPage[key] = [];
        byPage[key].push(r);
      });

      const typeColors = { text: '#8b84ff', html: '#4fc3f7', image: '#22c55e' };
      container.innerHTML = `
        <div style="margin-bottom:16px;color:var(--text-muted);font-size:13px">
          Tìm thấy <strong style="color:var(--accent)">${data.count}</strong> kết quả cho "<strong>${q}</strong>"
        </div>
        ${Object.entries(byPage).map(([pagePath, results]) => `
          <div class="form-card" style="margin-bottom:16px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)">
              <code style="color:var(--accent);font-size:13px">${pagePath}</code>
              <span style="color:var(--text-muted);font-size:12px">${results[0].pageTitle || ''}</span>
              <span class="page-badge" style="margin-left:auto">${results.length} kết quả</span>
            </div>
            ${results.map(r => `
              <div style="padding:10px;background:var(--bg-secondary);border-radius:8px;margin-bottom:8px;border-left:3px solid ${typeColors[r.fieldType] || '#888'}">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:${typeColors[r.fieldType] || '#888'}">${r.tag || r.fieldType}</span>
                  <button class="btn btn-ghost btn-sm" onclick="Search.quickEdit('${r.fieldId}', ${r.siteId}, ${r.pageId}, \`${(r.currentValue || '').replace(/`/g, '\\`').substring(0, 100)}\`)" style="font-size:11px;padding:2px 8px">
                    ✏️ Sửa
                  </button>
                </div>
                <div style="font-size:12px;color:var(--text-main);line-height:1.5;word-break:break-word">
                  ${this.highlight(r.match || '', q)}
                </div>
              </div>
            `).join('')}
          </div>
        `).join('')}
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p>❌ ${err.message}</p></div>`;
    }
  },

  highlight(text, query) {
    if (!text || !query) return text;
    const safe = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return safe.replace(regex, match => `<mark style="background:rgba(139,132,255,0.3);color:var(--accent);border-radius:3px;padding:0 2px">${match}</mark>`);
  },

  showReplacePanel() {
    this._replaceVisible = !this._replaceVisible;
    document.getElementById('replacePanel').style.display = this._replaceVisible ? 'block' : 'none';
    document.getElementById('btnShowReplace').textContent = this._replaceVisible ? '✕ Đóng Thay Thế' : '✏️ Thay Thế Hàng Loạt';
    if (this._replaceVisible) {
      // Auto-fill find field from search query
      const q = document.getElementById('searchQuery').value;
      if (q) document.getElementById('replaceFind').value = q;
      document.getElementById('replaceFind').focus();
    }
  },

  async quickEdit(fieldId, siteId, pageId, currentValue) {
    const newValue = prompt(`Chỉnh sửa nhanh (${fieldId}):`, currentValue);
    if (newValue === null || newValue === currentValue) return;

    try {
      const resp = await fetch(`${API}/sites/${siteId}/fields/${encodeURIComponent(fieldId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue })
      });
      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      Toast.success('✅ Đã lưu!');
      // Re-run search to refresh results
      setTimeout(() => this.run(), 300);
    } catch (err) {
      Toast.error('Lỗi: ' + err.message);
    }
  },

  async doReplace() {
    if (!currentSiteId) { Toast.error('Chưa chọn website!'); return; }
    const find = document.getElementById('replaceFind').value.trim();
    const replace = document.getElementById('replaceWith').value;
    const type = document.getElementById('searchTypeFilter').value;

    if (!find) { Toast.error('Nhập văn bản cần tìm!'); return; }

    const confirmMsg = `Bạn có chắc muốn thay thế:\n"${find}" → "${replace}"\n\nThao tác này sẽ ảnh hưởng đến TẤT CẢ các trang!`;
    if (!confirm(confirmMsg)) return;

    // Auto-save checkpoint trước
    try {
      await fetch(`${API}/history/${currentSiteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: `Trước khi thay thế: "${find}" → "${replace}"` })
      });
    } catch (e) { /* ignore checkpoint errors */ }

    try {
      const body = { find, replace };
      if (type) body.fieldType = type;

      const resp = await fetch(`${API}/search/${currentSiteId}/replace`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const result = await resp.json();
      if (result.error) throw new Error(result.error);

      Toast.success(`✅ ${result.message} (Đã lưu checkpoint tự động)`);
      this.run(); // Refresh results
    } catch (err) {
      Toast.error('Lỗi: ' + err.message);
    }
  },

  load() {
    // Called when view is navigated to
    document.getElementById('searchResults').innerHTML = '';
    const el = document.getElementById('searchQuery');
    if (el) { el.value = ''; setTimeout(() => el.focus(), 100); }
  }
};
