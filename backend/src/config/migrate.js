const fs = require('fs');
const path = require('path');
const mysql2 = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function migrate() {
  const conn = await mysql2.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  try {
    const sql = fs.readFileSync(path.join(__dirname, '../../schema.sql'), 'utf8');
    console.log('🚀 Running database migration...');
    await conn.query(sql);
    console.log('✅ Migration completed! Database "webtools_cms" is ready.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await conn.end();
  }
}

migrate();
