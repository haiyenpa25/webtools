/**
 * cms-visual-editor.js
 * Script du?c inject vào trang crawl khi m? ? Edit Mode
 */
(function() {
  'use strict';

  const { siteId, pageId, apiBase } = window.CMS_CONFIG || {};
  if (!siteId) return;

  function createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'cms-toolbar';
    toolbar.innerHTML = `
      <div class="cms-toolbar-left">
        <div class="cms-logo">? WebTools<span>CMS</span></div>
        <span class="cms-badge">EDIT MODE</span>
        <span class="cms-field-info" id="cmsFieldInfo">Di chu?t vào n?i dung d? ch?nh s?a</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-cancel" style="background:var(--accent);color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer" onclick="CmsEditor.saveHtml()">?? Luu Mã Ngu?n (HTML)</button>
        <button class="btn-cancel" style="background:#dc3545;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer" onclick="window.parent.VisualEditor && window.parent.VisualEditor.close()">? Ðóng</button>
      </div>
    `;
    document.body.insertBefore(toolbar, document.body.firstChild);
    document.body.classList.add('cms-edit-mode');
  }

  let activeElement = null;
  let activeBlock = null;
  let editorPanel = null;
  let structPanel = null;

  function createEditorPanel() {
    const panel = document.createElement('div');
    panel.id = 'cms-inline-editor';
    panel.innerHTML = `
      <div class="editor-header" style="justify-content:space-between;display:flex;">
        <div>
          <span id="editorFieldLabel">TEXT</span>
          <span id="editorFieldId" style="color:#4a4d5e;font-size:10px"></span>
        </div>
        <div>
          <button style="border:none;background:rgba(108,99,255,0.1);color:#6c63ff;cursor:pointer;padding:2px 6px;border-radius:4px;font-size:11px" onclick="CmsEditor.selectParentBlock()">? S?a Kh?i</button>
        </div>
      </div>
      <div class="editor-body">
        <textarea id="editorTextarea" placeholder="Nh?p n?i dung..."></textarea>
      </div>
      <div class="editor-footer">
        <button class="editor-cancel" onclick="CmsEditor.cancel()">H?y</button>
        <button class="editor-save" onclick="CmsEditor.save()">? Luu Text</button>
      </div>
    `;
    panel.style.display = 'none';
    document.body.appendChild(panel);
    return panel;
  }

  function createStructPanel() {
    const panel = document.createElement('div');
    panel.id = 'cms-struct-editor';
    panel.style.cssText = 'position:absolute;z-index:999999;background:#1e1e2d;border:1px solid #6c63ff;border-radius:8px;padding:8px;display:none;gap:8px;box-shadow:0 10px 25px rgba(0,0,0,0.5);align-items:center';
    panel.innerHTML = `
      <span style="color:#fff;font-size:12px;font-weight:bold;margin-right:8px" id="structTagName">BLOCK</span>
      <button style="border:none;background:#2c2c3e;color:#fff;cursor:pointer;padding:6px 10px;border-radius:4px;font-size:12px;display:flex;align-items:center;gap:4px" onclick="CmsEditor.duplicateBlock()">?? Nhân B?n</button>
      <button style="border:none;background:#2c2c3e;color:#fff;cursor:pointer;padding:6px 10px;border-radius:4px;font-size:12px;display:flex;align-items:center;gap:4px" onclick="CmsEditor.hideBlock()">??? ?n</button>
      <button style="border:none;background:#dc3545;color:#fff;cursor:pointer;padding:6px 10px;border-radius:4px;font-size:12px;display:flex;align-items:center;gap:4px" onclick="CmsEditor.deleteBlock()">??? Xoá</button>
      <button style="border:none;background:transparent;color:#fff;cursor:pointer;padding:6px;font-size:14px;margin-left:4px" onclick="CmsEditor.closeStruct()">?</button>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  function positionPanel(el, panel) {
    const rect = el.getBoundingClientRect();
    const scrollTop = window.scrollY;
    const scrollLeft = window.scrollX;
    let top = rect.bottom + scrollTop + 8;
    let left = rect.left + scrollLeft;
    if (left + 320 > window.innerWidth) left = window.innerWidth - 336;
    if (top + 200 > window.innerHeight + scrollTop) top = rect.top + scrollTop - 210;
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
    panel.style.display = 'block';
  }

  function openEditor(el) {
    if (activeElement) closeEditor(false);
    if (activeBlock) closeStruct();

    const fieldId = el.getAttribute('data-cms-field-id');
    const fieldType = el.getAttribute('data-cms-type');

    if (fieldType === 'image') {
      if (window.parent && window.parent.Media) window.parent.Media.openUpload(el.getAttribute('src'), fieldId);
      return;
    }

    activeElement = el;
    el.classList.add('cms-active');
    if (!editorPanel) editorPanel = createEditorPanel();
    if (!structPanel) structPanel = createStructPanel();

    const label = fieldType === 'html' ? 'HTML' : el.tagName;
    document.getElementById('editorFieldLabel').textContent = label;
    document.getElementById('editorFieldId').textContent = fieldId;
    document.getElementById('editorTextarea').value = fieldType === 'html' ? el.innerHTML : el.textContent;

    positionPanel(el, editorPanel);
    setTimeout(() => document.getElementById('editorTextarea').focus(), 50);
  }

  function closeEditor(cancel = true) {
    if (activeElement) { activeElement.classList.remove('cms-active'); activeElement = null; }
    if (editorPanel) editorPanel.style.display = 'none';
  }

  async function saveEditor() {
    if (!activeElement) return;
    const fieldId = activeElement.getAttribute('data-cms-field-id');
    const fieldType = activeElement.getAttribute('data-cms-type');
    const newValue = document.getElementById('editorTextarea').value;

    if (fieldType === 'html') activeElement.innerHTML = newValue;
    else activeElement.textContent = newValue;

    try {
      const resp = await fetch(`${apiBase}/sites/${siteId}/fields/${encodeURIComponent(fieldId)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: newValue })
      });
      if (!resp.ok) throw new Error('Save failed');
      
      activeElement.classList.add('cms-saved');
      setTimeout(() => activeElement && activeElement.classList.remove('cms-saved'), 500);
      showToast('? Ðã luu Text!');
    } catch (err) { showToast('? L?i: ' + err.message); }
    closeEditor(false);
  }

  // STRUCTURAL EDITOR LOGIC
  function selectParentBlock() {
    if (!activeElement) return;
    closeEditor(false);
    
    // Find a structural parent: div, article, li, section
    let parent = activeElement.parentElement;
    while(parent && parent.tagName !== 'BODY' && !['DIV', 'LI', 'ARTICLE', 'SECTION', 'UL'].includes(parent.tagName)) {
      parent = parent.parentElement;
    }
    if (!parent || parent.tagName === 'BODY') parent = activeElement.parentElement;

    activeBlock = parent;
    activeBlock.classList.add('cms-block-active');
    
    document.getElementById('structTagName').textContent = `<${activeBlock.tagName.toLowerCase()}>`;
    
    const rect = activeBlock.getBoundingClientRect();
    structPanel.style.top = (rect.top + window.scrollY - 45) + 'px';
    structPanel.style.left = (rect.left + window.scrollX) + 'px';
    structPanel.style.display = 'flex';
  }

  function closeStruct() {
    if (activeBlock) { activeBlock.classList.remove('cms-block-active'); activeBlock = null; }
    if (structPanel) structPanel.style.display = 'none';
  }

  function duplicateBlock() {
    if (!activeBlock) return;
    const clone = activeBlock.cloneNode(true);
    // Remove active class from clone
    clone.classList.remove('cms-block-active');
    
    // If clone contains data-cms-field-id, we should technically clear them to let crawler re-detect?
    // Actually, keeping them is fine for structural. A new detection pass is triggered after "Save HTML".
    activeBlock.parentNode.insertBefore(clone, activeBlock.nextSibling);

    showToast('?? Ðã nhân b?n (Vui lòng Luu Mã Ngu?n HTML)');
    closeStruct();
  }

  function hideBlock() {
    if (!activeBlock) return;
    activeBlock.style.display = 'none';
    showToast('??? Ðã ?n (Luu HTML)');
    closeStruct();
  }

  function deleteBlock() {
    if (!activeBlock) return;
    if (confirm('B?n có ch?c xoá ph?n t? này kh?i HTML g?c?')) {
      activeBlock.remove();
      showToast('??? Ðã xoá (Luu HTML)');
      closeStruct();
    }
  }

  async function saveHtml() {
    // Clean up injected elements
    const clone = document.body.cloneNode(true);
    const tb = clone.querySelector('#cms-toolbar'); if (tb) tb.remove();
    const inline = clone.querySelector('#cms-inline-editor'); if (inline) inline.remove();
    const struct = clone.querySelector('#cms-struct-editor'); if (struct) struct.remove();
    const toast = clone.querySelector('#cms-toast'); if (toast) toast.remove();
    
    clone.classList.remove('cms-edit-mode');
    clone.querySelectorAll('.cms-active, .cms-block-active, .cms-saved').forEach(el => {
      el.classList.remove('cms-active', 'cms-block-active', 'cms-saved');
    });

    try {
      const resp = await fetch(`${apiBase}/sites/${siteId}/pages/${pageId}/html`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: '<!DOCTYPE html><html><head>' + document.head.innerHTML + '</head><body class="' + document.body.className.replace('cms-edit-mode', '') + '">' + clone.innerHTML + '</body></html>' })
      });
      if (!resp.ok) throw new Error('Failed to save HTML');
      showToast('? Ðã luu c?u trúc HTML thành công!');
    } catch (err) {
      showToast('? L?i luu HTML: ' + err.message);
    }
  }

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
    toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 2500);
  }

  window.CmsEditor = { save: saveEditor, cancel: () => closeEditor(true), selectParentBlock, closeStruct, duplicateBlock, hideBlock, deleteBlock, saveHtml };

  function init() {
    createToolbar();
    document.querySelectorAll('[data-cms-editable]').forEach(el => {
      el.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation(); openEditor(this);
      });
    });
    document.addEventListener('click', function(e) {
      if (editorPanel && !editorPanel.contains(e.target) && !e.target.hasAttribute('data-cms-editable')) closeEditor(true);
      if (structPanel && !structPanel.contains(e.target) && !activeBlock?.contains(e.target) && !e.target.closest('#cms-inline-editor')) closeStruct();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { closeEditor(true); closeStruct(); }
      if (e.key === 'Enter' && e.ctrlKey && activeElement) saveEditor();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
