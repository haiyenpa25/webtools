/**
 * seo.js — SEO Manager UI
 */
const SEO = {
  pages: [],
  editingPageId: null,

  async load() {
    if (!currentSiteId) return;
    const wrap = document.getElementById('seoTable');
    wrap.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Đang tải SEO data...</p></div>';

    try {
      const resp = await fetch(`${API}/seo/${currentSiteId}`);
      this.pages = await resp.json();

      if (!this.pages.length) {
        wrap.innerHTML = `<div class="empty-state"><h3>Chưa có dữ liệu SEO</h3></div>`;
        return;
      }

      wrap.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Trang</th>
              <th>Title</th>
              <th>Meta Description</th>
              <th>Score</th>
              <th>Hành Động</th>
            </tr>
          </thead>
          <tbody>
            ${this.pages.map(p => this.renderRow(p)).join('')}
          </tbody>
        </table>`;
    } catch (err) {
      wrap.innerHTML = `<div class="empty-state"><p>❌ ${err.message}</p></div>`;
    }
  },

  renderRow(page) {
    const score = this.calcScore(page);
    const scoreColor = score >= 80 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444';
    return `
      <tr>
        <td><code style="font-family:monospace;font-size:11px;color:#8b84ff">${page.path || '/'}</code></td>
        <td style="max-width:200px"><span title="${page.meta_title}">${(page.meta_title || '—').substring(0,50)}${page.meta_title?.length > 50 ? '...' : ''}</span></td>
        <td style="max-width:240px"><span title="${page.meta_description}">${(page.meta_description || '—').substring(0,60)}${page.meta_description?.length > 60 ? '...' : ''}</span></td>
        <td><span class="seo-score" style="background:${scoreColor}22;color:${scoreColor}">${score}/100</span></td>
        <td><button class="btn btn-primary btn-sm" onclick="SEO.openModal(${page.page_id})">✏️ Sửa</button></td>
      </tr>`;
  },

  calcScore(page) {
    let score = 0;
    if (page.meta_title && page.meta_title.length >= 30 && page.meta_title.length <= 60) score += 30;
    else if (page.meta_title) score += 15;
    if (page.meta_description && page.meta_description.length >= 120 && page.meta_description.length <= 160) score += 30;
    else if (page.meta_description) score += 15;
    if (page.meta_keywords) score += 15;
    if (page.og_title) score += 10;
    if (page.og_image) score += 15;
    return score;
  },

  openModal(pageId) {
    this.editingPageId = pageId;
    const page = this.pages.find(p => p.page_id === pageId);
    if (!page) return;

    document.getElementById('seoModalBody').innerHTML = `
      <div class="form-group">
        <label class="form-label">Meta Title <small>(30-60 ký tự tốt nhất)</small></label>
        <input type="text" class="form-input" id="seoTitle" value="${page.meta_title || ''}" maxlength="80" oninput="SEO.charCount(this, 'titleCount', 60)">
        <small id="titleCount" style="color:var(--text-muted)">${(page.meta_title || '').length}/80</small>
      </div>
      <div class="form-group">
        <label class="form-label">Meta Description <small>(120-160 ký tự tốt nhất)</small></label>
        <textarea class="form-input" id="seoDesc" rows="3" maxlength="300" oninput="SEO.charCount(this, 'descCount', 160)">${page.meta_description || ''}</textarea>
        <small id="descCount" style="color:var(--text-muted)">${(page.meta_description || '').length}/300</small>
      </div>
      <div class="form-group">
        <label class="form-label">Meta Keywords</label>
        <input type="text" class="form-input" id="seoKeywords" value="${page.meta_keywords || ''}" placeholder="keyword1, keyword2, keyword3">
      </div>
      <div class="form-group">
        <label class="form-label">OG Title (Social Media)</label>
        <input type="text" class="form-input" id="seoOgTitle" value="${page.og_title || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">OG Description</label>
        <textarea class="form-input" id="seoOgDesc" rows="2">${page.og_description || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Robots</label>
        <select class="form-input" id="seoRobots">
          <option value="index, follow" ${page.robots === 'index, follow' ? 'selected' : ''}>index, follow</option>
          <option value="noindex, follow" ${page.robots === 'noindex, follow' ? 'selected' : ''}>noindex, follow</option>
          <option value="noindex, nofollow" ${page.robots === 'noindex, nofollow' ? 'selected' : ''}>noindex, nofollow</option>
        </select>
      </div>`;

    document.getElementById('seoModal').style.display = 'flex';
  },

  charCount(el, countId, limit) {
    const count = el.value.length;
    const counter = document.getElementById(countId);
    counter.textContent = `${count}/${el.maxLength}`;
    counter.style.color = count > limit ? 'var(--yellow)' : 'var(--text-muted)';
  },

  async save() {
    const data = {
      meta_title: document.getElementById('seoTitle').value,
      meta_description: document.getElementById('seoDesc').value,
      meta_keywords: document.getElementById('seoKeywords').value,
      og_title: document.getElementById('seoOgTitle').value,
      og_description: document.getElementById('seoOgDesc').value,
      robots: document.getElementById('seoRobots').value
    };

    try {
      const resp = await fetch(`${API}/seo/${currentSiteId}/${this.editingPageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      Toast.success('✅ Đã lưu SEO!');
      this.closeModal();
      this.load();
    } catch (err) {
      Toast.error('Lỗi: ' + err.message);
    }
  },

  closeModal() {
    document.getElementById('seoModal').style.display = 'none';
    this.editingPageId = null;
  }
};
