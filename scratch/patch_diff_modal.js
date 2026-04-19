const fs = require('fs');
let html = fs.readFileSync('backend/public/index.html', 'utf8');

const diffHTML = `
    <!-- Split-View Diff Modal -->
    <div class="modal-overlay" id="diffModal" style="display:none">
      <div class="modal modal-lg" style="max-width: 90vw; width: 1200px;">
        <div class="modal-header">
          <h2 class="modal-title">C? Máy Th?i Gian: <span id="diffVersionName"></span></h2>
          <button class="btn-icon" onclick="History.closeDiff()">?</button>
        </div>
        <div class="modal-body" style="background:#f1f5f9; padding:20px;">
          <p class="view-subtitle" style="margin-bottom:20px;">So sánh các vùng d? li?u (kh?i HTML/Text) b? thay d?i so v?i phiên b?n hi?n t?i.</p>
          <div id="diffContainer" style="display:flex; flex-direction:column; gap:15px; max-height:60vh; overflow-y:auto;">
             <!-- diff items go here -->
          </div>
        </div>
        <div class="modal-footer" style="padding: 15px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px;">
          <button class="btn btn-ghost" onclick="History.closeDiff()">H?y</button>
          <button class="btn btn-primary" id="diffRestoreBtn" onclick="History.executeRollback()">
            <svg viewBox="0 0 24 24" width="16" height="16" style="margin-right:6px"><path d="M3 2v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/></svg> 
            Khôi Ph?c Phiên B?n Này
          </button>
        </div>
      </div>
    </div>
`;

if(!html.includes('id="diffModal"')) {
    const endBody = html.indexOf('</body>');
    html = html.substring(0, endBody) + diffHTML + html.substring(endBody);
    fs.writeFileSync('backend/public/index.html', html);
    console.log("Injected Diff modal.");
} else {
    console.log("Diff modal exists.");
}
