const fs = require('fs');
let html = fs.readFileSync('backend/public/index.html', 'utf8');

const deployHtml = `
        <!-- VIEW: Deploy -->
        <div class="view" id="view-deploy" style="display:none;">
          <div class="view-header">
            <div>
              <h1 class="view-title">Auto Deploy (Kích Ho?t Tên L?a)</h1>
              <p class="view-subtitle">C?u hình máy ch? FTP và t? d?ng d?y mã ngu?n Tinh xu?t b?n lên m?ng.</p>
            </div>
            <button class="btn btn-primary" id="btnDeployExec" onclick="Deploy.executeDeploy()" style="font-size: 14px; font-weight: 700; background: linear-gradient(135deg, #FF6B6B 0%, #FF2626 100%);">
              ?? B?T Ð?U Ð?Y LÊN PRODUCTION
            </button>
          </div>
          
          <div style="max-width: 600px; padding: 20px; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h3 style="margin-top:0; color:#334155; margin-bottom: 20px;">C?u Hình Máy Ch? FTP</h3>
            
            <div class="form-group">
              <label class="form-label">FTP Host / Server IP</label>
              <input type="text" id="deployHost" class="form-input" placeholder="ftp.domain.com ho?c 123.45.67.89">
            </div>
            <div class="form-group" style="margin-top: 15px;">
              <label class="form-label">Tên Ðang Nh?p (Username)</label>
              <input type="text" id="deployUser" class="form-input" placeholder="admin">
            </div>
            <div class="form-group" style="margin-top: 15px;">
              <label class="form-label">M?t kh?u (Password)</label>
              <input type="password" id="deployPass" class="form-input" placeholder="••••••••">
            </div>
            <div class="form-group" style="margin-top: 15px;">
              <label class="form-label">Thu m?c ngu?n dích (Tùy ch?n)</label>
              <input type="text" id="deployDir" class="form-input" placeholder="/public_html" value="/public_html">
              <small style="color:#94a3b8; display:block; margin-top:5px;">Luu ý: CMS s? chép ÐÈ thu m?c Export lên thu m?c Ðích và XÓA S?CH nh?ng file cu không kh?p. Hãy c?n th?n!</small>
            </div>
            
            <button class="btn btn-secondary" onclick="Deploy.saveConfig()" style="margin-top: 20px; width: 100%;">Luu C?u Hình K?t N?i</button>
          </div>
        </div>
`;

if (!html.includes('id="view-deploy"')) {
    // Insert before search view or before end of app
    const target = '<!-- VIEW: Search & Replace -->';
    if(html.includes(target)) {
        html = html.replace(target, deployHtml + "\n        " + target);
    } else {
        html = html.replace('</div>\n    </div>\n  </body>', deployHtml + '\n</div>\n    </div>\n  </body>');
    }
    
    // Inject script tag
    html = html.replace('<script src="/js/history.js"></script>', '<script src="/js/history.js"></script>\n  <script src="/js/deploy.js"></script>');
    
    fs.writeFileSync('backend/public/index.html', html);
    console.log("Injected deploy view and script!");
} else {
    console.log("Deploy view already exists.");
}
