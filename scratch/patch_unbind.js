const fs = require('fs');
let content = fs.readFileSync('backend/public/js/cms-visual-editor.js', 'utf8');

const targetBind = `  window.CmsEditor.setBind = function() {
    if (!activeBlock) return;
    const name = prompt('Nh?p tn TRU?NG D? LI?U ?NG (CMS Field Key) m kh?i ny s? hi?n th? (VD: tieu_de, noi_dung, don_gia):');
    if (!name || name.trim() === '') return;
    
    const formatted = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    activeBlock.setAttribute('data-cms-bind', formatted);
    activeBlock.style.border = '2px solid #8b5cf6';
    activeBlock.style.position = 'relative';
    // Add a tiny pseudo label via code or just set a title
    activeBlock.title = " n?i v?i Bi?n ?ng: " + formatted;
    
    showToast('?  n?i bi?n d?ng: ' + formatted + '. Nh? luu m ngu?n.');
  };`;

const newBind = `  window.CmsEditor.setBind = function() {
    if (!activeBlock) return;
    
    if (activeBlock.hasAttribute('data-cms-bind')) {
        if (confirm('Kh?i này dang du?c Liên k?t Ð?ng t?i [' + activeBlock.getAttribute('data-cms-bind') + ']. B?n có mu?n THÁO LIÊN K?T (Un-bind) không?')) {
            activeBlock.removeAttribute('data-cms-bind');
            activeBlock.style.border = '';
            activeBlock.title = '';
            showToast('Ðã tháo liên k?t d?ng!');
            return;
        }
    }
    
    const name = prompt('Nh?p tên TRU?NG D? LI?U Ð?NG (CMS Field Key) mà kh?i này s? hi?n th? (VD: tieu_de, noi_dung, don_gia):');
    if (!name || name.trim() === '') return;
    
    const formatted = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    activeBlock.setAttribute('data-cms-bind', formatted);
    activeBlock.style.border = '2px solid #8b5cf6';
    activeBlock.style.position = 'relative';
    activeBlock.title = "Ðã n?i bi?n d?ng: " + formatted;
    
    showToast('? Ðã n?i bi?n d?ng: ' + formatted);
  };`;

if (!content.includes('THÁO LIÊN K?T')) {
    content = content.replace(targetBind, newBind);
    fs.writeFileSync('backend/public/js/cms-visual-editor.js', content);
    console.log("Patched Unbind UX in Editor");
} else {
    console.log("Already patched Unbind UX");
}
