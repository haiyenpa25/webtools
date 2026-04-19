const express = require('express');
const router = express.Router();

const CMS_PASSWORD = process.env.CMS_PASSWORD || '123456';

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === CMS_PASSWORD) {
    res.cookie('cms_auth', 'authenticated', { maxAge: 86400000, httpOnly: true });
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Sai m?t kh?u truy c?p' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('cms_auth');
  res.json({ success: true });
});

module.exports = router;
