/**
 * export.js — Export Site UI
 */
const Export = {
  previewData: null,

  async load() {
    if (!currentSiteId) return;
    const panel = document.getElementById('exportPanel');
    panel.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Đang kiểm tra...</p></div>';

    try {
      const resp = await fetch(`${API}/export/${currentSiteId}/preview`);
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      this.previewData = data;
      this.render(data);
    } catch (err) {
      panel.innerHTML = `<div class="empty-state"><p>❌ ${err.message}</p></div>`;
    }
  },

  render(data) {
    const panel = document.getElementById('exportPanel');

    const isReady = data.ready;
    const statusColor = isReady ? '#22c55e' : '#eab308';
    const statusText = isReady ? '✅ Sẵn sàng export' : '⚠️ Cần crawl trước';

    panel.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
        <!-- Site Info Card -->
        <div class="form-card">
          <h3 style="font-size:14px;font-weight:600;color:var(--text-main);margin-bottom:16px">📦 Thông Tin Website</h3>
          <div style="display:grid;gap:12px">
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--text-muted)">Tên</span>
              <strong>${data.site.name}</strong>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--text-muted)">URL gốc</span>
              <a href="${data.site.url}" target="_blank" style="color:var(--accent);font-size:12px">${data.site.url.substring(0, 40)}...</a>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--text-muted)">Số trang</span>
              <strong style="color:var(--accent)">${data.pages}</strong>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--text-muted)">Editable fields</span>
              <strong>${data.fields}</strong>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--text-muted)">Hình ảnh</span>
              <strong>${data.media}</strong>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--text-muted)">Kích thước ước tính</span>
              <strong>${data.estimatedSize}</strong>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--text-muted)">Trạng thái</span>
              <strong style="color:${statusColor}">${statusText}</strong>
            </div>
          </div>
        </div>

        <!-- Deploy Options Card -->
        <div class="form-card">
          <h3 style="font-size:14px;font-weight:600;color:var(--text-main);margin-bottom:16px">🚀 Hướng Dẫn Deploy</h3>
          <div style="display:grid;gap:10px">
            <div style="padding:10px;background:var(--bg-secondary);border-radius:8px;border-left:3px solid #8b84ff">
              <div style="font-weight:600;font-size:12px;color:#8b84ff;margin-bottom:4px">🌐 Netlify (Nhanh nhất)</div>
              <div style="font-size:12px;color:var(--text-muted)">Kéo thả thư mục ZIP vào netlify.com/drop</div>
            </div>
            <div style="padding:10px;background:var(--bg-secondary);border-radius:8px;border-left:3px solid #22c55e">
              <div style="font-weight:600;font-size:12px;color:#22c55e;margin-bottom:4px">⚡ XAMPP / Apache</div>
              <div style="font-size:12px;color:var(--text-muted)">Copy vào htdocs/ hoặc www/ folder</div>
            </div>
            <div style="padding:10px;background:var(--bg-secondary);border-radius:8px;border-left:3px solid #4fc3f7">
              <div style="font-weight:600;font-size:12px;color:#4fc3f7;margin-bottom:4px">🐙 GitHub Pages</div>
              <div style="font-size:12px;color:var(--text-muted)">Push vào GitHub repo, bật Pages</div>
            </div>
            <div style="padding:10px;background:var(--bg-secondary);border-radius:8px;border-left:3px solid #f59e0b">
              <div style="font-weight:600;font-size:12px;color:#f59e0b;margin-bottom:4px">▲ Vercel</div>
              <div style="font-size:12px;color:var(--text-muted)">vercel deploy hoặc drag & drop</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Settings Panel -->
      <div class="form-card" style="margin-bottom:24px">
        <h3 style="font-size:14px;font-weight:600;color:var(--text-main);margin-bottom:16px">⚙️ Cấu Hình Xuất (Export Settings)</h3>
        <div style="display:grid;gap:12px;text-align:left;">
          <div>
            <label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text-muted)">Chế Độ Dựng (Export Mode)</label>
            <select id="exportMode" class="form-input" style="width:100%;padding:10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:var(--bg-secondary);color:#fff">
              <option value="php">PHP Dynamic (Khuyên dùng cho XAMPP / CPANEL)</option>
              <option value="html">Static HTML (Thuần tĩnh cho Netlify / Vercel)</option>
            </select>
          </div>
          <div>
            <label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text-muted)">Base URL Tương Đối (Dành cho PHP)</label>
            <input type="text" id="exportBaseUrl" class="form-input" style="width:100%;padding:10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:var(--bg-secondary);color:#fff" value="/${data.site.slug}/">
            <small style="font-size:11px;color:#999;display:block;margin-top:6px">Thư mục trên localhost. VD: /ten-du-an/</small>
          </div>
        </div>
      </div>

      <!-- Export Button Area -->
      <div class="form-card" style="text-align:center;padding:32px">
        <div style="font-size:48px;margin-bottom:16px">📦</div>
        <h2 style="font-size:20px;margin-bottom:8px">Tải Xuống ZIP</h2>
        <p style="color:var(--text-muted);margin-bottom:24px">
          Bao gồm ${data.pages} trang HTML với nội dung đã chỉnh sửa, CSS, JS, và hình ảnh
        </p>
        ${isReady ? `
          <button class="btn btn-primary" onclick="Export.download()" id="exportBtn" style="padding:14px 32px;font-size:16px">
            <svg viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Tải Xuống ZIP
          </button>
          <p style="font-size:12px;color:var(--text-muted);margin-top:12px">
            Kích thước ước tính: ${data.estimatedSize}
          </p>
        ` : `
          <div style="color:var(--yellow);font-size:14px">
            ⚠️ Website chưa sẵn sàng. Hãy crawl website trước.
          </div>
          <button class="btn btn-ghost" onclick="App.navigate('new')" style="margin-top:16px">
            Đi đến Crawl
          </button>
        `}
      </div>

      <!-- Crawl Settings Reminder -->
      <div style="margin-top:16px;padding:14px;background:rgba(139,132,255,0.08);border:1px solid rgba(139,132,255,0.2);border-radius:10px">
        <p style="font-size:12px;color:var(--text-muted);margin:0">
          💡 <strong style="color:var(--accent)">Lưu ý:</strong> 
          File ZIP sẽ chứa nội dung đã được chỉnh sửa từ Visual Editor. 
          Các link nội bộ giữa các trang được tự động chuyển đổi sang định dạng tĩnh (relative links).
          Nên lưu checkpoint trước khi export.
        </p>
      </div>
    `;
  },

  async download() {
    if (!currentSiteId) return;
    const btn = document.getElementById('exportBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px"></div> Đang tạo ZIP...';
    }

    const modeObj = document.getElementById('exportMode');
    const baseUrlObj = document.getElementById('exportBaseUrl');
    const modeStr = modeObj ? modeObj.value : 'php';
    const baseUrlStr = baseUrlObj ? encodeURIComponent(baseUrlObj.value) : encodeURIComponent(`/${currentSiteId}/`);

    try {
      // Tạo link download
      const link = document.createElement('a');
      link.href = `${API}/export/${currentSiteId}?mode=${modeStr}&base_url=${baseUrlStr}`;
      link.download = `website-export-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      Toast.success('✅ Đang tải xuống...');
    } catch (err) {
      Toast.error('Lỗi export: ' + err.message);
    } finally {
      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Tải Xuống ZIP';
        }
      }, 3000);
    }
  }
};
