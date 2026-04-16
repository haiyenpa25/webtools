const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  let ok = false;
  page.on('dialog', async dialog => {
    console.log('DIALOG DETECTED:', dialog.message());
    ok = true;
    await dialog.accept();
  });
  await page.goto('http://localhost:3000/#');
  await page.waitForTimeout(1000);
  console.log('Testing Sites.removeSite button click...');
  await page.evaluate(() => {
    const btn = document.querySelector('.site-actions .btn-danger');
    if(btn) btn.click();
    else console.log('Button not found');
  });
  await page.waitForTimeout(1000);
  console.log('Confirm fired?', ok);
  await browser.close();
})();
