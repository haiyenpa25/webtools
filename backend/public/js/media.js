/**
 * media.js — Media Library UI
 */
const Media = {
  uploadContext: null,

  async load() {
    if (!currentSiteId) return;
    const grid = document.getElementById('mediaGrid');
    grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Đang tải media...</p></div>';

    try {
      const resp = await fetch(`${API}/media/${currentSiteId}`);
      const items = await resp.json();

      if (!items.length) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1">
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <h3>Chưa có hình ảnh</h3>
            <p>Hình ảnh sẽ xuất hiện sau khi crawl website</p>
          </div>`;
        return;
      }

      grid.innerHTML = items.map(item => this.renderItem(item)).join('');
    } catch (err) {
      grid.innerHTML = `<div class="empty-state"><p>❌ ${err.message}</p></div>`;
    }
  },

  renderItem(item) {
    const size = item.file_size ? (item.file_size / 1024).toFixed(0) + 'KB' : 'N/A';
    const dims = item.width ? `${item.width}×${item.height}` : 'N/A';
    return `
      <div class="media-item">
        <img class="media-thumb" src="${item.thumbnailUrl || item.url}" 
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
             alt="${item.alt_text || item.fixed_name}">
        <div class="media-thumb-placeholder" style="display:none">🖼️</div>
        <div class="media-info">
          <div class="media-name" title="${item.fixed_name}">${item.fixed_name}</div>
          <div class="media-meta">${dims} · ${size}</div>
          <div class="media-actions">
            <button class="btn btn-primary btn-sm" onclick="Media.openUpload('${item.url}', '${item.fixed_name}', ${item.id})">
              ↑ Thay Thế
            </button>
            <button class="btn btn-ghost btn-sm" onclick="window.open('${item.url}', '_blank')">👁</button>
          </div>
        </div>
      </div>`;
  },

  openUpload(currentUrl, fixedName, mediaId) {
    this.uploadContext = { fixedName, mediaId };
    document.getElementById('uploadCurrentImg').src = currentUrl || '';
    document.getElementById('uploadFixedName').textContent = fixedName;
    if (currentUrl) {
      document.getElementById('uploadCurrentImg').style.display = 'block';
    }
    document.getElementById('uploadModal').style.display = 'flex';
  },

  closeUpload() {
    document.getElementById('uploadModal').style.display = 'none';
    document.getElementById('uploadFileInput').value = '';
    this.uploadContext = null;
  },

  async handleUpload(input) {
    if (!input.files[0] || !this.uploadContext) return;

    const file = input.files[0];
    const { fixedName } = this.uploadContext;

    const form = new FormData();
    form.append('image', file);
    form.append('fixedName', fixedName);

    try {
      const resp = await fetch(`${API}/media/${currentSiteId}/upload`, {
        method: 'POST',
        body: form
      });
      const data = await resp.json();

      if (data.error) throw new Error(data.error);

      Toast.success(`✅ Đã thay thế "${fixedName}" — ${data.width}×${data.height}px`);
      this.closeUpload();
      this.load(); // Reload media grid
    } catch (err) {
      Toast.error('Lỗi upload: ' + err.message);
    }
  }
};
