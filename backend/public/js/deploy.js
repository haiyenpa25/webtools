const Deploy = {
  async load() {
    if (!currentSiteId) return;
    
    // Load config
    try {
      const resp = await fetch(`${API}/deploy/${currentSiteId}/config`);
      const config = await resp.json();
      
      document.getElementById('deployHost').value = config.host || '';
      document.getElementById('deployUser').value = config.user || '';
      document.getElementById('deployPass').value = config.password || '';
      document.getElementById('deployDir').value = config.remoteDir || '/public_html';
    } catch(err) {}
  },

  async saveConfig() {
    const config = {
      type: 'ftp',
      host: document.getElementById('deployHost').value,
      user: document.getElementById('deployUser').value,
      password: document.getElementById('deployPass').value,
      remoteDir: document.getElementById('deployDir').value
    };

    try {
      await fetch(`${API}/deploy/${currentSiteId}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      Toast.success('Ðã luu c?u hình Deploy!');
    } catch(err) {
      Toast.error('L?i khi luu c?u hình.');
    }
  },

  async executeDeploy() {
    if(!confirm('Xác nh?n: S? dua toàn b? d? li?u ? B?N XU?T CU?I CÙNG (Tab Export) lên Server FTP?')) return;
    
    document.getElementById('btnDeployExec').innerHTML = '<div class="spinner" style="width:14px;height:14px;borderWidth:2px"></div> Ðang Deploy...';
    document.getElementById('btnDeployExec').disabled = true;

    try {
      const resp = await fetch(`${API}/deploy/${currentSiteId}/execute`, { method: 'POST' });
      const data = await resp.json();
      if(data.success) {
         Toast.success('?? THÀNH CÔNG: T? d?ng Deploy lên Production hoàn t?t!');
      } else {
         Toast.error(data.error);
      }
    } catch (err) {
      Toast.error('L?i m?ng/FTP server.');
    } finally {
      document.getElementById('btnDeployExec').innerHTML = '?? B?T Ð?U Ð?Y LÊN PRODUCTION';
      document.getElementById('btnDeployExec').disabled = false;
    }
  }
};
