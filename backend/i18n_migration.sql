-- =============================================
-- WebTools CMS - i18n Migration
-- Chạy file này sau schema.sql gốc
-- =============================================

USE webtools_cms;

-- Bảng ngôn ngữ của từng site
CREATE TABLE IF NOT EXISTS i18n_languages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  lang_code VARCHAR(10) NOT NULL,       -- 'vi', 'en', 'ja', 'ko'
  lang_name VARCHAR(100) NOT NULL,      -- 'Tiếng Việt', 'English'
  flag VARCHAR(10),                     -- emoji cờ: 🇻🇳 🇺🇸
  is_source TINYINT(1) DEFAULT 0,       -- ngôn ngữ nguồn (gốc)
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE KEY unique_site_lang (site_id, lang_code)
) ENGINE=InnoDB;

-- Bảng bản dịch
CREATE TABLE IF NOT EXISTS i18n_translations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  page_id INT,                          -- liên kết đến trang
  field_id VARCHAR(255) NOT NULL,       -- khớp với schema_fields.field_id
  lang_code VARCHAR(10) NOT NULL,       -- ngôn ngữ đích
  translated_value LONGTEXT,            -- nội dung đã dịch
  is_auto TINYINT(1) DEFAULT 0,         -- dịch tự động hay thủ công
  is_approved TINYINT(1) DEFAULT 0,     -- đã được duyệt chưa
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  UNIQUE KEY unique_field_lang (site_id, field_id, lang_code),
  INDEX idx_site_lang (site_id, lang_code),
  INDEX idx_page_lang (page_id, lang_code)
) ENGINE=InnoDB;
