require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// === Middleware ===
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '20971520') },
  useTempFiles: false
}));

// === Serve CMS Dashboard (static frontend) ===
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// === Serve uploaded sites images ===
const uploadsDir = path.join(__dirname, '../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Serve CMS visual editor static files
app.get('/cms-overlay.css', (req, res) => {
  res.sendFile(path.join(publicDir, 'css', 'cms-overlay.css'));
});
app.get('/cms-visual-editor.js', (req, res) => {
  res.sendFile(path.join(publicDir, 'js', 'cms-visual-editor.js'));
});

// === API Routes ===
app.use('/api/crawl', require('./routes/crawler'));
app.use('/api/sites', require('./routes/sites'));
app.use('/api/media', require('./routes/media'));
app.use('/api/seo', require('./routes/seo'));
app.use('/api/globals', require('./routes/globals'));
app.use('/api/history', require('./routes/history'));
app.use('/api/export', require('./routes/export'));
app.use('/api/search', require('./routes/search'));
app.use('/api/i18n', require('./routes/i18n'));

// === Health check ===
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    version: '1.0.0',
    name: 'WebTools Re-generator CMS'
  });
});

// === Dashboard Stats ===
app.get('/api/stats', async (req, res) => {
  try {
    const db = require('./config/database');
    const [[sitesRow]] = await db.execute('SELECT COUNT(*) as total FROM sites WHERE status = "ready"');
    const [[allSitesRow]] = await db.execute('SELECT COUNT(*) as total FROM sites');
    const [[pagesRow]] = await db.execute('SELECT COUNT(*) as total FROM pages');
    const [[mediaRow]] = await db.execute('SELECT COUNT(*) as total FROM media');
    const [[fieldsRow]] = await db.execute('SELECT COUNT(*) as total FROM schema_fields');
    const [[modifiedRow]] = await db.execute(
      'SELECT COUNT(*) as total FROM schema_fields WHERE current_value != original_value'
    );
    res.json({
      sites: allSitesRow.total || 0,
      sitesReady: sitesRow.total || 0,
      pages: pagesRow.total || 0,
      media: mediaRow.total || 0,
      editableFields: fieldsRow.total || 0,
      modifiedFields: modifiedRow.total || 0
    });
  } catch (err) {
    res.json({ sites: 0, sitesReady: 0, pages: 0, media: 0, editableFields: 0, modifiedFields: 0 });
  }
});

// === Catch-all: Serve dashboard SPA ===
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(publicDir, 'index.html'));
  }
});

// === Error Handler ===
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// === Socket.IO (Real-time crawl progress) ===
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  socket.on('disconnect', () => console.log('🔌 Client disconnected:', socket.id));
});

// Export io để sử dụng ở routes
app.set('io', io);

// === Start Server ===
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('🚀 ================================');
  console.log(`🌐 WebTools CMS: http://localhost:${PORT}`);
  console.log(`🔧 API Health:   http://localhost:${PORT}/api/health`);
  console.log('🚀 ================================');
  console.log('');
});

module.exports = { app, io };
