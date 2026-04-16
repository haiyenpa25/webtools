/**
 * cms-visual-editor.js
 * Script được inject vào trang crawl khi mở ở Edit Mode
 * Cung cấp click-to-edit overlay cho từng element
 */
(function() {
  'use strict';

  const { siteId, pageId, apiBase } = window.CMS_CONFIG || {};
  if (!siteId) return;

  // =========================================
  // TOOLBAR
  // =========================================
  function createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'cms-toolbar';
    toolbar.innerHTML = `
      <div class="cms-toolbar-left">
        <div class="cms-logo">⚡ WebTools<span>CMS</span></div>
        <span class="cms-badge">EDIT MODE</span>
        <span class="cms-field-info" id="cmsFieldInfo">Di chuột vào nội dung để chỉnh sửa</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-cancel" onclick="window.parent.VisualEditor && window.parent.VisualEditor.close()">✕ Đóng</button>
      </div>
    `;
    document.body.insertBefore(toolbar, document.body.firstChild);
    document.body.classList.add('cms-edit-mode');
  }

  // =========================================
  // INLINE TEXT EDITOR
  // =========================================
  let activeElement = null;
  let editorPanel = null;

  function createEditorPanel() {
    const panel = document.createElement('div');
    panel.id = 'cms-inline-editor';
    panel.innerHTML = `
      <div class="editor-header">
        <span id="editorFieldLabel">TEXT</span>
        <span id="editorFieldId" style="color:#4a4d5e;font-size:10px"></span>
      </div>
      <div class="editor-body">
        <textarea id="editorTextarea" placeholder="Nhập nội dung..."></textarea>
      </div>
      <div class="editor-footer">
        <button class="editor-cancel" onclick="CmsEditor.cancel()">Hủy</button>
        <button class="editor-save" onclick="CmsEditor.save()">✓ Lưu</button>
      </div>
    `;
    panel.style.display = 'none';
    document.body.appendChild(panel);
    return panel;
  }

  function positionPanel(el, panel) {
    const rect = el.getBoundingClientRect();
    const scrollTop = window.scrollY;
    const scrollLeft = window.scrollX;

    let top = rect.bottom + scrollTop + 8;
    let left = rect.left + scrollLeft;

    // Prevent going off-screen
    const panelWidth = 320;
    if (left + panelWidth > window.innerWidth) {
      left = window.innerWidth - panelWidth - 16;
    }

    if (top + 200 > window.innerHeight + scrollTop) {
      top = rect.top + scrollTop - 210;
    }

    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
    panel.style.display = 'block';
  }

  function openEditor(el) {
    if (activeElement) closeEditor(false);

    const fieldId = el.getAttribute('data-cms-field-id');
    const fieldType = el.getAttribute('data-cms-type');

    // Images are handled separately
    if (fieldType === 'image') {
      openImageEditor(el, fieldId);
      return;
    }

    activeElement = el;
    el.classList.add('cms-active');

    if (!editorPanel) editorPanel = createEditorPanel();

    // Populate
    const label = fieldType === 'html' ? 'HTML' : el.tagName;
    document.getElementById('editorFieldLabel').textContent = label;
    document.getElementById('editorFieldId').textContent = fieldId;

    const currentText = fieldType === 'html' ? el.innerHTML : el.textContent;
    document.getElementById('editorTextarea').value = currentText;

    // Position panel near element
    positionPanel(el, editorPanel);

    // Update field info
    const info = document.getElementById('cmsFieldInfo');
    if (info) info.textContent = `Đang sửa: ${fieldId}`;

    setTimeout(() => document.getElementById('editorTextarea').focus(), 50);
  }

  function closeEditor(cancel = true) {
    if (activeElement) {
      activeElement.classList.remove('cms-active');
      activeElement = null;
    }
    if (editorPanel) editorPanel.style.display = 'none';
    const info = document.getElementById('cmsFieldInfo');
    if (info) info.textContent = 'Di chuột vào nội dung để chỉnh sửa';
  }

  async function saveEditor() {
    if (!activeElement) return;

    const fieldId = activeElement.getAttribute('data-cms-field-id');
    const fieldType = activeElement.getAttribute('data-cms-type');
    const newValue = document.getElementById('editorTextarea').value;

    // Optimistic UI update
    if (fieldType === 'html') {
      activeElement.innerHTML = newValue;
    } else {
      activeElement.textContent = newValue;
    }

    try {
      const resp = await fetch(`${apiBase}/sites/${siteId}/fields/${encodeURIComponent(fieldId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue })
      });

      if (!resp.ok) throw new Error('Save failed');

      // Flash success
      activeElement.classList.add('cms-saved');
      setTimeout(() => activeElement && activeElement.classList.remove('cms-saved'), 500);

      showToast('✅ Đã lưu!');
    } catch (err) {
      showToast('❌ Lỗi: ' + err.message);
    }

    closeEditor(false);
  }

  // =========================================
  // IMAGE EDITOR
  // =========================================
  function openImageEditor(el, fieldId) {
    // Trigger upload in parent window
    const currentSrc = el.getAttribute('src') || '';
    const fixedName = fieldId.replace(/^img_/, '');
    
    if (window.parent && window.parent.Media) {
      window.parent.Media.openUpload(currentSrc, fieldId);
    } else {
      // Fallback: file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async function() {
        if (!input.files[0]) return;
        const form = new FormData();
        form.append('image', input.files[0]);
        form.append('fixedName', fixedName.split('_').slice(0, -1).join('_') + '.jpg');

        const resp = await fetch(`${apiBase}/media/${siteId}/upload`, {
          method: 'POST',
          body: form
        });
        const data = await resp.json();
        if (data.url) {
          el.src = data.url + '?t=' + Date.now();
          showToast('✅ Ảnh đã được cập nhật!');
        }
      };
      input.click();
    }
  }

  // =========================================
  // TOAST
  // =========================================
  function showToast(msg) {
    let toast = document.getElementById('cms-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cms-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 2000);
  }

  // =========================================
  // GLOBAL API EXPOSED TO PANEL
  // =========================================
  window.CmsEditor = {
    save: saveEditor,
    cancel: () => closeEditor(true)
  };

  // =========================================
  // INIT: Attach click handlers
  // =========================================
  function init() {
    createToolbar();

    // Attach click to all editable elements
    document.querySelectorAll('[data-cms-editable]').forEach(el => {
      el.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        openEditor(this);
      });
    });

    // Click outside to close
    document.addEventListener('click', function(e) {
      if (editorPanel && !editorPanel.contains(e.target) && !e.target.hasAttribute('data-cms-editable')) {
        closeEditor(true);
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeEditor(true);
      if (e.key === 'Enter' && e.ctrlKey && activeElement) saveEditor();
    });

    console.log('🎨 CMS Visual Editor initialized. Click any element to edit.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
