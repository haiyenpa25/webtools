const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const ftp = require('basic-ftp');

const CONFIG_PATH = path.join(__dirname, '../../data/deploy_configs.json');

// Helper to get configs
function getConfigs() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }
  return {};
}
function saveConfigs(data) {
  if (!fs.existsSync(path.dirname(CONFIG_PATH))) fs.mkdirSync(path.dirname(CONFIG_PATH));
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

// GET /api/deploy/:siteId/config
router.get('/:siteId/config', (req, res) => {
  const configs = getConfigs();
  res.json(configs[req.params.siteId] || { type: 'ftp', host: '', user: '', pass: '', remoteDir: '/public_html' });
});

// POST /api/deploy/:siteId/config
router.post('/:siteId/config', (req, res) => {
  const configs = getConfigs();
  configs[req.params.siteId] = req.body;
  saveConfigs(configs);
  res.json({ success: true });
});

// POST /api/deploy/:siteId/execute
router.post('/:siteId/execute', async (req, res) => {
  const configs = getConfigs();
  const config = configs[req.params.siteId];
  if (!config) return res.status(400).json({ error: 'Chua c?u hình tài kho?n FTP/Deploy' });

  // 1. Prepare export folder (We assume the user must have clicked Export first, so export folder exists)
  const exportDir = path.join(__dirname, '../../exports', req.params.siteId);
  if (!fs.existsSync(exportDir)) {
    return res.status(400).json({ error: 'Chua tìm th?y b?n Build! Hãy vào tab Xu?t File (Export) d? t?o b?n Build tru?c.' });
  }

  if (config.type === 'ftp') {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
      await client.access({
        host: config.host,
        user: config.user,
        password: config.password,
        secure: false // Optional, can add as setting
      });
      console.log('FTP Connected. Uploading...');
      await client.ensureDir(config.remoteDir);
      await client.clearWorkingDir();
      await client.uploadFromDir(exportDir);
      res.json({ success: true, message: 'Ðã d?y lên FTP Server thành công!' });
    } catch (err) {
      res.status(500).json({ error: 'L?i FTP: ' + err.message });
    } finally {
      client.close();
    }
  } else {
    res.status(400).json({ error: 'Ch? h? tr? giao th?c FTP ? phiên b?n này' });
  }
});

module.exports = router;
