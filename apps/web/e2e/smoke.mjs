/**
 * Browser smoke test: boots the production preview build in a real browser and walks the full journey.
 * Run: pnpm --filter web e2e   (needs Chrome/Edge installed; set CHROME_PATH to override)
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const PORT = 4173;
const URL_ = `http://localhost:${PORT}/`;
const chromePaths = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const { existsSync } = await import('node:fs');
const executablePath = chromePaths.find((p) => existsSync(p));
if (!executablePath) throw new Error('No Chrome/Edge found; set CHROME_PATH.');

const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
const stop = () => { try { server.kill(); spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' }); } catch { /* ignore */ } };

const errors = [];
let browser;
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(URL_)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 200)); }
  browser = await chromium.launch({ executablePath });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL_);

  const check = (cond, msg) => { if (!cond) throw new Error(`FAIL: ${msg}`); console.log(`ok - ${msg}`); };

  await page.getByTestId('engine-info').filter({ hasText: /SQLite \d/ }).waitFor({ timeout: 20_000 });
  check(true, 'worker booted and reports SQLite version');

  await page.getByRole('button', { name: 'Create table' }).click();
  await page.getByText('Seed table').waitFor();
  await page.getByLabel('Row count', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Seed table' }).click();
  await page.getByText(/Inserted 1,000 rows/).waitFor({ timeout: 20_000 });
  check(true, 'created and seeded 1,000 rows');

  await page.getByLabel('SQL editor').fill("SELECT * FROM users WHERE email = 'nobody@example.com'");
  await page.getByRole('button', { name: 'Run & explain' }).click();
  await page.getByRole('tree').getByText(/^SCAN users/).waitFor({ timeout: 10_000 });
  check(true, 'plan shows SCAN before index');

  await page.getByRole('button', { name: /Create index/ }).click();
  await page.getByRole('tree', { name: /After index/ }).getByText(/SEARCH users USING INDEX idx_users_email/).waitFor({ timeout: 20_000 });
  check(true, 'plan shows SEARCH ... USING INDEX after index');

  await page.getByLabel('SQL editor').fill('SELEC nope');
  await page.getByRole('button', { name: 'Run & explain' }).click();
  await page.getByRole('alert').filter({ hasText: /syntax error/i }).waitFor();
  check(true, 'SQL errors are displayed');

  await page.getByRole('button', { name: /Guided example/ }).click();
  await page.getByRole('tree').getByText(/^SCAN users/).waitFor({ timeout: 20_000 });
  check(true, 'guided example ends on a scan plan');

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Reset database' }).click();
  await page.getByText('Empty. No tables yet.').waitFor();
  check(true, 'reset empties the database');

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} catch (e) {
  console.error(e.message ?? e);
  if (errors.length) console.error('console errors:', errors);
  process.exitCode = 1;
} finally {
  await browser?.close();
  stop();
}
