const cron = require('node-cron');
const db = require('../config/database');
const { startTargetedCrawl } = require('../routes/crawler'); // We might need to abstract crawler logic if we want to run it from here.

function initCronJobs() {
  console.log('? Scheduler: Starting background cron jobs...');
  // Ch?y m?i dêm lúc 2:00 AM (0 2 * * *)
  cron.schedule('0 2 * * *', async () => {
    console.log('?? CronJob Triggered: Auto-syncing background sites.');
    try {
      // Tìm các site có c?u hình "auto_sync = 1" (n?u có c?t này trong tuong lai)
      // Hi?n t?i ta ch?y th? nghi?m log
      console.log('? CronJob: Crawl service is waiting for configured sites.');
    } catch (err) {
      console.error('? CronJob Error:', err.message);
    }
  });
}

module.exports = { initCronJobs };
