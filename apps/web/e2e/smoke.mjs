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
let page;
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(URL_)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 200)); }
  browser = await chromium.launch({ executablePath });
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL_);

  const check = (cond, msg) => { if (!cond) throw new Error(`FAIL: ${msg}`); console.log(`ok - ${msg}`); };

  await page.getByTestId('engine-info').filter({ hasText: /SQLite \d/ }).waitFor({ timeout: 20_000 });
  check(true, 'worker booted and reports SQLite version');

  await page.getByRole('button', { name: 'Create tables' }).click();
  await page.getByRole('button', { name: 'Seed all tables' }).waitFor();
  await page.getByLabel('Row count for users').fill('1000');
  await page.getByRole('button', { name: 'Seed all tables' }).click();
  await page.getByText(/Inserted 1,000 rows/).waitFor({ timeout: 20_000 });
  check(true, 'created and seeded 1,000 rows');

  await page.getByLabel('SQL editor').fill("SELECT * FROM users WHERE email = 'nobody@example.com'");
  await page.getByRole('button', { name: 'Run & explain' }).click();
  await page.getByRole('tree').getByText(/^SCAN users/).waitFor({ timeout: 10_000 });
  check(true, 'plan shows SCAN before index');

  await page.getByRole('button', { name: 'graph', exact: true }).click();
  await page.getByRole('group', { name: 'Query plan graph' }).getByRole('button', { name: /^SCAN users/ }).click();
  await page.getByRole('note').getByText(/Reads every row of users/).waitFor();
  check(true, 'SVG plan graph renders and shows a per-step note');
  await page.getByRole('button', { name: 'list', exact: true }).click();

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

  // --- Phase 1: multiple tables, foreign keys, experiments ---
  const exampleRow = (label) => page.locator('li', { hasText: label }).filter({ has: page.getByRole('button', { name: 'run' }) });
  await exampleRow('Join: orders by user').getByRole('button', { name: 'run' }).click();
  await page.getByRole('list', { name: 'Reading this plan' }).waitFor({ timeout: 30_000 });
  await page.getByText(/Inserted 12,000 rows/).waitFor();
  await page.getByText(/→ users\.id/).waitFor();
  check(true, 'join example: two tables seeded (12,000 rows), FK shown, plan insights visible');

  await page.getByLabel('SQL editor').waitFor();
  await page.locator('#idx-table').selectOption('orders');
  await page.locator('#idx-col').selectOption('user_id');
  await page.getByRole('button', { name: /Create index/ }).click();
  await page.getByRole('tree', { name: 'After index on orders' }).getByText(/idx_orders_user_id/).first().waitFor({ timeout: 30_000 });
  check(true, 'index on orders(user_id) changes the join plan');

  await page.getByLabel('Experiment name').fill('e2e saved');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.reload();
  await page.getByText('e2e saved').waitFor();
  check(true, 'saved experiment survives a reload (localStorage)');

  await page.getByRole('button', { name: 'Copy share link' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  check(/#exp=/.test(link), 'share link copied to clipboard');
  const shared = await context.newPage();
  await shared.goto(link);
  await shared.getByText(/Loaded shared experiment/).waitFor({ timeout: 20_000 });
  check((await shared.getByText(/Inserted/).count()) === 0, 'share link loads a definition without running anything');
  await shared.close();
  await page.getByLabel('Import experiment file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, name: 'x', seed: 1, sql: '', tables: [{ rowCount: 100, table: { name: 'a"; DROP TABLE x; --', columns: [] } }] })) });
  await page.getByText(/Import rejected/).waitFor();
  check(true, 'malicious import is rejected');

  // --- Safety: hostile and careless input through the real UI ---
  const runSql = async (sql) => {
    await page.getByLabel('SQL editor').fill(sql);
    await page.getByRole('button', { name: 'Run & explain' }).click();
  };
  const XSS = '<img src=x onerror=window.__pwn=1>';

  // The reload above cleared the in-memory database (by design), so rebuild the join example first.
  await exampleRow('Join: orders by user').getByRole('button', { name: 'run' }).click();
  await page.getByText(/Inserted 12,000 rows/).waitFor({ timeout: 30_000 });
  await page.getByRole('list', { name: 'Reading this plan' }).waitFor({ timeout: 30_000 });

  await runSql(`SELECT '${XSS}' AS x`);
  await page.getByRole('cell', { name: XSS }).waitFor();
  check((await page.evaluate(() => window.__pwn)) === undefined, 'HTML in query results is shown as text, not executed');
  check((await page.locator('#root img').count()) === 0, 'no <img> element was created from result data');

  await runSql('CRE');
  await page.getByRole('alert').filter({ hasText: /syntax error/i }).waitFor();
  await runSql('SELECT 42 AS answer');
  await page.getByRole('cell', { name: '42', exact: true }).waitFor();
  check(true, 'a typo ("CRE") shows a SQL error and the app keeps working');

  await runSql("ATTACH DATABASE 'x.db' AS y");
  await page.getByRole('alert').filter({ hasText: /not authorized/i }).waitFor();
  await runSql('PRAGMA max_page_count = 2000000000');
  await page.getByRole('alert').filter({ hasText: /not authorized/i }).waitFor();
  check(true, 'ATTACH and budget-lifting PRAGMAs are blocked');

  await runSql('CREATE TABLE "my table" (a INTEGER)');
  await page.locator('p', { hasText: 'my table' }).first().waitFor();
  check((await page.getByRole('alert').filter({ hasText: /already exists|my table/ }).count()) === 0, 'a table with an unusual name does not break the schema view or the plan panel');
  await page.locator('#idx-table').selectOption('my table');
  check(await page.getByRole('button', { name: /Create index/ }).isDisabled(), 'index experiment is disabled for names the form cannot quote safely');

  await page.locator('#idx-table').selectOption('users');
  await page.locator('#idx-col').selectOption('name');
  await page.getByLabel('SQL editor').fill('WITH x AS (SELECT 1) DELETE FROM orders');
  await page.getByRole('button', { name: /Create index/ }).click();
  await page.getByText(/read-only/i).first().waitFor({ timeout: 10_000 });
  await runSql('SELECT count(*) AS n FROM orders');
  await page.getByRole('cell', { name: '10000', exact: true }).waitFor();
  check(true, 'a write hidden behind WITH is refused by the benchmark and deletes nothing');

  await page.getByLabel('Import experiment file').setInputFiles({
    name: 'html.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, name: XSS, seed: 1, sql: 'SELECT 1', tables: [{ rowCount: 100, table: { name: 't', columns: [{ name: 'id', type: 'INTEGER', generator: 'sequence', primaryKey: true }] } }] })),
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText(XSS, { exact: true }).first().waitFor();
  check((await page.evaluate(() => window.__pwn)) === undefined && (await page.locator('#root img').count()) === 0, 'an experiment named with HTML is rendered as text');

  await page.getByLabel('SQL editor').fill('WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT count(*) FROM c');
  await page.getByRole('button', { name: 'Run & explain' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /Stop \(clears DB\)/ }).click();
  await page.getByText(/Canceled: worker terminated/).first().waitFor({ timeout: 10_000 });
  check(true, 'Stop terminates a runaway query and reports it');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await mobile.goto(URL_);
  await mobile.getByTestId('engine-info').filter({ hasText: /SQLite \d/ }).waitFor({ timeout: 20_000 });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `no horizontal overflow at 390px width (overflow=${overflow})`);
  await mobile.close();

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Reset database' }).click();
  await page.getByText('Empty. No tables yet.').waitFor();
  check(true, 'reset empties the database');

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} catch (e) {
  console.error(e.message ?? e);
  if (process.env.E2E_SCREENSHOT && page) await page.screenshot({ path: process.env.E2E_SCREENSHOT, fullPage: true }).catch(() => {});
  if (errors.length) console.error('console errors:', errors);
  process.exitCode = 1;
} finally {
  await browser?.close();
  stop();
}
