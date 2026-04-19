const db = require('../backend/src/config/database');

async function test() {
  const [pages] = await db.query('SELECT url, path, html_file FROM pages WHERE path LIKE "%.php.html%" OR html_file LIKE "%.php.html%"');
  console.log('Bad files:', pages);
  process.exit(0);
}

test();
