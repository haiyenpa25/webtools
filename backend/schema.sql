-- =============================================
-- WebTools CMS - Database Schema
-- MySQL compatible (XAMPP)
-- =============================================

CREATE DATABASE IF NOT EXISTS webtools_cms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE webtools_cms;

-- Sites (mỗi website được crawl là 1 site)
CREATE TABLE IF NOT EXISTS sites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  original_url VARCHAR(1000) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  status ENUM('pending', 'crawling', 'ready', 'error') DEFAULT 'pending',
  crawl_progress INT DEFAULT 0,
  page_count INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Pages của mỗi site
CREATE TABLE IF NOT EXISTS pages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  url VARCHAR(1000) NOT NULL,
  path VARCHAR(500) NOT NULL,
  title VARCHAR(500),
  html_file VARCHAR(500),
  is_home TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  INDEX idx_site_path (site_id, path(255))
) ENGINE=InnoDB;

-- Schema fields (các vùng có thể chỉnh sửa)
CREATE TABLE IF NOT EXISTS schema_fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  page_id INT,
  field_id VARCHAR(255) NOT NULL,
  field_type ENUM('text', 'html', 'image', 'link', 'global') DEFAULT 'text',
  tag VARCHAR(50),
  selector VARCHAR(500),
  original_value LONGTEXT,
  current_value LONGTEXT,
  global_key VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  INDEX idx_site_field (site_id, field_id(100))
) ENGINE=InnoDB;

-- SEO metadata cho từng page
CREATE TABLE IF NOT EXISTS seo_meta (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  page_id INT NOT NULL,
  meta_title VARCHAR(500),
  meta_description TEXT,
  meta_keywords TEXT,
  og_title VARCHAR(500),
  og_description TEXT,
  og_image VARCHAR(500),
  canonical_url VARCHAR(1000),
  robots VARCHAR(100) DEFAULT 'index, follow',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  UNIQUE KEY unique_page_seo (page_id)
) ENGINE=InnoDB;

-- Global variables (phone, email, address...)
CREATE TABLE IF NOT EXISTS global_vars (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  var_key VARCHAR(255) NOT NULL,
  var_value TEXT,
  label VARCHAR(255),
  var_type ENUM('text', 'email', 'phone', 'url', 'textarea') DEFAULT 'text',
  occurrence_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE KEY unique_site_key (site_id, var_key)
) ENGINE=InnoDB;

-- Media library
CREATE TABLE IF NOT EXISTS media (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  fixed_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  file_path VARCHAR(500) NOT NULL,
  file_type ENUM('image', 'svg', 'video', 'document') DEFAULT 'image',
  mime_type VARCHAR(100),
  width INT,
  height INT,
  file_size INT,
  alt_text VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE KEY unique_site_media (site_id, fixed_name)
) ENGINE=InnoDB;

-- Version history (snapshot)
CREATE TABLE IF NOT EXISTS versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  label VARCHAR(255),
  snapshot_path VARCHAR(500),
  field_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Components (header/footer phát hiện tự động)
CREATE TABLE IF NOT EXISTS components (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  component_type ENUM('header', 'footer', 'nav', 'sidebar', 'custom') DEFAULT 'custom',
  name VARCHAR(255),
  html_content LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- =============================================
-- WebTools CMS v4.0 - Dynamic Collections
-- =============================================

CREATE TABLE IF NOT EXISTS collections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  template_page_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (template_page_id) REFERENCES pages(id) ON DELETE SET NULL,
  UNIQUE KEY unique_site_slug (site_id, slug)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS collection_fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collection_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  field_key VARCHAR(100) NOT NULL,
  field_type ENUM('text', 'rich_text', 'image', 'link', 'number') DEFAULT 'text',
  is_required TINYINT(1) DEFAULT 0,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS collection_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collection_id INT NOT NULL,
  site_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE KEY unique_item_slug (collection_id, slug)
) ENGINE=InnoDB;
