import { chromium } from 'playwright';

interface PageResult {
  url: string;
  name: string;
  success: boolean;
  errors: string[];
  screenshot: string;
  notes: string;
}

const pages = [
  { url: 'http://127.0.0.1:4320/', name: 'Home', expected: 'logo/branding, prompt input, and example commands' },
  { url: 'http://127.0.0.1:4320/chat?id=test', name: 'Chat', expected: 'chat interface or "Missing chat" message' },
  { url: 'http://127.0.0.1:4320/dashboards', name: 'Dashboards', expected: 'dashboards heading' },
  { url: 'http://127.0.0.1:4320/data', name: 'Data', expected: 'data source management' },
  { url: 'http://127.0.0.1:4320/settings', name: 'Settings', expected: 'settings form' },
  { url: 'http://127.0.0.1:4320/shell', name: 'Shell', expected: 'DuckDB Shell heading' },
];

async function verifyPages() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  const results: PageResult[] = [];
  const consoleErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', (error) => {
    consoleErrors.push(`[pageerror] ${error.message}`);
  });

  for (const pageInfo of pages) {
    console.log(`\n🔍 Testing: ${pageInfo.name} (${pageInfo.url})`);
    consoleErrors.length = 0;

    try {
      await page.goto(pageInfo.url, { waitUntil: 'networkidle', timeout: 10000 });
      
      // Wait a bit for React to render
      await page.waitForTimeout(2000);

      const screenshotPath = `./screenshots/${pageInfo.name.toLowerCase()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });

      // Check if page is blank
      const bodyText = await page.textContent('body');
      const isBlank = !bodyText || bodyText.trim().length < 10;

      // Get page title
      const title = await page.title();

      const result: PageResult = {
        url: pageInfo.url,
        name: pageInfo.name,
        success: !isBlank && consoleErrors.length === 0,
        errors: [...consoleErrors],
        screenshot: screenshotPath,
        notes: isBlank ? '⚠️  Page appears blank' : `✅ Page rendered (title: "${title}")`
      };

      results.push(result);

      console.log(`  ${result.notes}`);
      if (consoleErrors.length > 0) {
        console.log(`  ❌ Console errors: ${consoleErrors.length}`);
        consoleErrors.forEach(err => console.log(`     - ${err}`));
      } else {
        console.log(`  ✅ No console errors`);
      }
      console.log(`  📸 Screenshot: ${screenshotPath}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ Failed to load: ${errorMessage}`);
      results.push({
        url: pageInfo.url,
        name: pageInfo.name,
        success: false,
        errors: [errorMessage, ...consoleErrors],
        screenshot: '',
        notes: `Failed to load: ${errorMessage}`
      });
    }
  }

  await browser.close();

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n✅ Successful: ${successful}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}\n`);

  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.name.padEnd(15)} - ${result.notes}`);
    if (result.errors.length > 0) {
      result.errors.forEach(err => console.log(`   └─ ${err}`));
    }
  });

  console.log('\n' + '='.repeat(60));

  return results;
}

// Create screenshots directory
import { mkdirSync } from 'fs';
try {
  mkdirSync('./screenshots', { recursive: true });
} catch (e) {
  // Directory might already exist
}

verifyPages().catch(console.error);
