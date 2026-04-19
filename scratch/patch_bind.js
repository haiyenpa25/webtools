const fs = require('fs');
let js = fs.readFileSync('backend/public/js/cms-visual-editor.js', 'utf8');

const targetHTML = `      <button class="cms-action-btn" id="cms-action-master" title="Ð?ng b? kh?i này làm m?u chu?n c?u trúc (Global Sync)" onclick="CmsEditor.setMaster()">?? Master</button>`;
const newHTML = `      <button class="cms-action-btn" id="cms-action-bind" title="Bi?n kh?i này thành d? li?u d?ng l?y t? Kho" onclick="CmsEditor.setBind()">? Bind (CMS)</button>
` + targetHTML;

if (!js.includes('CmsEditor.setBind()')) {
    js = js.replace(targetHTML, newHTML);

    const bindLogic = `
  window.CmsEditor.setBind = function() {
    if (!activeBlock) return;
    const name = prompt('Nh?p tên TRU?NG D? LI?U Ð?NG (CMS Field Key) mà kh?i này s? hi?n th? (VD: tieu_de, noi_dung, don_gia):');
    if (!name || name.trim() === '') return;
    
    const formatted = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    activeBlock.setAttribute('data-cms-bind', formatted);
    activeBlock.style.border = '2px solid #8b5cf6';
    activeBlock.style.position = 'relative';
    // Add a tiny pseudo label via code or just set a title
    activeBlock.title = "Ðã n?i v?i Bi?n Ð?ng: " + formatted;
    
    showToast('? Ðã n?i bi?n d?ng: ' + formatted + '. Nh? luu mã ngu?n.');
  };
`;
    js += "\n" + bindLogic;
    fs.writeFileSync('backend/public/js/cms-visual-editor.js', js);
    console.log("Injected setBind logic into cms-visual-editor.js");
} else {
    console.log("Already exist");
}
