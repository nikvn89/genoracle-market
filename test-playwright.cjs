const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  console.log('Navigating...');
  await page.goto('https://genoracle-market-nik.vercel.app/', { waitUntil: 'networkidle' });
  
  console.log('Waiting 5s for React to mount...');
  await page.waitForTimeout(5000);
  
  await browser.close();
})();
