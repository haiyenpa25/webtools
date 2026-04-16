const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let confirmSeen = false;
  page.on('dialog', async dialog => {
    console.log('DIALOG DETECTED:', dialog.message());
    confirmSeen = true;
    await dialog.accept();
  });
  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  await page.goto('http://localhost:3000/#');
  await page.waitForTimeout(2000);
  console.log('Clicking the delete button...');
  try {
    const btns = await page.('.site-actions .btn-danger:has-text("Xóa")');
    console.log('Found buttons:', btns.length);
    if (btns.length > 0) {
      await btns[1].click();
    }
  } catch(e) { console.log('EVAL ERROR:', e.message); }
  await page.waitForTimeout(2000);
  console.log('Confirm seen?', confirmSeen);
  await browser.close();
})();
