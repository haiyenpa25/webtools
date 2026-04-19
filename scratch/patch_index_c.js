const fs = require('fs');
let html = fs.readFileSync('backend/public/index.html', 'utf8');

const navCode = `<a href="#" class="nav-item" data-view="view-collections">
          <svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="M4 6l8 6 8-6"/></svg>
          <span style="font-weight:700; color:#FFD700;">??? Kho Ð?ng (CMS)</span>
        </a>`;

const viewCode = `
        <!-- VIEW: Collections -->
        <div class="view" id="view-collections" style="display:none;">
          <div class="view-header">
            <div>
              <h1 class="view-title">Kho D? Li?u CMS Ð?ng</h1>
              <p class="view-subtitle">Dynamic Collections - WebTools v4.0 Master Class</p>
            </div>
          </div>
          
          <div id="colListArea">
             <div id="collectionList"></div>
          </div>

          <div id="colItemsArea" style="display:none;">
             <div style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                <h3 id="colItemTitle" style="margin:0">Qu?n Lý</h3>
                <div>
                   <button class="btn btn-secondary" onclick="Collections.backToList()">Quay L?i</button>
                   <button class="btn btn-primary" onclick="Collections.openAddItem()">Thêm B?n Ghi M?i</button>
                </div>
             </div>
             
             <div style="background:white; border-radius:8px; padding:15px; box-shadow:0 1px 3px rgba(0,0,0,0.1)">
               <div id="colItemsList"></div>
             </div>
          </div>
        </div>

        <!-- Col Create Modal -->
        <div class="modal-overlay" id="colCreateModal" style="display:none">
          <div class="modal">
            <div class="modal-header">
              <h2 class="modal-title">T?o Kho C?u Trúc Ð?ng (Collection)</h2>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">Tên Kho (VD: H? Th?ng S?n Ph?m)</label>
                <input type="text" id="colName" class="form-input">
              </div>
              <div class="form-group">
                <label class="form-label">Ðu?ng D?n Slug (VD: san-pham)</label>
                <input type="text" id="colSlug" class="form-input">
              </div>
              <small style="color:#64748b; margin-top:5px; display:block">M?c d?nh d? ra 3 bi?n: thumbnail, description, content</small>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" onclick="Collections.closeCreateForm()">H?y</button>
              <button class="btn btn-primary" onclick="Collections.createCollection()">Kh?i T?o</button>
            </div>
          </div>
        </div>

        <!-- Col Item Modal -->
        <div class="modal-overlay" id="colItemModal" style="display:none">
          <div class="modal modal-lg">
            <div class="modal-header">
              <h2 class="modal-title">Nh?p Li?u B?n Ghi M?i</h2>
            </div>
            <div class="modal-body" style="background:#f1f5f9; padding:20px; max-height:60vh; overflow-y:auto">
              <div class="form-group" style="margin-bottom:10px">
                <label class="form-label">Tiêu d? (Record Title)</label>
                <input type="text" id="colItemName" class="form-input" placeholder="Máy Phát Ði?n Baudouin 1000kVA">
              </div>
              <div class="form-group" style="margin-bottom:15px">
                <label class="form-label">Ðu?ng d?n chi ti?t (Slug)</label>
                <input type="text" id="colItemSlug" class="form-input" placeholder="baudouin-1000kva">
              </div>
              <h3 style="font-size:14px; border-bottom:1px solid #cbd5e1; padding-bottom:5px; margin-bottom:15px">D? li?u Tru?ng Bi?n:</h3>
              <div id="colItemFieldsForm"></div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" onclick="Collections.closeItemModal()">H?y</button>
              <button class="btn btn-primary" onclick="Collections.saveItem()">Luu B?n Ghi</button>
            </div>
          </div>
        </div>
`;

if (!html.includes('id="view-collections"')) {
    html = html.replace('<!-- VIEW: Deploy -->', viewCode + '\n        <!-- VIEW: Deploy -->');
    html = html.replace('<script src="/js/deploy.js"></script>', '<script src="/js/deploy.js"></script>\n  <script src="/js/collections.js"></script>');
    html = html.replace('<!-- Thêm sau L?ch s? -->', navCode + '\n        <!-- Thêm sau L?ch s? -->');
    
    // Auto load collections inside app.js or let's attach to click
    fs.writeFileSync('backend/public/index.html', html);
    console.log("Injected Collections UI to index.html");
}
