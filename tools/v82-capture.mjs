#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const urls = [
  { url: 'http://localhost:1420/?fixture=golden&system=gbc&view=system&theme=light', out: '/tmp/crystal-v82-system-gbc-light.png' },
  { url: 'http://localhost:1420/?fixture=golden&system=ps2&view=system&theme=dark', out: '/tmp/crystal-v82-system-ps2-dark.png' },
  { url: 'http://localhost:1420/?fixture=golden&system=gc&view=system&theme=dark', out: '/tmp/crystal-v82-system-gc-dark.png' },
  { url: 'http://localhost:1420/?fixture=golden&system=gbc&view=library&theme=light', out: '/tmp/crystal-v82-library-gbc-light.png' },
  { url: 'http://localhost:1420/?fixture=golden&system=ps2&view=library&theme=dark', out: '/tmp/crystal-v82-library-ps2-dark.png' },
  { url: 'http://localhost:1420/?fixture=golden&system=gc&view=library&theme=dark', out: '/tmp/crystal-v82-library-gc-dark.png' },
];

async function run() {
  const execPath = '/usr/bin/google-chrome-stable';
  // check exists
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: execPath,
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-web-security'],
    });
  } catch (e) {
    console.error('chromium.launch with executablePath failed, trying default:', e.message);
    try {
      browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
    } catch (e2) {
      console.error('default launch failed:', e2);
      process.exit(1);
    }
  }
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  for (const { url, out } of urls) {
    console.log('capturing', url, '->', out);
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
    } catch (e) {
      console.warn('goto networkidle timeout, trying domcontentloaded', e.message);
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }); } catch {}
    }
    // extra hydration
    await page.waitForTimeout(2500);
    // evaluate presence checks
    try {
      const info = await page.evaluate(() => {
        const bodyText = document.body ? document.body.innerText.slice(0, 2000) : '';
        const hasLanding = !!document.querySelector('.golden-system-landing');
        const hasLibrary = !!document.querySelector('.golden-library');
        const hasCarousel = !!document.querySelector('.game-box-carousel');
        const txt = document.documentElement.innerHTML.slice(0, 5000);
        const noSelect = !txt.includes('Select a game');
        const noNoMedia = !txt.includes('no media');
        return { hasLanding, hasLibrary, hasCarousel, bodySnippet: bodyText.slice(0,400), noSelect, noNoMedia, title: document.title };
      });
      console.log('eval', url, info);
    } catch (e) { console.warn('eval failed', e.message); }
    await page.screenshot({ path: out, fullPage: false });
    console.log('saved', out);
    await page.close();
  }
  await browser.close();
  // copy to your_files
  const destDir = path.resolve(process.cwd(), 'your_files');
  try { fs.mkdirSync(destDir, { recursive: true }); } catch {}
  for (const { out } of urls) {
    const base = path.basename(out);
    const dest = path.join(destDir, base);
    try {
      fs.copyFileSync(out, dest);
      console.log('copied to', dest);
    } catch (e) { console.warn('copy failed', e.message); }
  }
  console.log('done');
}
run().catch(e => { console.error(e); process.exit(1); });
