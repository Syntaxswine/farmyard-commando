// Checks every house-part block in the real Nautilus workshop at its pin and
// writes the receipt maps/mount-dora/parts/workshop.json.
//
// Headless, each block that fits goes through the pinned engine's own
// validateBlock, import (openDocument), placeBlock into a blank map,
// validateMap, extractBlock back and four quarter turns. With --browser it
// also drives the real workshop page in a headless browser for three houses:
// Import the block file, Save it to the design library, switch to the map
// workspace, Place block, Export, and compares the exported map with the part.
//
//   node tools/maps/house-parts/review-house-part-blocks.mjs --source artifacts/mount-dora-workshop/nautilus-2502646 \
//     --git-source <read-only Nautilus repository> [--browser]
// Build the source first with tools/prepare-mount-dora-workshop.mjs (see maps/mount-dora/workshop/README.md).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {verifySource, sourceChanges, addedPaths} from '../../review-mount-dora-workshop.mjs';
import {reviewServer} from '../../serve-mount-dora-workshop.mjs';
import {NAUTILUS_COMMIT} from '../../../maps/mount-dora/workshop/model.js';
import {root, PARTS_DIR, sha256} from './house-parts.mjs';
import {allBlocks, blockText, blocksSha256} from './export-block.mjs';

export const RECEIPT = path.join(root, PARTS_DIR, 'workshop.json');
// Three houses for the browser: an L-shaped one-storey gable house (221 S John
// St), a two-storey county-sketched building with 16 walls, and the Donnelly
// House, which crosses sectors B02 and B03 in the town.
export const BROWSER_SAMPLES = ['osm-way-1240415865', 'county-1464765-1', 'osm-way-547799531'];
const SLOT = [4, 4];

// Wall runs as comparable geometry; placement renames ids to its destination.
const runGeometry = (runs, [dx, dy] = [0, 0]) => (runs || []).map(r => JSON.stringify([r.a[0] - dx, r.a[1] - dy, r.b[0] - dx, r.b[1] - dy, r.z, r.stories, r.material].map(v => typeof v === 'number' ? Number(v.toFixed(6)) : v))).sort();
const floors = (block, levels) => JSON.stringify({terrain: block.terrain, upper: Array.from({length: levels - 1}, (_, i) => Object.entries(block.upper[i] || {}).sort())});

// The same house in both blocks: ground, every upper level of the house and every wall run.
export function sameHouse(expected, actual) {
  return floors(expected, expected.levels) === floors(actual, expected.levels) && actual.upper.slice(expected.levels - 1).every(l => !Object.keys(l).length)
    && JSON.stringify(runGeometry(expected.wallRuns.segments)) === JSON.stringify(runGeometry(actual.wallRuns?.segments));
}

export function reviewHeadless(N, blocks) {
  const counts = {fit: blocks.length, validated: 0, importedUnchanged: 0, placedMapValid: 0, placedAndExtractedUnchanged: 0, quarterTurnsRestore: 0};
  const failures = [], added = new Set();
  for (const {id, block} of blocks) {
    try {
      N.validateBlock(structuredClone(block)); counts.validated++;
      const normalized = JSON.parse(N.openDocument(blockText(block)).export());
      assert.deepEqual(sourceChanges(block, normalized), [], 'import changed source values');
      for (const p of addedPaths(block, normalized)) added.add(p);
      counts.importedUnchanged++;
      const placed = N.placeBlock(N.blankMap('House part check'), normalized, ...SLOT), errors = N.validateMap(placed, {connectivity: false});
      assert.deepEqual(errors, [], 'placed map invalid');
      counts.placedMapValid++;
      assert(sameHouse(normalized, N.extractBlock(placed, ...SLOT)), 'placed and extracted house differs');
      counts.placedAndExtractedUnchanged++;
      let turned = normalized;
      for (let i = 0; i < 4; i++) turned = N.rotateSceneryBlock(turned);
      assert(sameHouse(normalized, turned), 'four quarter turns do not restore the house');
      counts.quarterTurnsRestore++;
    } catch (error) { failures.push({id, error: error.message}); }
  }
  return {counts, nativeAddedPaths: [...added].sort(), failures};
}

// The engine's rotation re-validates each block, about 5 s per house, so the
// blocks are shared round-robin between worker threads; results merge by id.
export async function reviewHeadlessParallel(source, blocks, threads = Math.max(1, Math.min(12, os.availableParallelism() - 2))) {
  const shares = Array.from({length: Math.min(threads, blocks.length)}, (_, i) => blocks.filter((_, j) => j % threads === i).map(b => b.id));
  const results = await Promise.all(shares.map(ids => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {workerData: {houseParts: true, source, ids}});
    worker.once('message', resolve); worker.once('error', reject);
    worker.once('exit', code => { if (code) reject(Error('Block review worker exited with ' + code)); });
  })));
  const counts = Object.fromEntries(Object.keys(results[0].counts).map(k => [k, results.reduce((s, r) => s + r.counts[k], 0)]));
  return {counts, nativeAddedPaths: [...new Set(results.flatMap(r => r.nativeAddedPaths))].sort(),
    failures: results.flatMap(r => r.failures).sort((a, b) => a.id < b.id ? -1 : 1)};
}

if (!isMainThread && workerData?.houseParts) {
  const N = await import(pathToFileURL(path.join(workerData.source, 'packages/map-core/index.js')).href), wanted = new Set(workerData.ids);
  parentPort.postMessage(reviewHeadless(N, allBlocks().filter(b => wanted.has(b.id))));
}

export async function reviewBrowser(source, blocks, out) {
  const {chromium} = await import(pathToFileURL(path.join(root, 'sites/tactical-animal/browser-tests/node_modules/playwright/index.mjs')).href);
  const N = await import(pathToFileURL(path.join(source, 'packages/map-core/index.js')).href);
  const review = {report: {sourceMode: 'house-parts', nautilusCommit: NAUTILUS_COMMIT}, project: path.join(root, 'maps/mount-dora/project.json'), source, out};
  const evidence = {browser: null, scenarios: [], errors: []}, byId = new Map(blocks.map(b => [b.id, b]));
  let browser, context, server, deadline;
  try {
    server = await reviewServer(review);
    browser = await chromium.launch({headless: true, ...(process.env.WORKSHOP_BROWSER_CHANNEL ? {channel: process.env.WORKSHOP_BROWSER_CHANNEL} : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
    evidence.browser = {version: browser.version(), channel: process.env.WORKSHOP_BROWSER_CHANNEL || 'locked-playwright-chromium', headless: true, softwareWebGL: true};
    deadline = setTimeout(() => { browser.close().catch(() => {}); process.exitCode = 1; }, 14 * 60 * 1000); deadline.unref();
    context = await browser.newContext({viewport: {width: 1440, height: 1100}, acceptDownloads: true});
    const page = await context.newPage();
    page.on('pageerror', e => evidence.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') evidence.errors.push(m.text()); });
    await page.goto(server.url + '/nautilus/');
    await page.waitForFunction(() => window.nautilus?.document && !window.editor3d?.loading, null, {timeout: 90000});
    for (const id of BROWSER_SAMPLES) {
      const {block, part} = byId.get(id), file = path.join(out, id + '.block.json');
      fs.writeFileSync(file, blockText(block));
      evidence.scenarios.push(await browserScenario(page, N, {id, part, block, file, out}));
    }
    assert.deepEqual(evidence.errors, [], 'Browser errors');
    evidence.passed = true;
  } catch (error) { evidence.passed = false; evidence.failure = error.stack; throw error; }
  finally {
    clearTimeout(deadline);
    if (context) await context.close();
    if (browser) await browser.close();
    if (server) { await server.close(); evidence.portReleased = await new Promise(resolve => { const s = net.connect(server.port, '127.0.0.1'); s.once('connect', () => { s.destroy(); resolve(false); }); s.once('error', () => resolve(true)); }); }
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(evidence, null, 2) + '\n');
  }
  return evidence;
}

// One house through the real controls, all in the workshop's Settings dialog:
// New map, Import, Save, back to the map workspace, Place selected block, Export.
async function browserScenario(page, N, {id, part, block, file, out}) {
  const dialogs = [], accept = dialog => { dialogs.push(dialog.message()); dialog.accept(); };
  const settings = async () => { if (!await page.locator('#editor-settings').evaluate(d => d.open)) await page.locator('#settings-button').click(); };
  const settled = (test, arg) => page.waitForFunction(test, arg, {timeout: 60000});
  const status = () => page.locator('#status').textContent();
  page.on('dialog', accept);
  try {
    await settings();
    await page.locator('#workspace').selectOption('map');
    await settled(() => !window.nautilus.document.block && !window.editor3d.loading);
    await page.evaluate(() => { window.__housePartBefore = window.nautilus.document; });
    await page.locator('#new-map').click();
    await settled(() => window.nautilus.document !== window.__housePartBefore && window.nautilus.document.map.name === 'New design' && !window.editor3d.loading);
    // The block arrives through the workshop's own file input, as a person imports it.
    await page.evaluate(() => { window.__housePartBefore = window.nautilus.document; });
    await page.locator('#import').setInputFiles(file);
    await settled(name => window.nautilus.document !== window.__housePartBefore && window.nautilus.document.block && window.nautilus.document.map.name === name && !window.editor3d.loading, block.name);
    const imported = JSON.parse(await page.evaluate(() => window.nautilus.export()));
    assert.deepEqual(sourceChanges(block, imported), [], 'Workshop import changed the block');
    await page.locator('#save-map').click();
    await settled(() => document.getElementById('saved-designs').value && /^Saved in this browser/.test(document.getElementById('status').textContent));
    const saved = await page.locator('#saved-designs').inputValue();
    await page.locator('#workspace').selectOption('map');
    await settled(() => !window.nautilus.document.block && window.nautilus.document.map.name === 'New design' && !window.editor3d.loading);
    await page.locator('#sector-x').fill(String(SLOT[0] + 1));
    await page.locator('#sector-y').fill(String(SLOT[1] + 1));
    await page.locator('#saved-designs').selectOption(saved);
    await page.locator('#place-block').click();
    await settled(() => /^(Block placed|Selected|Choose|.*rejected|.*crosses|.*conflict)/i.test(document.getElementById('status').textContent) && !window.editor3d.loading);
    assert.match(await status(), /^Block placed/, 'Place selected block did not place: ' + await status());
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
    const exportedFile = path.join(out, id + '-placed.map.json');
    await download.saveAs(exportedFile);
    const map = JSON.parse(fs.readFileSync(exportedFile, 'utf8'));
    assert.deepEqual(N.validateMap(map, {connectivity: false}), [], 'The exported map does not validate');
    const extracted = N.extractBlock(map, ...SLOT);
    assert(sameHouse(imported, extracted), 'The placed house in the exported map differs from the block');
    // Back from block coordinates to the part's own frame: the same cells and walls.
    const [ox, oy] = block.housePart.offset, cells = [];
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (extracted.terrain[y][x] === 'floor') cells.push([x - ox, y - oy]);
    const partCells = part.floorCells.flatMap(([y, x0, x1]) => Array.from({length: x1 - x0}, (_, i) => [x0 + i, y]));
    assert.deepEqual(cells.map(String).sort(), partCells.map(String).sort(), 'Exported floor cells are not the part\'s');
    assert.deepEqual(runGeometry(extracted.wallRuns.segments, [ox - .5, oy - .5]), runGeometry(part.walls.map(w => ({...w, z: 0, stories: part.storeys.count, material: part.material.wall}))), 'Exported walls are not the part\'s');
    await page.locator('#close-settings').click();
    const centre = [SLOT[0] * 24 + 12, SLOT[1] * 24 + 12];
    await page.evaluate(async c => { const e = window.editor3d; Object.assign(e.view, {x: c[0], y: c[1], span: 34, preset: '0'}); e.scene.changed(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, centre);
    const screenshot = path.join(out, id + '-placed.png');
    await page.locator('#scene').screenshot({path: screenshot});
    return {id, size: part.size, storeys: part.storeys.count, walls: part.walls.length, importedUnchanged: true, savedToDesignLibrary: true, placedInSlot: SLOT,
      exportedMapValid: true, exportedHouseMatchesPart: true, dialogsAccepted: dialogs.length, exportSha256: sha256(fs.readFileSync(exportedFile))};
  } finally { page.off('dialog', accept); }
}

if (isMainThread && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = flag => { const i = args.indexOf(flag); return i >= 0 ? path.resolve(args[i + 1]) : null; };
  const source = value('--source'), gitSource = value('--git-source') || source, out = path.join(root, 'artifacts/house-parts/workshop');
  if (!source) throw Error('Supply --source, an immutable Nautilus snapshot at ' + NAUTILUS_COMMIT);
  const provenance = verifySource(source, gitSource);
  const blocks = allBlocks(), headless = await reviewHeadlessParallel(source, blocks);
  fs.mkdirSync(out, {recursive: true});
  const previous = fs.existsSync(RECEIPT) ? JSON.parse(fs.readFileSync(RECEIPT, 'utf8')) : null;
  const browser = args.includes('--browser') ? await reviewBrowser(source, blocks, out) : previous?.browser ?? null;
  const receipt = {kind: 'house-part-workshop-receipt', version: 1, nautilusCommit: NAUTILUS_COMMIT, source: provenance,
    blocksSha256: blocksSha256(blocks), slot: SLOT, ...headless,
    browser: browser && {passed: browser.passed, browser: browser.browser, portReleased: browser.portReleased, scenarios: browser.scenarios}};
  fs.writeFileSync(RECEIPT, JSON.stringify(receipt, null, 1) + '\n');
  console.log(JSON.stringify({counts: headless.counts, failures: headless.failures.slice(0, 5), browser: receipt.browser?.passed ?? 'not run'}, null, 1));
  if (headless.failures.length) process.exitCode = 1;
}
