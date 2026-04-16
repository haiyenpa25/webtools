/**
 * WebTools CMS — i18n Manager Module
 * Quản lý đa ngôn ngữ: thêm ngôn ngữ, dịch, xem trước, xuất file
 */

const I18n = (() => {
  let currentSiteId = null;
  let currentSiteSlug = null;
  let siteLanguages = [];
  let supportedLanguages = [];
  let currentLangFilter = null;
  let allFields = [];
  let translationCache = {};
  let translateJobId = null;
  let translateJobTimer = null;

  // ─────────────────────────────────────────────────────────────
  //  INIT
  // ─────────────────────────────────────────────────────────────

  async function init(siteId, siteSlug) {
    currentSiteId = siteId;
    currentSiteSlug = siteSlug;
    await loadSupportedLanguages();
    await renderView();
  }

  async function loadSupportedLanguages() {
    try {
      const r = await fetch('/api/i18n/languages/supported');
      supportedLanguages = await r.json();
    } catch (e) {
      supportedLanguages = [];
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  MAIN RENDER
  // ─────────────────────────────────────────────────────────────

  async function renderView() {
    const container = document.getElementById('i18nView');
    if (!container) return;
    container.innerHTML = `<div class="i18n-loading"><div class="spinner"></div><p>Đang tải dữ liệu...</p></div>`;

    try {
      const [stats, langs] = await Promise.all([
        fetch(`/api/i18n/${currentSiteId}/stats`).then(r => r.json()),
        fetch(`/api/i18n/${currentSiteId}/languages`).then(r => r.json())
      ]);

      siteLanguages = langs;
      const sourceLang = langs.find(l => l.is_source) || langs[0];

      container.innerHTML = `
        <!-- Overview stats -->
        <div class="i18n-stats-row">
          <div class="i18n-stat-card">
            <div class="i18n-stat-icon">📝</div>
            <div class="i18n-stat-body">
              <div class="i18n-stat-num">${stats.total_fields}</div>
              <div class="i18n-stat-label">Trường văn bản</div>
            </div>
          </div>
          <div class="i18n-stat-card">
            <div class="i18n-stat-icon">🌐</div>
            <div class="i18n-stat-body">
              <div class="i18n-stat-num">${langs.length}</div>
              <div class="i18n-stat-label">Ngôn ngữ</div>
            </div>
          </div>
          <div class="i18n-stat-card">
            <div class="i18n-stat-icon">✅</div>
            <div class="i18n-stat-body">
              <div class="i18n-stat-num">${stats.languages.reduce((s, l) => s + (l.approved || 0), 0)}</div>
              <div class="i18n-stat-label">Đã duyệt</div>
            </div>
          </div>
          <div class="i18n-stat-card accent">
            <div class="i18n-stat-icon">🤖</div>
            <div class="i18n-stat-body">
              <div class="i18n-stat-num">${stats.languages.reduce((s, l) => s + (l.translated || 0), 0)}</div>
              <div class="i18n-stat-label">Tổng đã dịch</div>
            </div>
          </div>
        </div>

        <!-- Language cards -->
        <div class="i18n-section">
          <div class="i18n-section-header">
            <h3 class="i18n-section-title">
              <span class="i18n-section-icon">🗂️</span>
              Ngôn ngữ đã cấu hình
            </h3>
            <button class="btn btn-primary btn-sm" onclick="I18n.showAddLanguageModal()">
              <svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              Thêm Ngôn Ngữ
            </button>
          </div>

          ${langs.length === 0 ? `
            <div class="i18n-empty">
              <div class="i18n-empty-icon">🌍</div>
              <h4>Chưa có ngôn ngữ nào</h4>
              <p>Hãy thêm ngôn ngữ nguồn (ngôn ngữ gốc của website) và các ngôn ngữ đích cần dịch.</p>
              <button class="btn btn-primary" onclick="I18n.showAddLanguageModal()">Bắt Đầu</button>
            </div>
          ` : `
            <div class="i18n-lang-grid">
              ${stats.languages.map(l => renderLangCard(l, sourceLang)).join('')}
            </div>
          `}
        </div>

        <!-- Translation Editor -->
        ${langs.filter(l => !l.is_source).length > 0 ? `
        <div class="i18n-section">
          <div class="i18n-section-header">
            <h3 class="i18n-section-title">
              <span class="i18n-section-icon">✏️</span>
              Bảng Biên Dịch
            </h3>
            <div style="display:flex;gap:8px;align-items:center">
              <select class="form-input" style="width:160px;height:36px;font-size:13px" id="i18nLangSelector" onchange="I18n.onLangChange(this.value)">
                <option value="">— Chọn ngôn ngữ đích —</option>
                ${langs.filter(l => !l.is_source).map(l => `
                  <option value="${l.lang_code}">${l.flag || ''} ${l.lang_name}</option>
                `).join('')}
              </select>
            </div>
          </div>
          <div id="i18nTranslationPanel">
            <div class="i18n-select-lang-hint">
              <span>👆</span> Chọn ngôn ngữ để bắt đầu chỉnh sửa bản dịch
            </div>
          </div>
        </div>
        ` : ''}
      `;

    } catch (err) {
      container.innerHTML = `<div class="i18n-error">❌ Lỗi tải dữ liệu: ${err.message}</div>`;
    }
  }

  function renderLangCard(lang, sourceLang) {
    const isSource = lang.is_source;
    const percent = lang.percent || 0;
    const barColor = percent === 100 ? '#4ade80' : percent >= 50 ? '#facc15' : '#60a5fa';

    return `
      <div class="i18n-lang-card ${isSource ? 'source' : ''}">
        <div class="i18n-lang-card-header">
          <div class="i18n-lang-flag">${lang.flag || '🌐'}</div>
          <div class="i18n-lang-info">
            <div class="i18n-lang-name">${lang.lang_name}</div>
            <div class="i18n-lang-code">${lang.lang_code}</div>
          </div>
          ${isSource ? '<span class="i18n-badge source">NGUỒN</span>' : ''}
        </div>

        ${!isSource ? `
          <div class="i18n-progress-block">
            <div class="i18n-progress-label">
              <span>${lang.translated || 0} / ${lang.total || 0} đã dịch</span>
              <span class="i18n-percent" style="color:${barColor}">${percent}%</span>
            </div>
            <div class="i18n-progress-bar">
              <div class="i18n-progress-fill" style="width:${percent}%;background:${barColor}"></div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
              ✅ ${lang.approved || 0} đã duyệt
            </div>
          </div>

          <div class="i18n-lang-actions">
            <button class="btn btn-ghost btn-xs" onclick="I18n.selectLangForEdit('${lang.lang_code}')" title="Chỉnh sửa bản dịch">
              ✏️ Biên dịch
            </button>
            <button class="btn btn-ghost btn-xs" onclick="I18n.showAutoTranslate('${lang.lang_code}', '${sourceLang?.lang_code || 'vi'}')" title="Dịch tự động AI">
              🤖 Tự động
            </button>
            <button class="btn btn-ghost btn-xs" onclick="I18n.previewLang('${lang.lang_code}')" title="Xem trước">
              👁️ Preview
            </button>
            <button class="btn btn-ghost btn-xs" onclick="I18n.exportLang('${lang.lang_code}')" title="Xuất file">
              📦 Xuất
            </button>
          </div>
        ` : `
          <div class="i18n-source-note">
            Đây là ngôn ngữ gốc của website. Tất cả bản dịch đều dựa trên ngôn ngữ này.
          </div>
          <div class="i18n-lang-actions">
            <button class="btn btn-ghost btn-xs" onclick="I18n.exportAllLangs()" title="Xuất tất cả ngôn ngữ">
              📦 Xuất Tất Cả
            </button>
          </div>
        `}

        ${!isSource ? `
          <button class="i18n-delete-btn" onclick="I18n.removeLang('${lang.lang_code}', '${lang.lang_name}')" title="Xóa ngôn ngữ này">×</button>
        ` : ''}
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  //  ADD LANGUAGE MODAL
  // ─────────────────────────────────────────────────────────────

  function showAddLanguageModal() {
    const added = siteLanguages.map(l => l.lang_code);
    const available = supportedLanguages.filter(l => !added.includes(l.code));

    const html = `
      <div class="i18n-modal-overlay" id="i18nAddLangModal" onclick="if(event.target===this)I18n.closeModal('i18nAddLangModal')">
        <div class="i18n-modal">
          <div class="i18n-modal-header">
            <h3>Thêm Ngôn Ngữ</h3>
            <button class="btn-icon" onclick="I18n.closeModal('i18nAddLangModal')">✕</button>
          </div>
          <div class="i18n-modal-body">
            ${siteLanguages.length === 0 ? `
              <div class="i18n-alert info">
                💡 Hãy thêm ngôn ngữ nguồn trước — đây là ngôn ngữ gốc của website (thường là Tiếng Việt).
              </div>
            ` : ''}
            <div class="i18n-lang-picker">
              ${available.map(l => `
                <button class="i18n-lang-pick-btn" onclick="I18n.confirmAddLang('${l.code}', '${l.name}', '${l.flag}')">
                  <span class="i18n-pick-flag">${l.flag}</span>
                  <span class="i18n-pick-name">${l.name}</span>
                  <span class="i18n-pick-code">${l.code}</span>
                </button>
              `).join('')}
            </div>
            ${available.length === 0 ? '<p style="text-align:center;color:var(--text-muted)">Đã thêm tất cả ngôn ngữ hỗ trợ.</p>' : ''}
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    requestAnimationFrame(() => {
      const modal = document.getElementById('i18nAddLangModal');
      if (modal) modal.style.opacity = '1';
    });
  }

  async function confirmAddLang(code, name, flag) {
    const isFirst = siteLanguages.length === 0;
    const isSource = isFirst || confirm(`Đặt "${name}" làm ngôn ngữ nguồn (gốc)?`);

    try {
      const r = await fetch(`/api/i18n/${currentSiteId}/languages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang_code: code, is_source: isSource })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);

      closeModal('i18nAddLangModal');
      showToast(`Đã thêm ${flag} ${name}${isSource ? ' (ngôn ngữ nguồn)' : ''}`, 'success');
      await renderView();
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  }

  async function removeLang(code, name) {
    if (!confirm(`Xóa ngôn ngữ "${name}"? Tất cả bản dịch của ngôn ngữ này sẽ bị xóa.`)) return;

    try {
      const r = await fetch(`/api/i18n/${currentSiteId}/languages/${code}`, { method: 'DELETE' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);

      showToast(`Đã xóa ngôn ngữ ${name}`, 'success');
      await renderView();
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  TRANSLATION EDITOR
  // ─────────────────────────────────────────────────────────────

  function onLangChange(langCode) {
    if (!langCode) {
      document.getElementById('i18nTranslationPanel').innerHTML = `
        <div class="i18n-select-lang-hint"><span>👆</span> Chọn ngôn ngữ để bắt đầu chỉnh sửa bản dịch</div>
      `;
      return;
    }
    selectLangForEdit(langCode, true);
  }

  async function selectLangForEdit(langCode, fromSelector = false) {
    if (!fromSelector) {
      // Scroll xuống bảng và set selector
      const sel = document.getElementById('i18nLangSelector');
      if (sel) {
        sel.value = langCode;
        document.getElementById('i18nTranslationPanel')?.scrollIntoView({ behavior: 'smooth' });
      }
    }

    currentLangFilter = langCode;
    const panel = document.getElementById('i18nTranslationPanel');
    if (!panel) return;

    panel.innerHTML = `<div class="i18n-loading"><div class="spinner"></div><p>Đang tải bản dịch...</p></div>`;

    try {
      const langMeta = siteLanguages.find(l => l.lang_code === langCode);
      const sourceLang = siteLanguages.find(l => l.is_source);

      const fields = await fetch(`/api/i18n/${currentSiteId}/fields?lang=${langCode}`).then(r => r.json());
      allFields = fields;

      // Group theo page
      const pageGroups = {};
      fields.forEach(f => {
        const key = f.page_id || 'unknown';
        if (!pageGroups[key]) pageGroups[key] = { title: f.page_title || 'Trang không rõ', path: f.page_path, fields: [] };
        pageGroups[key].fields.push(f);
      });

      const totalFields = fields.length;
      const translated = fields.filter(f => f.translation?.translated_value).length;
      const approved = fields.filter(f => f.translation?.is_approved).length;
      const percent = totalFields > 0 ? Math.round((translated / totalFields) * 100) : 0;

      panel.innerHTML = `
        <div class="i18n-editor-toolbar">
          <div class="i18n-editor-lang">
            <span style="font-size:22px">${langMeta?.flag || '🌐'}</span>
            <div>
              <div style="font-weight:600;font-size:15px">${langMeta?.lang_name || langCode}</div>
              <div style="font-size:12px;color:var(--text-muted)">${translated}/${totalFields} đã dịch · ${approved} đã duyệt</div>
            </div>
          </div>
          <div class="i18n-editor-progress">
            <div class="i18n-progress-bar" style="width:200px">
              <div class="i18n-progress-fill" style="width:${percent}%;background:${percent===100?'#4ade80':percent>=50?'#facc15':'#60a5fa'}"></div>
            </div>
            <span style="font-size:13px;font-weight:600">${percent}%</span>
          </div>
          <div class="i18n-editor-actions">
            <button class="btn btn-ghost btn-sm" onclick="I18n.showAutoTranslate('${langCode}','${sourceLang?.lang_code||'vi'}')">
              🤖 Tự Động Dịch
            </button>
            <button class="btn btn-ghost btn-sm" onclick="I18n.previewLang('${langCode}')">
              👁️ Xem Trước
            </button>
            <button class="btn btn-primary btn-sm" onclick="I18n.exportLang('${langCode}')">
              📦 Xuất File
            </button>
          </div>
        </div>

        <div class="i18n-editor-legend">
          <span class="i18n-status-dot auto"></span> Dịch tự động
          <span class="i18n-status-dot approved" style="margin-left:12px"></span> Đã duyệt
          <span class="i18n-status-dot missing" style="margin-left:12px"></span> Chưa dịch
        </div>

        <div class="i18n-translation-table">
          <div class="i18n-table-head">
            <div>NGUỒN <span style="opacity:.5;font-weight:400">(${sourceLang?.flag||''} ${sourceLang?.lang_name||''})</span></div>
            <div>BẢN DỊCH <span style="opacity:.5;font-weight:400">(${langMeta?.flag||''} ${langMeta?.lang_name||''})</span></div>
            <div>TRẠNG THÁI</div>
          </div>
          ${Object.entries(pageGroups).map(([pageId, group]) => `
            <div class="i18n-page-group">
              <div class="i18n-page-label">
                <svg viewBox="0 0 24 24" width="13" height="13" style="margin-right:5px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                ${group.title} <span class="i18n-page-path">${group.path || ''}</span>
                <span class="i18n-page-count">${group.fields.length} trường</span>
              </div>
              ${group.fields.map(f => renderFieldRow(f, langCode)).join('')}
            </div>
          `).join('')}
        </div>
      `;

    } catch (err) {
      panel.innerHTML = `<div class="i18n-error">❌ ${err.message}</div>`;
    }
  }

  function renderFieldRow(field, langCode) {
    const t = field.translation;
    const hasTranslation = !!(t?.translated_value);
    const isAuto = t?.is_auto;
    const isApproved = t?.is_approved;

    const statusClass = isApproved ? 'approved' : (hasTranslation ? (isAuto ? 'auto' : 'manual') : 'missing');
    const statusLabel = isApproved ? '✓ Đã duyệt' : (hasTranslation ? (isAuto ? '🤖 Tự động' : '✏️ Thủ công') : '— Chưa dịch');

    // Truncate source text dài
    const sourceText = (field.current_value || '').replace(/<[^>]+>/g, '').substring(0, 120);
    const translatedText = (t?.translated_value || '').replace(/<[^>]+>/g, '').substring(0, 120);

    return `
      <div class="i18n-field-row" id="row_${field.field_id}">
        <div class="i18n-source-cell">
          <div class="i18n-tag-badge">${field.tag}</div>
          <div class="i18n-source-text" title="${escapeAttr(field.current_value || '')}">${escapeHtml(sourceText)}${field.current_value?.length > 120 ? '…' : ''}</div>
        </div>
        <div class="i18n-translate-cell">
          <textarea class="i18n-translate-input" 
            id="input_${field.field_id}"
            placeholder="Nhập bản dịch..."
            rows="2"
            onblur="I18n.saveField('${field.field_id}','${langCode}',${field.page_id})"
            >${escapeHtml(t?.translated_value || '')}</textarea>
        </div>
        <div class="i18n-status-cell">
          <span class="i18n-status-badge ${statusClass}">${statusLabel}</span>
          ${hasTranslation && !isApproved ? `
            <button class="i18n-approve-btn" onclick="I18n.approveField('${field.field_id}','${langCode}',${field.page_id})" title="Duyệt bản dịch này">✓</button>
          ` : ''}
        </div>
      </div>
    `;
  }

  async function saveField(fieldId, langCode, pageId) {
    const input = document.getElementById(`input_${fieldId}`);
    if (!input) return;

    const value = input.value.trim();
    if (!value) return;

    try {
      await fetch(`/api/i18n/${currentSiteId}/translations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_id: fieldId, lang_code: langCode, value, page_id: pageId })
      });

      // Cập nhật status row
      const row = document.getElementById(`row_${fieldId}`);
      if (row) {
        const badge = row.querySelector('.i18n-status-badge');
        if (badge) {
          badge.className = 'i18n-status-badge manual';
          badge.textContent = '✏️ Thủ công';
        }
      }
    } catch (err) {
      console.error('Save translation error:', err);
    }
  }

  async function approveField(fieldId, langCode, pageId) {
    const input = document.getElementById(`input_${fieldId}`);
    const value = input?.value?.trim();
    if (!value) return showToast('Hãy nhập bản dịch trước', 'warning');

    try {
      await fetch(`/api/i18n/${currentSiteId}/translations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_id: fieldId, lang_code: langCode, value, page_id: pageId, approved: true })
      });

      const row = document.getElementById(`row_${fieldId}`);
      if (row) {
        const badge = row.querySelector('.i18n-status-badge');
        if (badge) {
          badge.className = 'i18n-status-badge approved';
          badge.textContent = '✓ Đã duyệt';
        }
        const btn = row.querySelector('.i18n-approve-btn');
        if (btn) btn.remove();
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  AUTO TRANSLATE
  // ─────────────────────────────────────────────────────────────

  function showAutoTranslate(toLang, fromLang) {
    const fromMeta = supportedLanguages.find(l => l.code === fromLang) || { name: fromLang, flag: '🌐' };
    const toMeta = supportedLanguages.find(l => l.code === toLang) || { name: toLang, flag: '🌐' };

    const html = `
      <div class="i18n-modal-overlay" id="i18nAutoTranslateModal" onclick="if(event.target===this)I18n.closeModal('i18nAutoTranslateModal')">
        <div class="i18n-modal" style="max-width:480px">
          <div class="i18n-modal-header">
            <h3>🤖 Dịch Tự Động</h3>
            <button class="btn-icon" onclick="I18n.closeModal('i18nAutoTranslateModal')">✕</button>
          </div>
          <div class="i18n-modal-body">
            <div class="i18n-auto-pair">
              <div class="i18n-auto-lang">
                <div class="i18n-auto-flag">${fromMeta.flag}</div>
                <div>${fromMeta.name}</div>
              </div>
              <div class="i18n-auto-arrow">→</div>
              <div class="i18n-auto-lang">
                <div class="i18n-auto-flag">${toMeta.flag}</div>
                <div>${toMeta.name}</div>
              </div>
            </div>
            <div class="i18n-alert info" style="margin:16px 0">
              🌐 Sử dụng MyMemory Translation API (miễn phí, không cần API key).
              Bản dịch tự động sẽ cần được review và chỉnh sửa thủ công để đạt chất lượng tốt nhất.
            </div>
            <div id="autoTransProgress" style="display:none">
              <div class="progress-bar-wrap" style="margin-bottom:12px">
                <div class="progress-bar" id="autoTransBar" style="width:0%;transition:width .3s"></div>
              </div>
              <p class="progress-message" id="autoTransMsg">Đang khởi động...</p>
              <div id="autoTransStats" style="display:flex;gap:16px;font-size:12px;color:var(--text-muted);margin-top:8px"></div>
            </div>
            <div id="autoTransResult" style="display:none"></div>
          </div>
          <div class="i18n-modal-footer" id="autoTransFooter">
            <span style="font-size:12px;color:var(--text-muted)">Có thể mất vài phút tùy số lượng trường</span>
            <div style="display:flex;gap:8px">
              <button class="btn btn-ghost" onclick="I18n.closeModal('i18nAutoTranslateModal')">Hủy</button>
              <button class="btn btn-primary" id="autoTransStartBtn" onclick="I18n.startAutoTranslate('${fromLang}','${toLang}')">
                🚀 Bắt Đầu Dịch
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    requestAnimationFrame(() => {
      const modal = document.getElementById('i18nAutoTranslateModal');
      if (modal) modal.style.opacity = '1';
    });
  }

  async function startAutoTranslate(fromLang, toLang) {
    const btn = document.getElementById('autoTransStartBtn');
    const footer = document.getElementById('autoTransFooter');
    const progressEl = document.getElementById('autoTransProgress');
    const progressBar = document.getElementById('autoTransBar');
    const progressMsg = document.getElementById('autoTransMsg');
    const statsEl = document.getElementById('autoTransStats');

    if (btn) btn.disabled = true;
    if (progressEl) progressEl.style.display = 'block';

    try {
      const r = await fetch(`/api/i18n/${currentSiteId}/auto-translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_lang: fromLang, to_lang: toLang })
      });
      const { jobId } = await r.json();
      translateJobId = jobId;

      // Poll trạng thái
      translateJobTimer = setInterval(async () => {
        try {
          const status = await fetch(`/api/i18n/translate-status/${jobId}`).then(r => r.json());

          if (progressBar) progressBar.style.width = (status.progress || 0) + '%';
          if (progressMsg) progressMsg.textContent = status.message || '';
          if (statsEl && status.done !== undefined) {
            statsEl.innerHTML = `
              <span>Đã xử lý: <b>${status.done || 0}</b></span>
              <span>Thành công: <b style="color:#4ade80">${status.successCount || 0}</b></span>
              <span>Bỏ qua: <b>${status.skipCount || 0}</b></span>
            `;
          }

          if (status.status === 'done' || status.progress >= 100) {
            clearInterval(translateJobTimer);

            const resultEl = document.getElementById('autoTransResult');
            if (resultEl) {
              resultEl.style.display = 'block';
              resultEl.innerHTML = `
                <div class="i18n-alert success">
                  ✅ Hoàn tất! Đã dịch thành công <b>${status.successCount || 0}</b> trường văn bản.
                </div>
              `;
            }
            if (footer) footer.innerHTML = `
              <div></div>
              <button class="btn btn-primary" onclick="I18n.closeModal('i18nAutoTranslateModal');I18n.selectLangForEdit('${toLang}')">
                Xem Kết Quả →
              </button>
            `;

            // Refresh view
            await renderView();
          } else if (status.status === 'error') {
            clearInterval(translateJobTimer);
            if (progressMsg) progressMsg.textContent = '❌ ' + status.message;
            if (btn) { btn.disabled = false; btn.textContent = '🔄 Thử Lại'; }
          }
        } catch (e) {
          console.warn('Poll error:', e);
        }
      }, 1200);

    } catch (err) {
      showToast('Lỗi khởi động: ' + err.message, 'error');
      if (btn) btn.disabled = false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  PREVIEW & EXPORT
  // ─────────────────────────────────────────────────────────────

  function previewLang(langCode) {
    const sourceLang = siteLanguages.find(l => l.is_source);
    // Lấy trang home
    const firstPage = allFields[0];
    if (!firstPage) {
      // Nếu chưa load fields, fetch pages
      fetch(`/api/sites/${currentSiteId}/pages`).then(r => r.json()).then(pages => {
        const home = pages.find(p => p.is_home) || pages[0];
        if (home) openPreview(langCode, home.id);
      });
      return;
    }
    openPreview(langCode, firstPage.page_id);
  }

  function openPreview(langCode, pageId) {
    const url = `/api/i18n/${currentSiteId}/preview/${langCode}/${pageId}`;
    const win = window.open('', '_blank', 'width=1200,height=800');
    win.document.write(`
      <!DOCTYPE html><html><head><title>Preview ${langCode}</title>
      <style>body{margin:0;background:#111;display:flex;flex-direction:column;height:100vh}
      .preview-bar{background:#1a1a2e;color:#fff;padding:10px 20px;display:flex;align-items:center;gap:12px;font-family:Inter,sans-serif;font-size:13px}
      iframe{flex:1;border:none;background:#fff}</style></head>
      <body>
      <div class="preview-bar">
        🌐 Preview — ${langCode.toUpperCase()} | ${url}
        <a href="${url}" target="_blank" style="color:#60a5fa;margin-left:auto">Mở tab mới ↗</a>
      </div>
      <iframe src="${url}"></iframe>
      </body></html>
    `);
    win.document.close();
  }

  async function exportLang(langCode) {
    const langMeta = siteLanguages.find(l => l.lang_code === langCode);
    showToast(`Đang tạo file xuất cho ${langMeta?.lang_name || langCode}...`, 'info');
    window.location.href = `/api/i18n/${currentSiteId}/export?langs=${langCode}`;
  }

  async function exportAllLangs() {
    const targetLangs = siteLanguages.map(l => l.lang_code).join(',');
    showToast(`Đang tạo file xuất cho ${siteLanguages.length} ngôn ngữ...`, 'info');
    window.location.href = `/api/i18n/${currentSiteId}/export?langs=${targetLangs}`;
  }

  // ─────────────────────────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────────────────────────

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
    if (translateJobTimer) {
      clearInterval(translateJobTimer);
      translateJobTimer = null;
    }
  }

  function showToast(msg, type = 'info') {
    if (window.App?.showToast) return window.App.showToast(msg, type);
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, ' ');
  }

  // ─────────────────────────────────────────────────────────────
  //  PUBLIC API
  // ─────────────────────────────────────────────────────────────

  return {
    init,
    renderView,
    showAddLanguageModal,
    confirmAddLang,
    removeLang,
    onLangChange,
    selectLangForEdit,
    saveField,
    approveField,
    showAutoTranslate,
    startAutoTranslate,
    previewLang,
    exportLang,
    exportAllLangs,
    closeModal
  };
})();
