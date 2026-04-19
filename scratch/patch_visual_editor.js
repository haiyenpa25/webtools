const fs = require('fs');
let js = fs.readFileSync('backend/public/js/cms-visual-editor.js', 'utf8');

const structPanelDefRegex = /function createStructPanel\(\) {[\s\S]*?return panel;\n  \}/;

const stylePanelCode = `
  let stylePanel = null;

  function createStylePanel() {
    const panel = document.createElement('div');
    panel.id = 'cms-style-editor';
    panel.style.cssText = 'position:absolute;z-index:9999990;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px;display:none;width:260px;box-shadow:0 10px 25px rgba(0,0,0,0.3);color:white;font-family:sans-serif;font-size:13px;right:20px;top:20px;max-height:80vh;overflow-y:auto;';
    
    panel.innerHTML = \`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #334155;padding-bottom:8px">
        <strong style="color:#e2e8f0;font-size:14px">?? Thi?t K? Giao Di?n</strong>
        <button style="background:transparent;border:none;color:#94a3b8;cursor:pointer" onclick="CmsEditor.closeStyle()">?</button>
      </div>
      
      <!-- Layout & Size -->
      <div style="margin-bottom:12px">
        <label style="display:block;margin-bottom:4px;color:#94a3b8;font-size:11px;text-transform:uppercase">Kho?ng Cách (Padding)</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <span style="font-size:10px;color:#64748b">Top-Bot (px/rem)</span>
            <input type="text" id="cssPadY" style="width:100%;background:#0f172a;border:1px solid #334155;color:white;padding:4px 6px;border-radius:4px" oninput="CmsEditor.applyCss('padding', this.value, 'y')">
          </div>
          <div>
            <span style="font-size:10px;color:#64748b">Left-Right (px/rem)</span>
            <input type="text" id="cssPadX" style="width:100%;background:#0f172a;border:1px solid #334155;color:white;padding:4px 6px;border-radius:4px" oninput="CmsEditor.applyCss('padding', this.value, 'x')">
          </div>
        </div>
      </div>

      <!-- Colors -->
      <div style="margin-bottom:12px">
        <label style="display:block;margin-bottom:4px;color:#94a3b8;font-size:11px;text-transform:uppercase">Màu S?c</label>
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">
          <input type="color" id="cssBgColor" style="cursor:pointer;" onchange="CmsEditor.applyCss('backgroundColor', this.value)">
          <span>Màu N?n (Background)</span>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <input type="color" id="cssColor" style="cursor:pointer;" onchange="CmsEditor.applyCss('color', this.value)">
          <span>Màu Ch? (Text)</span>
        </div>
      </div>

      <!-- Typography -->
      <div style="margin-bottom:12px">
        <label style="display:block;margin-bottom:4px;color:#94a3b8;font-size:11px;text-transform:uppercase">Ki?u Ch?</label>
        <div style="display:grid;grid-template-columns:1fr;gap:8px">
          <select id="cssTextAlign" style="width:100%;background:#0f172a;border:1px solid #334155;color:white;padding:4px 6px;border-radius:4px" onchange="CmsEditor.applyCss('textAlign', this.value)">
            <option value="">Can l? (M?c d?nh)</option>
            <option value="left">Trái (Left)</option>
            <option value="center">Gi?a (Center)</option>
            <option value="right">Ph?i (Right)</option>
            <option value="justify">Ð?u (Justify)</option>
          </select>
          <input type="text" id="cssFontSize" placeholder="C? ch? (VD: 16px, 1.2rem)" style="width:100%;background:#0f172a;border:1px solid #334155;color:white;padding:4px 6px;border-radius:4px" oninput="CmsEditor.applyCss('fontSize', this.value)">
        </div>
      </div>

      <!-- Border & Radius -->
      <div style="margin-bottom:12px">
        <label style="display:block;margin-bottom:4px;color:#94a3b8;font-size:11px;text-transform:uppercase">Bo Góc (Radius)</label>
        <input type="text" id="cssRadius" style="width:100%;background:#0f172a;border:1px solid #334155;color:white;padding:4px 6px;border-radius:4px" oninput="CmsEditor.applyCss('borderRadius', this.value)" placeholder="VD: 8px, 50%">
      </div>
      
      <!-- Custom CSS string -->
      <div style="margin-bottom:12px">
        <label style="display:block;margin-bottom:4px;color:#94a3b8;font-size:11px;text-transform:uppercase">CSS T? Do (Nâng cao)</label>
        <textarea id="cssCustom" style="width:100%;background:#0f172a;border:1px solid #334155;color:white;padding:4px 6px;border-radius:4px;height:50px;font-family:monospace;font-size:11px" placeholder="border: 1px solid red;\nbox-shadow: 0 4px 6px rgba..." onchange="CmsEditor.applyCssCustom(this.value)"></textarea>
      </div>

      <small style="color:#64748b;font-size:10px;text-align:center;display:block">*Nh?n "Luu HTML" sau khi thi?t k? xong.</small>
    \`;
    document.body.appendChild(panel);
    return panel;
  }

  window.CmsEditor.openStyle = function() {
    if (!activeBlock) return;
    if (!stylePanel) stylePanel = createStylePanel();
    
    // Ð?c thu?c tính m?c d?nh
    const computed = window.getComputedStyle(activeBlock);
    
    // Gán vào form (d? hi?n th? tr?c quan) - không hoàn h?o vì padding g?p x, y
    // Tuy nhiên nó d? cung c?p context
    const rgb2hex = (rgb) => {
        if(!rgb || !rgb.includes('rgb')) return '#000000';
        let a = rgb.split("(")[1].split(")")[0].split(",");
        let b = a.map(x => { x = parseInt(x).toString(16); return (x.length==1) ? "0"+x : x; });
        return "#" + b.join("");
    };

    document.getElementById('cssBgColor').value = (computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)') ? rgb2hex(computed.backgroundColor) : '#ffffff';
    document.getElementById('cssColor').value = computed.color ? rgb2hex(computed.color) : '#000000';
    document.getElementById('cssTextAlign').value = computed.textAlign || '';
    document.getElementById('cssFontSize').value = computed.fontSize || '';
    document.getElementById('cssRadius').value = computed.borderRadius || '';
    // Custom inline style (what was typed manually)
    document.getElementById('cssCustom').value = activeBlock.getAttribute('style') || '';

    stylePanel.style.display = 'block';
  };

  window.CmsEditor.closeStyle = function() {
    if (stylePanel) stylePanel.style.display = 'none';
  };

  window.CmsEditor.applyCss = function(prop, val, axis) {
    if (!activeBlock) return;
    if (prop === 'padding' && axis === 'y') {
       activeBlock.style.paddingTop = val;
       activeBlock.style.paddingBottom = val;
    } else if (prop === 'padding' && axis === 'x') {
       activeBlock.style.paddingLeft = val;
       activeBlock.style.paddingRight = val;
    } else {
       activeBlock.style[prop] = val;
    }
  };

  window.CmsEditor.applyCssCustom = function(val) {
    if (!activeBlock) return;
    // merge CSS
    activeBlock.style.cssText += val;
  };
`;

// Add cssPanel creation next to structPanel
if(!js.includes('createStylePanel')) {
   const structMatch = js.match(structPanelDefRegex);
   if(structMatch) {
       js = js.replace(structMatch[0], structMatch[0] + "\n\n" + stylePanelCode);
   }
}

// Add the ?? Button to structPanel HTML
const structPanelHTMLOld = `      <button class="cms-action-btn" id="cms-action-rewrite" title="Dùng AI vi?t l?i nguyên kh?i này chu?n SEO">? AI Rewrite</button>`;
const structPanelHTMLNew = `      <button class="cms-action-btn" id="cms-action-style" title="B?t Studio thi?t k? tr?c ti?p" onclick="CmsEditor.openStyle()">?? Style</button>
      <button class="cms-action-btn" id="cms-action-master" title="Ð?ng b? kh?i này làm m?u chu?n c?u trúc (Global Sync)" onclick="CmsEditor.setMaster()">?? Master</button>
      <button class="cms-action-btn" id="cms-action-rewrite" title="Dùng AI vi?t l?i nguyên kh?i này chu?n SEO">? AI Rewrite</button>`;
if(js.includes(structPanelHTMLOld) && !js.includes('id="cms-action-style"')) {
    js = js.replace(structPanelHTMLOld, structPanelHTMLNew);
}

// Thêm logic setMaster
const masterLogic = `
  window.CmsEditor.setMaster = function() {
    if (!activeBlock) return;
    const name = prompt('Nh?p tên cho Master Component này (VD: Header, Footer, GioiThieu). Luu ý: Không d?u, vi?t li?n.');
    if (!name || name.trim() === '') return;
    
    const formatted = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    activeBlock.setAttribute('data-cms-master', formatted);
    activeBlock.style.border = '2px dashed #f59e0b';
    showToast('?? Ðã gán Master ID: ' + formatted + '. Nh? B?m Luu Mã Ngu?n HTML d? áp d?ng toàn h? th?ng!');
  };
`;
if(!js.includes('window.CmsEditor.setMaster')) {
    js += "\n" + masterLogic;
}

fs.writeFileSync('backend/public/js/cms-visual-editor.js', js);
console.log("Injected Styling UI and Master Component buttons.");
