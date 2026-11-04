// Headless checks of the house survey page (maps/mount-dora/reference/survey/),
// driven through its own controls in Chromium: status messages reach the status
// line, nothing writes before the reference loads (a failed load or a slow one),
// a cleared or dropped answer stays cleared through an import of an older file,
// a stale tab's save keeps another tab's answers, and an answer for an unknown
// building id is listed, exported and kept.
//
//   node tools/maps/house-reference/test-survey-page.mjs
// Needs the browser-test dependencies (npm ci --prefix sites/tactical-animal/browser-tests,
// then npx playwright install chromium there), as the workshop job installs them.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const {chromium} = await import(pathToFileURL(path.join(root, 'sites/tactical-animal/browser-tests/node_modules/playwright/index.mjs')).href);
const STORE = 'mount-dora-house-survey-v1', HOUSE = 'county-1475627-1', OTHER = 'county-1082536-1', GONE = 'county-0000000-9';
const old = t => `2026-11-0${t}T00:00:00.000Z`;

// The repository's read-only survey server, on a free port; stopped by PID at the end.
const server = spawn(process.execPath, [path.join(root, 'tools/maps/house-reference/serve.mjs'), '0', '--minutes', '10'], {stdio: ['ignore', 'pipe', 'inherit']});
const base = await new Promise((resolve, reject) => {
  server.stdout.on('data', d => { const m = String(d).match(/http:\/\/127\.0\.0\.1:(\d+)\//); if (m) resolve(`http://127.0.0.1:${m[1]}/reference/survey/`); });
  server.on('exit', code => reject(Error(`the survey server exited (${code})`)));
});

const loaded = page => page.waitForFunction(() => document.querySelectorAll('#queue li').length > 0);
const statusLine = page => page.textContent('p#status');
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), STORE);
const seed = (page, answers) => page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE, JSON.stringify(answers)]);
// Every page a scenario opens reports its uncaught errors here; any one fails the scenario.
let pageErrors = [];
const watch = page => { page.on('pageerror', error => pageErrors.push(error.message)); page.on('dialog', dialog => dialog.accept()); return page; };
const open = async (context, answers) => {
  const page = watch(await context.newPage());
  await page.goto(base);
  if (answers) { await seed(page, answers); await page.reload(); }
  return page;
};
const answerStoreys = async (page, id) => {
  await page.click(`#queue button[data-id="${id}"]`);
  await page.locator('#fields fieldset').first().locator('button').first().click();
};
const exportFile = async page => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  return JSON.parse(await fs.readFile(await download.path(), 'utf8'));
};
const importFile = async (page, doc) => {
  await page.setInputFiles('#import', {name: 'house-survey.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc))});
  await page.waitForFunction(() => /^(Imported|Import failed|The house reference)/.test(document.querySelector('p#status').textContent));
};

const browser = await chromium.launch({headless: true});
let passed = 0;
const scenario = async (name, run) => {
  const context = await browser.newContext({acceptDownloads: true});
  pageErrors = [];
  try {
    await run(context);
    assert.deepEqual(pageErrors, [], `uncaught page errors in "${name}"`);
    passed++; console.log(`ok - ${name}`);
  } finally { await context.close(); }
};
try {
  await scenario('status messages reach the status line, and the Show filter keeps its options', async context => {
    const page = await open(context); await loaded(page);
    await answerStoreys(page, HOUSE);
    await exportFile(page);
    assert.match(await statusLine(page), /^Exported 1 answer/);
    assert.deepEqual(await page.$eval('#show', s => [s.options.length, s.value]), [3, 'todo']);
  });

  await scenario('until the reference loads, no control writes: a failed load, then a slow one', async context => {
    const saved = {'osm-way-1': {stories: '2', at: old(1)}, 'osm-way-2': {wall: 'brick', at: old(1)}, 'osm-way-3': {note: 'porch', at: old(1)}};
    await context.route('**/county-buildings.json', route => route.fulfill({status: 404, body: ''}));
    const page = await open(context, saved);
    await page.waitForFunction(() => /^Could not load/.test(document.getElementById('summary').textContent));
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.click('#clear');
    await page.fill('#note', 'typed before load'); await page.dispatchEvent('#note', 'change');
    await page.fill('#imagery', '2024-03'); await page.dispatchEvent('#imagery', 'change');
    await importFile(page, {kind: 'mount-dora-house-survey', version: 3, answers: {'osm-way-9': {stories: '1', at: old(4)}}});
    await page.click('#export');
    assert.deepEqual(await stored(page), saved, 'a failed load leaves the saved answers as they were');
    assert.equal(downloads, 0);
    assert.match(await statusLine(page), /has not loaded/);
    // A slow load: features.json arrives after the person has typed a date.
    await context.unroute('**/county-buildings.json');
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await context.route('**/features.json', async route => { await held; await route.continue(); });
    await page.reload();
    await page.fill('#imagery', '2024-04'); await page.dispatchEvent('#imagery', 'change');
    assert.deepEqual(await stored(page), saved, 'nothing written while loading');
    release(); await loaded(page);
    assert.deepEqual(await stored(page), saved, 'nor afterwards, from what was typed while loading');
  });

  await scenario('a cleared or dropped answer stays cleared through an import of an older export', async context => {
    const page = await open(context, {[GONE]: {stories: '2', note: 'moved?', at: old(1)}}); await loaded(page);
    await answerStoreys(page, HOUSE);
    const committed = await exportFile(page);
    assert.deepEqual(Object.keys(committed.answers).sort(), [GONE, HOUSE].sort());
    await page.click('#clear');
    await page.locator('#unknown div', {hasText: GONE}).locator('button').click();
    assert.equal(await page.isHidden('#unknown'), true, 'the dropped answer leaves the panel');
    await importFile(page, committed);
    const after = await stored(page);
    assert.deepEqual([after[HOUSE].cleared, after[GONE].cleared], [true, true], 'the older answers do not come back');
    assert.equal(await page.isHidden('#unknown'), true);
    const next = await exportFile(page);
    assert.equal(HOUSE in next.answers || GONE in next.answers, false);
    assert.deepEqual(Object.keys(next.cleared).sort(), [GONE, HOUSE].sort());
    // A newer answer does replace a clearing.
    await importFile(page, {kind: 'mount-dora-house-survey', version: 3, answers: {[HOUSE]: {stories: '2', at: '2099-01-01T00:00:00.000Z'}}});
    assert.equal((await stored(page))[HOUSE].stories, '2');
  });

  await scenario('a stale tab\'s save keeps the answers another tab saved since', async context => {
    const first = await open(context), second = watch(await context.newPage());
    await second.goto(base); await loaded(first); await loaded(second);
    await answerStoreys(first, HOUSE);
    await answerStoreys(second, OTHER);
    const after = await stored(second);
    assert.ok(after[HOUSE]?.stories && after[OTHER]?.stories, JSON.stringify(after));
  });

  await scenario('an answer for an unknown building id is listed with what it holds, exported and kept on import', async context => {
    const page = await open(context, {[GONE]: {stories: '2', note: 'x', at: old(1)}}); await loaded(page);
    assert.equal(await page.isVisible('#unknown'), true);
    assert.match(await page.textContent('#unknown div'), new RegExp(`${GONE}stories 2, a noteDrop`));
    assert.ok(GONE in (await exportFile(page)).answers);
    await importFile(page, {kind: 'mount-dora-house-survey', version: 3, answers: {'county-5555555-1': {stories: '1', at: old(4)}}});
    assert.match(await statusLine(page), /1 of them for building ids not in this queue/);
    assert.ok((await stored(page))['county-5555555-1']);
  });
} finally {
  await browser.close();
  server.kill();
}
console.log(`house survey page: ${passed} scenarios passed`);
