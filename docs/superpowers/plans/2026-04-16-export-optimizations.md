# Export Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement UI configurations for the export ZIP logic, generate pretty URLs via `.htaccess`, and extract common header/footer components into separate template files for the PHP export engine.

**Architecture:** 
- Frontend uses simple JS DOM manipulation in `backend/public/js/export.js` to collect export parameters (`mode`, `base_url`).
- Backend `routes/export.js` analyzes the mode HTTP queries. If `php`, it extracts the `<nav>` or `<header>` elements during the homepage iteration, saves them into memory, and removes/replaces them across all pages with `<?php require_once ... ?>`. Finally, it includes a generic Apache rewrite config.

**Tech Stack:** Node.js, Express, archiver, Cheerio, Vanilla JS/HTML.

---

### Task 1: Add Export UI Configurations

**Files:**
- Modify: `backend/public/js/export.js`

- [ ] **Step 1: Write Settings UI into Export Panel**

Modify the `render(data)` function in `export.js` to insert a configuration block before the Export Button Area.
```javascript
      <!-- Settings Panel -->
      <div class="form-card" style="margin-bottom:24px">
        <h3 style="font-size:14px;font-weight:600;color:var(--text-main);margin-bottom:16px">⚙️ Cấu Hình Xuất (Export Settings)</h3>
        <div style="display:grid;gap:12px">
          <div>
            <label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text-muted)">Môi Trường Biểu Diễn</label>
            <select id="exportMode" class="form-input" style="width:100%;padding:8px;border-radius:4px;border:1px solid #ccc;">
              <option value="php">PHP Dynamic (Khuyên dùng XAMPP / Hosting)</option>
              <option value="html">Static HTML (Thuần Tĩnh)</option>
            </select>
          </div>
          <div>
            <label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text-muted)">Base URL Tương Đối (Chỉ dành cho PHP)</label>
            <input type="text" id="exportBaseUrl" class="form-input" style="width:100%;padding:8px;border-radius:4px;border:1px solid #ccc;" value="/${data.site.slug}/">
            <small style="font-size:11px;color:#999">Thư mục trên localhost. VD: /du-an-a/</small>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Modify `download()` API URL generation**

Update the `download()` method to fetch values and construct the GET request.

```javascript
    const modeObj = document.getElementById('exportMode');
    const baseUrlObj = document.getElementById('exportBaseUrl');
    const modeStr = modeObj ? modeObj.value : 'php';
    const baseUrlStr = baseUrlObj ? encodeURIComponent(baseUrlObj.value) : encodeURIComponent(`/${currentSiteId}/`);

    try {
      // Tạo link download
      const link = document.createElement('a');
      link.href = `${API}/export/${currentSiteId}?mode=${modeStr}&base_url=${baseUrlStr}`;
```

### Task 2: Pretty URLs and Layout Extraction in Backend

**Files:**
- Modify: `backend/src/routes/export.js`

- [ ] **Step 1: Rewrite Anchor Tags for Pretty URLs**

In the `<a href>` cheerio replacement rule, strip the `.php` extension for internal routes (excluding `index` so it resolves nicely to the directory root).

Modify:
```javascript
          if (relPath === '/' || relPath === '') {
             const ext = mode === 'php' ? '.php' : '.html';
             $(el).attr('href', mode === 'php' ? `<?= BASE_URL ?>index${ext}` : `index${ext}`);
          } else {
             const ext = mode === 'php' ? '' : '.html';
             const fixedPath = relPath.replace(/^\//, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9_.-]/g, '') + ext;
             $(el).attr('href', mode === 'php' ? `<?= BASE_URL ?>${fixedPath}` : fixedPath);
          }
```

- [ ] **Step 2: Auto Layout Extraction**

Define `let _extractedHeader = '';` and `let _extractedFooter = '';` outside the `for (const page of pages)` loop.
When traversing `$.html()`, identify the `header`/`footer` elements, extract their HTML (if page is home), and then replace them across all pages.

```javascript
    let _extractedHeader = '';
    let _extractedFooter = '';

    for (const page of pages) {
      // ... html ...
      const $ = cheerio.load(html);

      // EXTRACT LAYOUT
      if (mode === 'php') {
        const headerEl = $('header').length ? $('header') : ($('nav').length ? $('nav') : null);
        if (headerEl) {
           if (page.is_home) _extractedHeader = headerEl.prop('outerHTML');
           headerEl.replaceWith('<?php require_once "header.php"; ?>');
        }

        const footerEl = $('footer').length ? $('footer') : null;
        if (footerEl) {
           if (page.is_home) _extractedFooter = footerEl.prop('outerHTML');
           footerEl.replaceWith('<?php require_once "footer.php"; ?>');
        }
      }
      // ... rewrites ...
```

- [ ] **Step 3: Generate the File Archives**

After the loop, append `.htaccess`, `header.php`, and `footer.php`.

```javascript
    // Add layout components
    if (mode === 'php') {
      if (_extractedHeader) archive.append(_extractedHeader, { name: 'header.php' });
      if (_extractedFooter) archive.append(_extractedFooter, { name: 'footer.php' });
      
      const htaccess = `RewriteEngine On\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteCond %{REQUEST_FILENAME} !-d\nRewriteRule ^([^\\.]+)$ $1.php [NC,L]`;
      archive.append(htaccess, { name: '.htaccess' });
    }
```
