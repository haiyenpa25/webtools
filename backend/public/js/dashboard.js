/**
 * dashboard.js — Main App Controller
 * Quản lý navigation, sites list, crawl flow
 */

const API = 'http://localhost:3000/api';
let currentSiteId = null;
let currentSiteSlug = null;

// Expose currentSiteSlug for inline HTML access
Object.defineProperty(window, 'currentSiteSlug', { get: () => currentSiteSlug });

// =========================================
// CUSTOM UI CONTROLS
// =========================================
const UI = {
  confirm(title, text, onConfirm) {
    let modal = document.getElementById('custom-confirm-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'custom-confirm-modal';
      modal.className = 'custom-confirm';
      document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
      <div class="custom-confirm-box">
        <h3>${title}</h3>
        <pre>${text}</pre>
        <div class="custom-confirm-actions">
          <button class="btn btn-ghost" onclick="document.getElementById('custom-confirm-modal').style.display='none'">Hủy</button>
          <button class="btn btn-danger" id="custom-confirm-btn">🗑 Xóa</button>
        </div>
      </div>
    `;
    
    modal.style.display = 'flex';
    
    document.getElementById('custom-confirm-btn').onclick = () => {
      modal.style.display = 'none';
      onConfirm();
    };
  }
};

// =========================================
// TOAST NOTIFICATIONS
// =========================================
const Toast = {
  show(msg, type = 'success', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon"></span>${msg}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  success: (m) => Toast.show(m, 'success'),
  error: (m) => Toast.show(m, 'error', 5000),
  info: (m) => Toast.show(m, 'info'),
};

// =========================================
// APP NAVIGATION
// =========================================
const App = {
  currentView: 'dashboard',

  navigate(view, siteId, siteSlug) {
    if (siteId) { currentSiteId = siteId; currentSiteSlug = siteSlug; }

    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Show target view
    const target = document.getElementById(`view-${view}`);
    if (target) target.classList.add('active');

    // Highlight nav item
    const navItem = document.querySelector(`[data-view="${view}"]`);
    if (navItem) navItem.classList.add('active');

    this.currentView = view;
    this.updateBreadcrumb(view);

    // Show/hide site nav
    if (currentSiteId) {
      document.getElementById('currentSiteNav').style.display = 'block';
      // Update site label in sidebar
      const site = App.sitesCache[currentSiteId];
      if (site) document.getElementById('currentSiteLabel').textContent = site.name.substring(0, 20).toUpperCase();
    }

    // Load view data
    switch(view) {
      case 'dashboard': Sites.load(); Stats.load(); break;
      case 'pages': if (!currentSiteId) { Toast.info('Chọn website trước!'); App.navigate('dashboard'); return; } Pages.load(); break;
      case 'media': if (!currentSiteId) { Toast.info('Chọn website trước!'); App.navigate('dashboard'); return; } Media.load(); break;
      case 'seo': if (!currentSiteId) { Toast.info('Chọn website trước!'); App.navigate('dashboard'); return; } SEO.load(); break;
      case 'globals': if (!currentSiteId) { Toast.info('Chọn website trước!'); App.navigate('dashboard'); return; } Globals.load(); break;
      case 'history': if (!currentSiteId) { Toast.info('Chọn website trước!'); App.navigate('dashboard'); return; } History.load(); break;
      case 'search': if (!currentSiteId) { Toast.info('Chọn website trước!'); App.navigate('dashboard'); return; } Search.load(); break;
      case 'export': if (!currentSiteId) { Toast.info('Chọn website trước!'); App.navigate('dashboard'); return; } Export.load(); break;
      case 'i18n': if (!currentSiteId) { Toast.info('Chọn website trước!'); App.navigate('dashboard'); return; } I18n.init(currentSiteId, currentSiteSlug); break;
    }

    // Update topbar context actions
    App.updateTopbarActions(view);
  },

  updateBreadcrumb(view) {
    const labels = {
      'dashboard': 'Dashboard',
      'new-site': 'Thêm Website Mới',
      'pages': 'Các Trang',
      'media': 'Media Library',
      'seo': 'SEO Manager',
      'globals': 'Global Variables',
      'history': 'Lịch Sử Phiên Bản',
      'search': 'Tìm Kiếm Nội Dung',
      'export': 'Xuất File (Export)',
      'i18n': 'Đa Ngôn Ngữ (i18n)'
    };
    const bc = document.getElementById('breadcrumb');
    bc.innerHTML = `<span>${labels[view] || view}</span>`;
  },

  toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
  },

  updateTopbarActions(view) {
    const el = document.getElementById('topbarActions');
    if (!el || !currentSiteId) { if (el) el.innerHTML = ''; return; }

    const site = App.sitesCache[currentSiteId];
    const siteName = site?.name || 'Site';

    // Context actions theo view
    let actions = '';

    if (['pages', 'media', 'seo', 'globals', 'history', 'search'].includes(view)) {
      actions += `
        <button class="btn btn-ghost btn-sm" onclick="History.saveNow()" title="Lưu checkpoint"
          style="display:flex;align-items:center;gap:6px">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
          </svg>
          Lưu Checkpoint
        </button>
        <button class="btn btn-ghost btn-sm" onclick="App.navigate('export')" title="Xuất ZIP"
          style="display:flex;align-items:center;gap:6px">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
          </svg>
          Export
        </button>`;
    }

    if (view === 'export') {
      actions += `
        <button class="btn btn-primary btn-sm" onclick="Export.download()"
          style="display:flex;align-items:center;gap:6px">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
          </svg>
          Tải Xuống ZIP
        </button>`;
    }

    el.innerHTML = `<div style="display:flex;gap:8px;align-items:center">${actions}</div>`;
  },

  sitesCache: {}
};

// =========================================
// SITES MANAGEMENT
// =========================================
const Sites = {
  async load() {
    const grid = document.getElementById('sitesGrid');
    grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Đang tải...</p></div>';

    try {
      const resp = await fetch(`${API}/sites`);
      const sites = await resp.json();

      App.sitesCache = {};
      sites.forEach(s => App.sitesCache[s.id] = s);

      if (!sites.length) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1">
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            <h3>Chưa có website nào</h3>
            <p>Thêm website đầu tiên để bắt đầu</p>
            <button class="btn btn-primary" onclick="App.navigate('new-site')">+ Thêm Website</button>
          </div>`;
        return;
      }

      grid.innerHTML = sites.map(site => this.renderCard(site)).join('');
    } catch (err) {
      grid.innerHTML = `<div class="empty-state"><p>❌ Lỗi kết nối: ${err.message}</p></div>`;
    }
  },

  renderCard(site) {
    const statusLabel = { ready: 'Sẵn sàng', crawling: 'Đang crawl', error: 'Lỗi', pending: 'Chờ' };
    const statusColors = { ready: '#22c55e', crawling: '#6c63ff', error: '#ef4444', pending: '#eab308' };
    const date = new Date(site.created_at).toLocaleDateString('vi-VN');
    const isCrawling = site.status === 'crawling' || site.status === 'pending';
    const isError = site.status === 'error';

    return `
      <div class="site-card" onclick="Sites.open(${site.id}, '${site.slug}')">
        <div class="site-card-header">
          <div class="site-favicon">🌐</div>
          <span class="site-status ${site.status}" style="background:${statusColors[site.status]}22;color:${statusColors[site.status]}">
            ${isCrawling ? '⏳' : isError ? '❌' : '✅'} ${statusLabel[site.status] || site.status}
          </span>
        </div>
        <div class="site-name">${site.name}</div>
        <div class="site-url" title="${site.original_url}">${site.original_url.length > 45 ? site.original_url.substring(0,42)+'...' : site.original_url}</div>
        ${isCrawling ? `
          <div style="margin:10px 0;">
            <div style="height:4px;background:var(--bg-secondary);border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${site.crawl_progress||0}%;background:var(--accent);transition:width 0.5s"></div>
            </div>
            <div style="font-size:11px;color:var(--accent);margin-top:4px">${site.crawl_progress||0}% — đang crawl...</div>
          </div>` : ''}
        ${isError ? `<div style="font-size:11px;color:#ef4444;margin:8px 0">⚠️ Crawl thất bại. Hãy thử lại.</div>` : ''}
        <div class="site-stats">
          <div class="site-stat">
            <div class="site-stat-value">${site.page_count || 0}</div>
            <div class="site-stat-label">Trang</div>
          </div>
          <div class="site-stat">
            <div class="site-stat-value">${date}</div>
            <div class="site-stat-label">Ngày tạo</div>
          </div>
        </div>
        <div class="site-actions" onclick="event.stopPropagation()">
          <button class="btn btn-primary btn-sm" onclick="Sites.open(${site.id}, '${site.slug}')">Quản Lý</button>
          <button class="btn btn-ghost btn-sm" onclick="VisualEditor.open(${site.id}, '${site.slug}')">Visual Editor</button>
          <button class="btn btn-ghost btn-sm" onclick="Sites.rename(${site.id}, '${site.name.replace(/'/g, '')}')" title="Đổi tên">✏️</button>
          ${!isCrawling ? `<button class="btn btn-ghost btn-sm" onclick="Sites.recrawl(${site.id}, '${site.original_url}', '${site.name.replace(/'/g, '')}')" title="Crawl lại">🔄</button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="Sites.removeSite(${site.id}, '${site.name.replace(/'/g, '')}', ${site.page_count || 0})" title="Xóa toàn bộ website">🗑 Xóa</button>
        </div>
      </div>`;
  },

  open(siteId, siteSlug) {
    currentSiteId = siteId;
    currentSiteSlug = siteSlug;
    App.navigate('pages', siteId, siteSlug);
  },

  async rename(siteId, currentName) {
    const newName = prompt('Nhập tên mới cho website:', currentName);
    if (!newName || newName.trim() === currentName) return;
    try {
      const resp = await fetch(`${API}/sites/${siteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() })
      });
      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      Toast.success('✅ Đã đổi tên!');
      App.sitesCache[siteId] && (App.sitesCache[siteId].name = newName.trim());
      Sites.load();
      Stats.load();
    } catch (err) {
      Toast.error('Lỗi: ' + err.message);
    }
  },

  async removeSite(siteId, siteName, pageCount) {
    const name = siteName || 'website này';
    const pages = pageCount || 0;
    
    UI.confirm('⚠️ XÓA TOÀN BỘ WEBSITE', `Tên: ${name}\nSố trang: ${pages} trang\n\nTất cả dữ liệu của website này sẽ bị xóa VĨNH VIỄN.\nBạn có chắc chắn muốn xóa không?`, async () => {
      try {
        const r = await fetch(`${API}/sites/${siteId}`, { method: 'DELETE' });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Xóa thất bại');
        Toast.success(`Đã xóa website "${name}" và ${pages} trang!`);
        if (currentSiteId === siteId) { currentSiteId = null; currentSiteSlug = null; }
        Sites.load(); Stats.load();
      } catch (err) {
        Toast.error('Lỗi xóa: ' + err.message);
      }
    });
  },

  async recrawl(siteId, url, name) {
    if (!confirm(`Crawl lại website "${name}"?\n\nDữ liệu cũ sẽ bị xóa và cào lại từ đầu.`)) return;
    try {
      // Xóa data cũ
      await fetch(`${API}/sites/${siteId}`, { method: 'DELETE' });
      if (currentSiteId === siteId) { currentSiteId = null; currentSiteSlug = null; }

      // Crawl lại với URL và tên cũ
      const maxPages = 50;
      const resp = await fetch(`${API}/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name, maxPages })
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);

      Toast.success('⏳ Đang crawl lại...');
      Sites.load();

      // Tự động navigate đến 'new-site' để xem progress
      App.navigate('new-site');
    } catch (err) {
      Toast.error('Lỗi recrawl: ' + err.message);
    }
  }
};

// =========================================
// STATS OVERVIEW
// =========================================
const Stats = {
  async load() {
    try {
      const resp = await fetch(`${API}/stats`);
      const data = await resp.json();
      const statsBar = document.getElementById('statsBar');
      if (!statsBar) return;

      const hasModified = data.modifiedFields > 0;

      statsBar.innerHTML = [
        { label: 'Websites', value: data.sites, icon: '🌐', color: '#6c63ff', sub: data.sitesReady + ' sẵn sàng' },
        { label: 'Tổng Trang', value: data.pages || 0, icon: '📄', color: '#3b82f6', sub: '' },
        { label: 'Hình Ảnh', value: data.media, icon: '🖼️', color: '#22c55e', sub: '' },
        { label: 'Editable Fields', value: data.editableFields, icon: '✏️', color: '#eab308', sub: hasModified ? `🟡 ${data.modifiedFields} đã sửa` : '' },
      ].map(s => `
        <div class="stat-pill" style="${s.sub && s.sub.includes('🟡') ? 'border-color:rgba(234,179,8,0.4)' : ''}">
          <div class="stat-pill-icon" style="background:${s.color}22;color:${s.color}">${s.icon}</div>
          <div>
            <div class="stat-pill-value">${s.value}</div>
            <div class="stat-pill-label">${s.label}</div>
            ${s.sub ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${s.sub}</div>` : ''}
          </div>
        </div>`).join('');
    } catch {}
  }
};



// =========================================
// PAGES
// =========================================
const Pages = {
  selectedIds: new Set(),

  async load() {
    if (!currentSiteId) return;
    this.selectedIds.clear();
    const container = document.getElementById('pagesGrid');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Đang tải trang...</p></div>';

    try {
      const pagesResp = await fetch(`${API}/sites/${currentSiteId}/pages`);
      const pages = await pagesResp.json();

      if (!pages.length) {
        container.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16"/></svg><h3>Chưa có trang nào</h3></div>`;
        return;
      }

      // Fetch field count per page
      const fieldCounts = {};
      await Promise.all(pages.map(async p => {
        try {
          const r = await fetch(`${API}/sites/${currentSiteId}/pages/${p.id}/fields`);
          const f = await r.json();
          fieldCounts[p.id] = f.length;
        } catch { fieldCounts[p.id] = 0; }
      }));

      const nonHomePages = pages.filter(p => !p.is_home);

      // Bulk action toolbar
      const toolbar = `
        <div id="pagesToolbar" style="
          display:flex; align-items:center; gap:12px; margin-bottom:16px;
          padding:12px 16px; background:var(--bg-card); border:1px solid var(--border);
          border-radius:var(--radius); flex-wrap:wrap;
        ">
          <input type="text" id="pageSearch" placeholder="Lọc URL (vd: /en/)..." 
            onkeyup="Pages.filterPages(this.value)" 
            style="padding:6px 12px; border:1px solid var(--border); border-radius:var(--radius); background:var(--bg-primary); color:var(--text-primary); font-size:13px; width:220px; outline:none;">
          <span style="width:1px;height:24px;background:var(--border);margin:0 4px;"></span>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text-secondary)">
            <input type="checkbox" id="selectAllPages" onchange="Pages.toggleAll(this.checked)"
              style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer">
            <span>Chọn tất cả <span style="color:var(--text-muted)">(<span id="selectCount">0</span>/<span id="visibleCount">${nonHomePages.length}</span> trang hiển thị)</span></span>
          </label>
          <button id="bulkDeleteBtn" class="btn btn-danger btn-sm" onclick="Pages.bulkRemove()" disabled
            style="margin-left:auto;opacity:0.5;transition:opacity 0.2s">
            🗑 Xóa đã chọn (<span id="selectedCount">0</span>)
          </button>
        </div>`;

      const cards = pages.map(p => `
        <div class="page-card" id="page-card-${p.id}" style="position:relative">
          ${!p.is_home ? `
            <input type="checkbox" class="page-checkbox" data-id="${p.id}"
              onchange="Pages.toggleSelect(${p.id}, this.checked)"
              style="position:absolute;top:10px;right:10px;width:16px;height:16px;accent-color:var(--accent);cursor:pointer;z-index:2">
          ` : ''}
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-right:${!p.is_home ? '28px' : '0'}">
            <span class="page-path">${p.path || '/'}</span>
            <div style="display:flex;gap:6px;align-items:center">
              ${p.is_home ? '<span class="page-badge">HOME</span>' : ''}
              ${fieldCounts[p.id] ? `<span class="page-badge" style="background:rgba(34,197,94,0.15);color:#22c55e">${fieldCounts[p.id]} fields</span>` : ''}
            </div>
          </div>
          <div class="page-title">${p.title || 'Không có tiêu đề'}</div>
          <div class="page-actions">
            <button class="btn btn-primary btn-sm" onclick="VisualEditor.openPage('${currentSiteSlug}', '${p.path}', ${currentSiteId})">
              ✏️ Visual Editor
            </button>
            <button class="btn btn-ghost btn-sm" onclick="window.open('/api/sites/${currentSiteSlug}/serve${p.path}', '_blank')">
              👁 Preview
            </button>
            ${!p.is_home ? `<button class="btn btn-danger btn-sm" onclick="Pages.removePage(${p.id}, '${p.path.replace(/'/g, "\\'")}')">🗑 Xóa</button>` : ''}
          </div>
        </div>`).join('');

      container.innerHTML = toolbar + `<div class="pages-grid">${cards}</div>`;

    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p>❌ ${err.message}</p></div>`;
    }
  },

  filterPages(keyword) {
    const kw = keyword.toLowerCase().trim();
    const cards = document.querySelectorAll('.page-card');
    let visibleNonHome = 0;

    cards.forEach(card => {
      const pathText = card.querySelector('.page-path').textContent.toLowerCase();
      const isHome = card.querySelector('.page-badge') && card.querySelector('.page-badge').textContent === 'HOME';

      if (pathText.includes(kw)) {
        card.style.display = 'block';
        if (!isHome) visibleNonHome++;
      } else {
        card.style.display = 'none';
        const cb = card.querySelector('.page-checkbox');
        if (cb && cb.checked) {
          cb.checked = false;
          this.selectedIds.delete(parseInt(cb.dataset.id));
        }
      }
    });

    const visibleCountEl = document.getElementById('visibleCount');
    if (visibleCountEl) visibleCountEl.textContent = visibleNonHome;

    this._updateBulkBar();
  },

  toggleSelect(pageId, checked) {
    if (checked) this.selectedIds.add(pageId);
    else this.selectedIds.delete(pageId);
    this._updateBulkBar();
  },

  toggleAll(checked) {
    document.querySelectorAll('.page-card').forEach(card => {
      if (card.style.display !== 'none') {
        const cb = card.querySelector('.page-checkbox');
        if (cb) {
          cb.checked = checked;
          const id = parseInt(cb.dataset.id);
          if (checked) this.selectedIds.add(id);
          else this.selectedIds.delete(id);
        }
      }
    });
    this._updateBulkBar();
  },

  _updateBulkBar() {
    const n = this.selectedIds.size;
    const countEl = document.getElementById('selectedCount');
    const selectCountEl = document.getElementById('selectCount');
    const btn = document.getElementById('bulkDeleteBtn');
    if (countEl) countEl.textContent = n;
    if (selectCountEl) selectCountEl.textContent = n;
    if (btn) { btn.disabled = n === 0; btn.style.opacity = n > 0 ? '1' : '0.5'; }
    
    // Sync selectAll checkbox based on visible items
    const visibleCheckboxes = Array.from(document.querySelectorAll('.page-card'))
      .filter(card => card.style.display !== 'none')
      .map(card => card.querySelector('.page-checkbox'))
      .filter(cb => cb !== null);
    
    const selectAll = document.getElementById('selectAllPages');
    if (selectAll && visibleCheckboxes.length > 0) {
      const checkedCount = visibleCheckboxes.filter(cb => cb.checked).length;
      selectAll.checked = checkedCount === visibleCheckboxes.length;
      selectAll.indeterminate = checkedCount > 0 && checkedCount < visibleCheckboxes.length;
    } else if (selectAll) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }
  },

  async bulkRemove() {
    const ids = [...this.selectedIds];
    if (!ids.length) return;
    UI.confirm('Xác nhận xóa hàng loạt', `Xóa ${ids.length} trang đã chọn?\n\nThao tác không thể hoàn tác.`, async () => {
      try {
        const r = await fetch(`${API}/sites/${currentSiteId}/pages/bulk-delete`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageIds: ids })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Xóa thất bại');
        Toast.success(`✅ Đã xóa ${data.deletedCount || data.deleted || ids.length} trang!`);
        this.selectedIds.clear();
        Pages.load();
        Stats.load();
      } catch (err) {
        Toast.error('Lỗi xóa hàng loạt: ' + err.message);
      }
    });
  },

  async removePage(pageId, pagePath) {
    UI.confirm('Xác nhận xóa trang', `Xóa trang "${pagePath}"?\n\nTất cả nội dung, fields và bản dịch của trang này sẽ bị xóa vĩnh viễn.`, async () => {
      try {
        const r = await fetch(`${API}/sites/${currentSiteId}/pages/${pageId}`, { method: 'DELETE' });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Xóa thất bại');
        Toast.success(`Đã xóa trang ${pagePath}`);
        Pages.load();
        Stats.load();
      } catch (err) {
        Toast.error('Lỗi xóa trang: ' + err.message);
      }
    });
  },
};



// =========================================
// CRAWL
// =========================================
const Crawl = {
  jobId: null,
  pollTimer: null,
  _running: false,
  scannedLinks: [],
  
  async scan() {
    if (this._running) { Toast.info('�ang thao t�c, vui l�ng ch?...'); return; }
    const url = document.getElementById('crawlUrl').value.trim();
    if (!url) { Toast.error('Vui l�ng nh?p URL website!'); return; }
    try { new URL(url); } catch { Toast.error('URL kh�ng h?p l?!'); return; }
    
    this._running = true;
    const btn = document.getElementById('scanLinksBtn');
    btn.disabled = true;
    btn.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> �ang qu�t...`;
    
    try {
      const resp = await fetch(`${API}/crawl/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      
      this.scannedLinks = data.links;
      this.renderXray();
      document.getElementById('xrayScannerModal').style.display = 'flex';
      
    } catch (err) {
      Toast.error('Qu�t l?i: ' + err.message);
    } finally {
      this._running = false;
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Qu�t Li�n K?t (X-Ray)`;
    }
  },
  
  renderXray() {
    const list = document.getElementById('xrayLinksList');
    list.innerHTML = this.scannedLinks.map((l, i) => `
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:var(--bg-primary);padding:8px;border-radius:4px;border:1px solid var(--border)">
        <input type="checkbox" class="xray-checkbox" checked value="${l.path}" onchange="Crawl.updateXrayCount()" style="accent-color:var(--accent)">
        <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.path === '/' ? 'Trang ch?' : l.path}</span>
        <span style="font-size:11px;padding:2px 6px;border-radius:8px;background:${l.group === 'menu' ? 'rgba(34,197,94,0.15)' : 'rgba(108,99,255,0.15)'};color:${l.group === 'menu' ? '#22c55e' : '#6c63ff'}">
           ${l.group === 'menu' ? 'Menu' : 'Body'}
        </span>
      </label>
    `).join('');
    this.updateXrayCount();
  },
  
  addCustomLink() {
    let p = document.getElementById('xrayCustomPath').value.trim();
    if (!p) return;
    if (!p.startsWith('/')) p = '/' + p;
    if (this.scannedLinks.find(l => l.path === p)) { Toast.info('�� c� trong danh s�ch!'); return; }
    
    this.scannedLinks.push({ path: p, label: p, group: 'custom' });
    this.renderXray();
    document.getElementById('xrayCustomPath').value = '';
    Toast.success('�� th�m');
  },
  
  toggleAllXray(checked) {
    document.querySelectorAll('.xray-checkbox').forEach(cb => cb.checked = checked);
    this.updateXrayCount();
  },
  
  updateXrayCount() {
    const total = document.querySelectorAll('.xray-checkbox').length;
    const checked = document.querySelectorAll('.xray-checkbox:checked').length;
    document.getElementById('xrayTotalCount').textContent = total;
    document.getElementById('xraySelectedCount').textContent = checked;
  },
  
  async startTargeted() {
    const cbs = document.querySelectorAll('.xray-checkbox:checked');
    if (cbs.length === 0) { Toast.error('B?n ph?i ch?n �t nh?t 1 trang!'); return; }
    
    const url = document.getElementById('crawlUrl').value.trim();
    const basePath = new URL(url).origin;
    const customQueue = Array.from(cbs).map(cb => basePath + cb.value);
    
    document.getElementById('xrayScannerModal').style.display = 'none';
    this.start(customQueue);
  },

  async start(customQueue = []) {
    if (this._running) { Toast.info('Crawl dang ch?y...'); return; }

    const url = document.getElementById('crawlUrl').value.trim();
    const name = document.getElementById('crawlName').value.trim();

    this._running = true;
    document.getElementById('crawlProgressCard').style.display = 'block';

    try {
      const maxPages = parseInt(document.getElementById('crawlMaxPages')?.value || '50');
      const waitTime = parseInt(document.getElementById('crawlWaitTime')?.value || '1000');
      const excludePathsRaw = document.getElementById('crawlExcludePaths')?.value || '';
      
      const excludePaths = excludePathsRaw.split(',')
                                        .map(s => s.trim().replace(/^\/+|\/+$/g, '')) 
                                        .filter(s => s);

      const resp = await fetch(`${API}/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name, maxPages, waitTime, excludePaths, customQueue })
      });

      const data = await resp.json();
      if (data.error) throw new Error(data.error);

      this.jobId = data.jobId;
      currentSiteId = data.siteId;
      currentSiteSlug = data.slug;

      this.pollProgress();
    } catch (err) {
      Toast.error('L?i: ' + err.message);
      this._running = false;
    }
  },

  pollProgress() {
    this.pollTimer = setInterval(async () => {
      try {
        const resp = await fetch(`${API}/crawl/status/${this.jobId}`);
        const job = await resp.json();

        this.updateProgress(job);

        if (job.status === 'done' || job.status === 'error') {
          clearInterval(this.pollTimer);
          this._running = false;

          if (job.status === 'done') {
            Toast.success('? Crawl ho�n t?t!');
            setTimeout(() => App.navigate('pages', currentSiteId, currentSiteSlug), 1500);
          } else {
            Toast.error('? Crawl th?t b?i: ' + job.message);
          }
        }
      } catch (err) {}
    }, 1500);
  },

  updateProgress(job) {
    const progress = job.progress || 0;
    document.getElementById('progressBar').style.width = progress + '%';
    document.getElementById('progressPercent').textContent = progress + '%';
    document.getElementById('progressMessage').textContent = job.message || '';

    const stepMap = { crawling: '??? �ang crawl', assets: '?? T?i assets', images: '??? Optimize ?nh', processing: '?? X? l� d? li?u', done: '? Ho�n t?t' };
    if (job.status) {
      const steps = document.getElementById('progressSteps');
      steps.innerHTML = Object.keys(stepMap).map(k => `
        <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:${job.status === k ? '#6c63ff' : job.progress > ['crawling','assets','images','processing','done'].indexOf(k) * 20 ? '#22c55e' : '#4a4d5e'}">
          <span>${stepMap[k]}</span>
        </div>`).join('');
    }
  }
};
// =========================================
// VISUAL EDITOR
// =========================================
const VisualEditor = {
  open(siteId, siteSlug) {
    // Open first page
    const url = `/api/sites/${siteSlug}/serve/?edit=true`;
    this.openFrame(url, siteId);
  },

  openPage(siteSlug, pagePath, siteId) {
    const url = `/api/sites/${siteSlug}/serve${pagePath}?edit=true`;
    this.openFrame(url, siteId);
  },

  openFrame(url, siteId) {
    document.getElementById('visualEditorModal').style.display = 'flex';
    const iframe = document.getElementById('editorIframe');
    iframe.src = url;
  },

  close() {
    document.getElementById('visualEditorModal').style.display = 'none';
    document.getElementById('editorIframe').src = '';
    // Reload current view to reflect changes
    if (App.currentView === 'pages') Pages.load();
  }
};

// =========================================
// API STATUS CHECK
// =========================================
async function checkApiStatus() {
  try {
    const resp = await fetch(`${API}/health`);
    if (resp.ok) {
      document.getElementById('apiStatusDot').className = 'status-dot online';
      document.getElementById('apiStatusText').textContent = 'Đã kết nối';
    } else throw new Error();
  } catch {
    document.getElementById('apiStatusDot').className = 'status-dot offline';
    document.getElementById('apiStatusText').textContent = 'Mất kết nối';
  }
}

// =========================================
// INIT
// =========================================
document.addEventListener('DOMContentLoaded', () => {
  App.navigate('dashboard');
  checkApiStatus();
  setInterval(checkApiStatus, 30000);
});

