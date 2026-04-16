const mysql2 = require('mysql2/promise');
require('dotenv').config();

const pool = mysql2.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'webtools_cms',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL connected:', process.env.DB_NAME);
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection failed:', err.message);
    console.log('👉 Make sure XAMPP MySQL is running and database "webtools_cms" exists.');
    console.log('👉 Run: mysql -u root -e "CREATE DATABASE webtools_cms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"');
  });

module.exports = pool;
