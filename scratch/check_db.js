const db = require('../backend/src/config/database');

async function test() {
  const [pages] = await db.query('SELECT url, path, html_file FROM pages WHERE path LIKE "%giai-phap%"');
  console.log(pages);
  process.exit(0);
}

test();
