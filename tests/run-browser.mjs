import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') throw new Error('Run with the local demo Firebase emulators; production is never permitted.');
const dir = path.resolve('.verification');
await mkdir(dir, { recursive: true });
await build({ entryPoints: ['tests/browser/entry.tsx'], outfile: path.join(dir, 'fixture.js'), bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env': JSON.stringify({ NODE_ENV: 'development', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-agriguard-copy', NEXT_PUBLIC_FIREBASE_API_KEY: 'test-key', NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-agriguard-copy.firebaseapp.com' }) },
  plugins: [{ name: 'isolate-ui-only-dependencies', setup(builder) {
    // Only the auth context for the supplier UI is substituted. Firestore/Auth,
    // notifications, repositories, deletion and comparison code remain real.
    builder.onLoad({ filter: /src\/firebase\/index\.tsx$/ }, () => ({ contents: 'export const useAuth = () => ({ user: null });', loader: 'js' }));
    builder.onLoad({ filter: /src\/lib\/actions\/marketplace-actions\.ts$/ }, () => ({ contents: 'export async function sendMessageToSupplier() { throw new Error("Sending messages is outside this test"); }', loader: 'js' }));
  } }],
});
execFileSync(process.execPath, ['node_modules/tailwindcss/lib/cli.js', '-i', 'src/app/globals.css', '-o', path.join(dir, 'fixture.css')], { stdio: 'pipe' });
const server = createServer(async (req, res) => {
  if (req.url === '/fixture.js' || req.url === '/fixture.css') {
    res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : 'text/css');
    res.end(await readFile(path.join(dir, req.url.slice(1))));
  } else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><title>AgriGuard local verification</title><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.verification, { timeout: 40000 });
  const error = await page.evaluate(() => window.verification.error);
  assert.equal(error, undefined, error);
  console.log('PASS browser notifications: cross-client updates, saved read state, recovered alerts, deletion, admin totals and owner rules');
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    const sizes = [];
    for (const name of ['Call Now', 'WhatsApp', 'View on map']) {
      const box = await page.getByRole('link', { name, exact: true }).boundingBox();
      assert.ok(box && box.height >= 36 && box.height <= 44, `${name} at ${width}px must remain compact`);
      sizes.push({ name, height: box.height });
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `No horizontal overflow at ${width}px`);
    await page.screenshot({ path: path.join(dir, `components-${width}.png`), fullPage: true });
    console.log(`PASS supplier buttons at ${width}px:`, sizes);
  }
  await page.getByRole('button', { name: 'View model details', exact: true }).nth(1).click();
  assert.equal(await page.locator('a[href*="github.com"], a[href*="huggingface.co"]').count(), 0);
  assert.ok(await page.getByText('Crop score:', { exact: false }).isVisible());
  await page.getByRole('button', { name: 'Delete selected test report', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await page.evaluate(() => window.verification.status())).selectedExists, true, 'Cancel preserves record');
  await page.getByRole('button', { name: 'Delete selected test report', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete report', exact: true }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  const state = await page.evaluate(() => window.verification.status());
  assert.equal(state.selectedExists, false); assert.equal(state.otherExists, true); assert.equal(state.cropExists, true); assert.equal(state.plant.recordCount, 1);
  assert.deepEqual(errors, []);
  await writeFile(path.join(dir, 'browser-results.json'), JSON.stringify({ browser: 'Chromium', viewports: [1366, 390], notifications: 'passed', deletion: 'passed', modelAttribution: 'passed', consoleErrors: errors, liveGemini: 'not tested' }, null, 2));
  console.log('PASS delete confirmation/cancel, selected report removal, parent and other report preservation; no uncaught browser errors');
  await page.evaluate(() => window.verification.close());
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
