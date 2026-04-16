/**
 * globals.js — Global Variables UI
 */
const Globals = {
  editingId: null,

  async load() {
    if (!currentSiteId) return;
    const container = document.getElementById('globalsTable');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Đang tải variables...</p></div>';

    try {
      const resp = await fetch(`${API}/globals/${currentSiteId}`);
      const vars = await resp.json();

      if (!vars.length) {
        container.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
            <h3>Chưa có global variables</h3>
            <p>Hệ thống sẽ tự phát hiện số điện thoại, email sau khi crawl. Hoặc thêm thủ công.</p>
          </div>`;
        return;
      }

      const typeIcons = { email: '📧', phone: '📞', url: '🔗', text: '✏️', textarea: '📝' };
      container.innerHTML = vars.map(v => `
        <div class="global-item">
          <div>
            <div class="global-key">${v.var_key}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${v.label}</div>
          </div>
          <div class="global-value">${typeIcons[v.var_type] || '✏️'} ${v.var_value}</div>
          <span class="global-type">${v.var_type}</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-primary btn-sm" onclick="Globals.showEditModal(${v.id}, '${v.var_key}', \`${v.var_value.replace(/`/g, '\\`')}\`, '${v.label}', '${v.var_type}')">
              ✏️ Sửa
            </button>
            <button class="btn btn-danger btn-sm" onclick="Globals.delete(${v.id})">🗑</button>
          </div>
        </div>`).join('');
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p>❌ ${err.message}</p></div>`;
    }
  },

  showAddModal() {
    this.editingId = null;
    document.getElementById('globalModalTitle').textContent = 'Thêm Variable';
    document.getElementById('globalModalBody').innerHTML = this.renderForm({});
    document.getElementById('globalModal').style.display = 'flex';
  },

  showEditModal(id, key, value, label, type) {
    this.editingId = id;
    document.getElementById('globalModalTitle').textContent = 'Sửa Variable';
    document.getElementById('globalModalBody').innerHTML = this.renderForm({ var_key: key, var_value: value, label, var_type: type });
    document.getElementById('globalModal').style.display = 'flex';
  },

  renderForm(data) {
    return `
      <div class="form-group">
        <label class="form-label">Key (tên biến)</label>
        <input type="text" class="form-input" id="gVarKey" value="${data.var_key || ''}" placeholder="phone_main, email_contact..." ${this.editingId ? 'readonly' : ''}>
      </div>
      <div class="form-group">
        <label class="form-label">Nhãn (hiển thị)</label>
        <input type="text" class="form-input" id="gVarLabel" value="${data.label || ''}" placeholder="Số điện thoại chính">
      </div>
      <div class="form-group">
        <label class="form-label">Kiểu dữ liệu</label>
        <select class="form-input" id="gVarType">
          ${['text','email','phone','url','textarea'].map(t => `<option value="${t}" ${data.var_type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Giá trị</label>
        <input type="text" class="form-input" id="gVarValue" value="${data.var_value || ''}" placeholder="Nhập giá trị...">
      </div>
      <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:12px;color:var(--text-muted)">
        ⚡ Khi bạn cập nhật giá trị, hệ thống sẽ tự động cập nhật toàn bộ nội dung chứa giá trị cũ trên tất cả các trang.
      </div>`;
  },

  async save() {
    const val = {
      var_key: document.getElementById('gVarKey').value.trim(),
      var_value: document.getElementById('gVarValue').value.trim(),
      label: document.getElementById('gVarLabel').value.trim(),
      var_type: document.getElementById('gVarType').value
    };

    if (!val.var_key || !val.var_value) {
      Toast.error('Vui lòng điền đầy đủ thông tin!'); return;
    }

    try {
      let resp;
      if (this.editingId) {
        resp = await fetch(`${API}/globals/${currentSiteId}/${this.editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ var_value: val.var_value, label: val.label })
        });
      } else {
        resp = await fetch(`${API}/globals/${currentSiteId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(val)
        });
      }

      const result = await resp.json();
      if (result.error) throw new Error(result.error);

      const msg = this.editingId
        ? `✅ Đã cập nhật! ${result.propagated ? 'Đã lan truyền sang toàn bộ trang.' : ''}`
        : '✅ Đã thêm variable!';
      Toast.success(msg);
      this.closeModal();
      this.load();
    } catch (err) {
      Toast.error('Lỗi: ' + err.message);
    }
  },

  async delete(id) {
    if (!confirm('Xóa variable này?')) return;
    try {
      await fetch(`${API}/globals/${currentSiteId}/${id}`, { method: 'DELETE' });
      Toast.success('Đã xóa!');
      this.load();
    } catch (err) {
      Toast.error('Lỗi: ' + err.message);
    }
  },

  closeModal() {
    document.getElementById('globalModal').style.display = 'none';
    this.editingId = null;
  }
};
