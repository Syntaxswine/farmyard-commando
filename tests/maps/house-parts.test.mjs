// House parts: one self-contained file per Mount Dora building. These checks
// need neither Nautilus nor the lidar cache.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root, PARTS_DIR, loadTown, roundTrip, stampSectors, splitWalls, floorCells, validatePart, placementFromPart, shiftTreatment, pyFloat, pyDumps, PyFloat,
  placePoint, placePart, localAxisDeg, iou, localEntrances, toBlock, blockFits, BLOCK, MATERIALS, sha256} from '../../tools/maps/house-parts/house-parts.mjs';
import {generate, KEEP} from '../../tools/maps/house-parts/build-house-parts.mjs';
import {allBlocks, blocksSha256} from '../../tools/maps/house-parts/export-block.mjs';
import {RECEIPT, BROWSER_SAMPLES, sameHouse} from '../../tools/maps/house-parts/review-house-part-blocks.mjs';

const dir = path.join(root, PARTS_DIR), town = await loadTown(), {parts, index, files} = generate(town);
const byId = new Map(parts.map(p => [p.id, p])), geographic = new Map(town.features.features.map(f => [f.id, f.geographicGeometry?.coordinates]));
const offAxis = deg => { const m = ((deg % 90) + 90) % 90; return Math.min(m, 90 - m); };
const median = v => [...v].sort((a, b) => a - b)[Math.floor((v.length - 1) / 2)];
const solo = parts.find(p => p.walls.length > 4 && p.walls.every(w => !w.sharedWith.length) && p.storeys.count === 1);

test('every building has one current part file, listed in the index', () => {
  const buildings = town.features.features.filter(f => f.category === 'building').map(f => f.id);
  assert.equal(parts.length, 1076);
  assert.deepEqual(parts.map(p => p.id), buildings);
  const onDisk = fs.readdirSync(dir).filter(f => !KEEP.has(f)).sort();
  assert.deepEqual(onDisk, [...files.keys()].sort(), 'parts folder holds stale or missing files');
  for (const [name, text] of files) assert.equal(fs.readFileSync(path.join(dir, name), 'utf8'), text, name + ' is stale: run node tools/maps/house-parts/build-house-parts.mjs');
  for (const entry of index.parts) assert.equal(entry.sha256, sha256(files.get(entry.file)));
});

test('the parts stamp back into all 42 sectors byte for byte', () => {
  const trip = roundTrip(parts, town);
  assert.equal(trip.sectors, 42);
  assert.equal(trip.identical, 42, JSON.stringify(trip.mismatches[0]));
});

test('the round trip fails when a part is wrong', () => {
  const broken = mutate => { const ps = structuredClone(parts); mutate(ps, ps.find(p => p.id === solo.id)); return ps; };
  const cases = {
    'a wall moved 1 m': (ps, p) => { p.walls[0].a[0] += 1; p.walls[0].b[0] += 1; },
    'a dropped part': ps => ps.splice(ps.findIndex(p => p.id === solo.id), 1),
    'one more storey': (ps, p) => { p.storeys.count += 1; },
    'origin shifted 1 m': (ps, p) => { p.placements.grid.origin[0] += 1; },
    'another wall material': (ps, p) => { p.material.wall = MATERIALS.find(m => m !== p.material.wall); },
    'the outline squared to its bounds': (ps, p) => { const [w, h] = p.size; p.outline = [[[[0, 0], [w, 0], [w, h], [0, h], [0, 0]]]]; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const trip = roundTrip(broken(mutate), town);
    assert(trip.identical < 42, name + ' still reproduced every sector');
  }
  const shared = parts.find(p => p.walls.some(w => w.sharedWith.length)), ps = structuredClone(parts);
  const one = ps.find(p => p.id === shared.id).walls.find(w => w.sharedWith.length);
  one.a = [one.a[0] + 1, one.a[1]];
  assert.throws(() => roundTrip(ps, town), /Shared wall copies disagree/);
});

test('a floor no part claims comes back unclaimed, not as floor', () => {
  const lone = parts.find(p => p.provenance.sectors.length === 1 && p.walls.every(w => !w.sharedWith.length));
  const sid = lone.provenance.sectors[0], sector = town.sectors.find(s => s.id === sid);
  const map = JSON.parse(stampSectors(parts.filter(p => p.id !== lone.id), town).sectors.get(sid));
  const [y, x0] = lone.floorCells[0], [ox, oy] = lone.placements.grid.origin;
  assert.equal(map.terrain[y + oy - sector.origin.y][x0 + ox - sector.origin.x], 'no-part-for-this-floor');
});

test('the wall and floor mirrors follow the generator on synthetic shapes', () => {
  // Real Mount Dora has no wall piece over 60 m and no two-polygon outline, so these rules are pinned here.
  const extent = {sectorSizeM: 240, widthM: 480, depthM: 480, columns: 2, rows: 2};
  const pieces = (id, a, b) => splitWalls([{id, a, b, owners: ['x'], stories: 1, material: 'wood'}], extent).pieces;
  const rows = list => list.map(p => [p.id, p.a, p.b]);
  assert.deepEqual(rows(pieces('w1', [10, 10], [74, 10]).get('A01')), [['md-w1-1', [9.5, 9.5], [73.5, 9.5]]], '64 m stays one piece');
  assert.deepEqual(rows(pieces('w2', [10, 10], [74.5, 10]).get('A01')), [['md-w2-1', [9.5, 9.5], [41.75, 9.5]], ['md-w2-2', [41.75, 9.5], [74, 9.5]]], '64.5 m halves');
  const cut = pieces('w3', [230, 20], [250, 20]);
  assert.deepEqual(rows(cut.get('A01')), [['md-w3-1', [229.5, 19.5], [239.5, 19.5]]]);
  assert.deepEqual(rows(cut.get('B01')), [['md-w3-2', [-0.5, 19.5], [9.5, 19.5]]]);
  assert.deepEqual(rows(pieces('w4', [-5, 30], [5, 30]).get('A01')), [['md-w4-1', [-0.5, 29.5], [4.5, 29.5]]], 'the town edge clips');
  const outline = [[[[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]], [[[5, 0], [6, 0], [6, 2], [5, 2], [5, 0]]]];
  assert.deepEqual(floorCells(outline), [[0, 0, 3], [0, 5, 6], [1, 0, 1], [1, 2, 3], [1, 5, 6], [2, 0, 3]], 'both polygons count; the courtyard does not');
});

test('each part closes on its own, on the 1 m grid', () => {
  for (const part of parts) assert.deepEqual(validatePart(part), []);
  const drop = structuredClone(solo); drop.walls.pop();
  assert.match(validatePart(drop).join(), /walls do not trace the outline/);
  const doubled = structuredClone(solo); doubled.walls.push({...doubled.walls[0], sourceWallId: 'wall-extra'});
  assert.match(validatePart(doubled).join(), /walls do not trace the outline/);
  const cells = structuredClone(solo); cells.floorCells.pop();
  assert.match(validatePart(cells).join(), /floorCells/);
  const material = structuredClone(solo); material.material.wall = 'glass';
  assert.match(validatePart(material).join(), /unsupported wall material/);
  const shiftedOutline = structuredClone(solo); shiftedOutline.outline = shiftedOutline.outline.map(poly => poly.map(r => r.map(([x, y]) => [x + .5, y])));
  assert.match(validatePart(shiftedOutline).join(), /1 m grid/);
});

test('a shared party wall is the same wall on both sides', () => {
  let shared = 0;
  for (const part of parts) for (const wall of part.walls) for (const other of wall.sharedWith) {
    const twin = byId.get(other).walls.find(w => w.sourceWallId === wall.sourceWallId);
    assert(twin, `${other} lacks ${wall.sourceWallId}`);
    const town_ = (p, v) => [v[0] + p.placements.grid.origin[0], v[1] + p.placements.grid.origin[1]];
    assert.deepEqual([town_(part, wall.a), town_(part, wall.b)], [town_(byId.get(other), twin.a), town_(byId.get(other), twin.b)]);
    shared++;
  }
  assert(shared > 0);
});

test('the art kit placement rebuilds exactly from each part', () => {
  const kit = new Map(town.art.PLACEMENTS.filter(p => p.kind === 'building').map(p => [p.id, p]));
  for (const part of parts) assert.deepEqual(placementFromPart(part), kit.get(part.id));
  const donnelly = byId.get('osm-way-547799531');
  assert.deepEqual(donnelly.appearance.treatment.turret.centre, [19, 14]);
  assert.throws(() => shiftTreatment({type: 'vernacular', porchCorner: [1, 2]}, [0, 0]), /Unknown art treatment field porchCorner/);
});

test('Python float and JSON mirrors print as the generator does', () => {
  const cases = [[436, '436.0'], [1327.5, '1327.5'], [0.5, '0.5'], [-0.4, '-0.4'], [0.1, '0.1'], [0.0001, '0.0001'], [0.00001, '1e-05'],
    [1e16, '1e+16'], [123456789012345.6, '123456789012345.6'], [1.2345678901234568e+17, '1.2345678901234568e+17'], [-0, '-0.0'], [19.5, '19.5'], [127, '127.0']];
  for (const [value, text] of cases) assert.equal(pyFloat(value), text, String(value));
  assert.equal(pyDumps({a: [new PyFloat(127), 1, 'é'], b: null}), '{"a":[127.0,1,"é"],"b":null}\n');
});

test('a part placed at its true angle covers its measured footprint', () => {
  const turned = parts.filter(p => offAxis(p.placements.true.rotationDeg) > 5);
  assert(turned.length >= 40, 'too few turned houses to judge');
  const wrong = p => iou(p.outline.map(poly => poly.map(r => r.map(v => placePoint(v, {pivot: p.placements.pivot, at: p.placements.true.at, rotationDeg: -p.placements.true.rotationDeg})))), geographic.get(p.id));
  for (const p of turned) {
    assert(p.placements.true.fitIoU > p.placements.grid.fitIoU, p.id + ': the true pose is no better than the grid');
    assert(p.placements.true.fitIoU > wrong(p), p.id + ': the opposite turn fits as well');
  }
  assert(median(turned.map(p => p.placements.true.fitIoU)) >= .85);
  assert(median(turned.map(p => p.placements.grid.fitIoU)) < .75);
});

test('a part moves as one rigid unit at any angle', () => {
  const p = byId.get('osm-way-547799531'), {pivot, grid} = p.placements;
  for (const v of p.outline.flat(2)) assert.deepEqual(placePoint(v, {pivot, at: grid.at, rotationDeg: 0}).map(n => Number(n.toFixed(9))), [v[0] + grid.origin[0], v[1] + grid.origin[1]]);
  const length = w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  for (const deg of [17, 90, -133.4]) {
    const placed = placePart(p, {at: [100, 200], rotationDeg: deg});
    placed.walls.forEach((w, i) => assert(Math.abs(length(w) - length(p.walls[i])) < 1e-9));
    const [a, b] = [placed.walls[0], placed.walls[1]], angle = Math.atan2(a.b[1] - a.a[1], a.b[0] - a.a[0]) - Math.atan2(b.b[1] - b.a[1], b.b[0] - b.a[0]);
    const local = Math.atan2(p.walls[0].b[1] - p.walls[0].a[1], p.walls[0].b[0] - p.walls[0].a[0]) - Math.atan2(p.walls[1].b[1] - p.walls[1].a[1], p.walls[1].b[0] - p.walls[1].a[0]);
    assert(Math.abs(Math.sin(angle - local)) < 1e-9, 'walls kept their angles to each other');
  }
  const quarter = placePart(p, {at: pivot, rotationDeg: 90});
  assert.deepEqual(quarter.walls[0].a.map(n => Number(n.toFixed(9))), [pivot[0] - (p.walls[0].a[1] - pivot[1]), pivot[1] + (p.walls[0].a[0] - pivot[0])].map(n => Number(n.toFixed(9))));
});

test('lidar ridges turn into the part frame along its walls', () => {
  const ridged = parts.filter(p => ['gable', 'hip'].includes(p.roof.form) && p.roof.confidence >= .7 && p.roof.ridgeAxisDeg !== null);
  assert(ridged.filter(p => offAxis(p.roof.ridgeAxisDeg) <= 5).length / ridged.length >= .95);
  const turned = ridged.filter(p => offAxis(p.placements.true.rotationDeg) > 5);
  const right = turned.filter(p => offAxis(p.roof.ridgeAxisDeg) <= 5).length;
  const wrong = turned.filter(p => offAxis(localAxisDeg(p.roof.ridgeBearingMeasuredDeg, -p.placements.true.rotationDeg)) <= 5).length;
  assert(right >= turned.length / 2 && right > 3 * wrong, `turned ridges: ${right} right-sign vs ${wrong} wrong-sign of ${turned.length}`);
  assert.equal(localAxisDeg(57, -34.258), 1.3);
});

test('each true pose carries latitude and longitude within a millimetre', () => {
  for (const p of parts) {
    const [x, y] = town.projection.toTown(p.placements.true.latitude, p.placements.true.longitude);
    assert(Math.hypot(x - p.placements.true.at[0], y - p.placements.true.at[1]) < .001, p.id);
  }
});

test('entrances stay unknown unless a survey saw them', () => {
  assert(parts.every(p => p.entrances.status === 'not-surveyed' && !p.entrances.records.length));
  assert.deepEqual(localEntrances(undefined, [10, 20]), {status: 'not-surveyed', records: []});
  assert.equal(localEntrances({stories: '2'}, [10, 20]).status, 'not-recorded');
  const seen = localEntrances({entrances: [{segment: [[14, 20], [15, 20]]}], imageryDate: '2024-03', confidence: 'sure'}, [10, 20]);
  assert.deepEqual(seen.records, [{edge: [[4, 0], [5, 0]]}]);
  assert.equal(seen.observed, '2024-03');
});

test('an unrelated change to an input leaves the parts unchanged', () => {
  const changed = {...town, county: {...town.county, buildings: town.county.buildings.map(b => ({...b, camera: {heading: 90}}))}};
  const again = generate(changed);
  for (const [name, text] of again.files) assert.equal(text, files.get(name), name);
});

test('blocks hold the house alone and keep the wall-run contract', () => {
  const blocks = allBlocks();
  assert.equal(blocks.length, parts.filter(blockFits).length);
  assert.equal(blocks.length, 873);
  for (const {part, block} of blocks) {
    assert.equal(block.terrain.length, 24); assert(block.terrain.every(r => r.length === 24));
    assert.equal(block.upper.length, block.levels - 1); assert(block.levels >= 3 && block.levels <= 6);
    const ids = new Set(block.wallRuns.segments.map(s => s.id));
    assert.equal(ids.size, block.wallRuns.segments.length);
    for (const s of block.wallRuns.segments) {
      assert([...s.a, ...s.b].every(v => v >= -.5 && v <= BLOCK.size - .5), 'run endpoint outside the block');
      const length = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      assert(length >= .1 && length <= 64 && s.stories >= 1 && s.stories <= 5 && MATERIALS.includes(s.material));
    }
    const [ox, oy] = block.housePart.offset, cells = [];
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (block.terrain[y][x] === 'floor') cells.push(`${x - ox},${y - oy}`);
    assert.deepEqual(cells.sort(), part.floorCells.flatMap(([y, x0, x1]) => Array.from({length: x1 - x0}, (_, i) => `${x0 + i},${y}`)).sort());
    for (let z = 1; z < block.levels; z++) assert.equal(Object.keys(block.upper[z - 1]).length, z <= part.storeys.count ? cells.length : 0);
  }
  const big = parts.find(p => !blockFits(p));
  assert.throws(() => toBlock(big, 'x'), /does not fit/);
});

test('the workshop receipt covers the current blocks', () => {
  const receipt = JSON.parse(fs.readFileSync(RECEIPT, 'utf8')), blocks = allBlocks();
  assert.equal(receipt.blocksSha256, blocksSha256(blocks), 'blocks changed since the workshop check: rerun review-house-part-blocks.mjs');
  for (const count of Object.values(receipt.counts)) assert.equal(count, blocks.length);
  assert.deepEqual(receipt.failures, []);
  assert.equal(receipt.browser?.passed, true);
  assert.deepEqual(receipt.browser.scenarios.map(s => s.id), BROWSER_SAMPLES);
  assert(receipt.browser.scenarios.every(s => s.importedUnchanged && s.savedToDesignLibrary && s.exportedMapValid && s.exportedHouseMatchesPart));
  const same = blocks[0].block;
  assert(sameHouse(same, structuredClone(same)));
  const moved = structuredClone(same); moved.wallRuns.segments[0].a[0] += 1;
  assert(!sameHouse(same, moved));
});
