const fs = require('fs');

const sql = `
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
`;

let content = fs.readFileSync('backend/schema.sql', 'utf8');
if (!content.includes('CREATE TABLE IF NOT EXISTS collections')) {
    fs.appendFileSync('backend/schema.sql', '\n' + sql);
    console.log("Appended Collections schema to schema.sql");
} else {
    console.log("Collections schema already exists.");
}
