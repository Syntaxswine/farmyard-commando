// node --test tests/maps/house-reference.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createProjection, headingDegrees} from '../../tools/maps/house-reference/projection.mjs';
import {area, centroid, contains, overlapArea} from '../../tools/maps/house-reference/geometry.mjs';
import {build, storeys, streetKey, MATCH} from '../../tools/maps/house-reference/build-house-reference.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const town = path.join(root, 'maps/mount-dora');
const json = file => JSON.parse(fs.readFileSync(path.join(town, file), 'utf8'));
const project = json('project.json'), features = json('features.json').features;
const reference = json('reference/house-reference.json');
const projection = createProjection(project.projection);

test('the JS projection reproduces every projected building node of the Python generator', () => {
  const osm = json('source/osm-downtown-snapshot.json');
  const nodes = new Map(osm.elements.filter(e => e.type === 'node').map(e => [e.id, e]));
  let checked = 0, worst = 0, roundTrip = 0;
  for (const f of features.filter(f => f.category === 'building' && f.nodeRefs)) {
    const points = f.geographicGeometry.coordinates.flat(2);
    for (const id of f.nodeRefs) {
      const node = nodes.get(id);
      if (!node) continue;
      const [x, y] = projection.toTown(node.lat, node.lon);
      worst = Math.max(worst, Math.min(...points.map(p => Math.hypot(p[0] - x, p[1] - y))));
      const [lat, lon] = projection.toLatLon(...projection.town(node.lat, node.lon));
      roundTrip = Math.max(roundTrip, Math.hypot((lat - node.lat) * 111132, (lon - node.lon) * 97500));
      checked++;
    }
  }
  assert.ok(checked > 5000, `checked ${checked} nodes`);
  assert.ok(worst <= 1.5e-4, `worst ${worst} m`);
  assert.ok(roundTrip < 1e-3, `round trip ${roundTrip} m`);
});

test('planar helpers: areas, holes, centroids and scanline overlap', () => {
  const square = (x, y, s) => [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]];
  const holed = [[...square(0, 0, 10), square(4, 4, 2)[0]]];
  assert.equal(area([square(0, 0, 10)]), 100);
  assert.equal(area(holed), 96);
  assert.deepEqual(centroid([square(2, 3, 4)]).map(v => Math.round(v * 1e9) / 1e9), [4, 5]);
  assert.equal(contains(holed, [5, 5]), false);
  assert.equal(contains(holed, [1, 1]), true);
  assert.ok(Math.abs(overlapArea([square(0, 0, 10)], [square(5, 5, 10)]) - 25) < 1e-6);
  assert.ok(Math.abs(overlapArea(holed, [square(0, 0, 10)]) - 96) < 1e-6);
  assert.equal(overlapArea([square(0, 0, 10)], [square(20, 0, 10)]), 0);
  const ell = [[[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10], [0, 0]]];
  assert.ok(Math.abs(overlapArea([ell], [square(0, 0, 10)]) - 64) < 1e-6);
});

test('compass headings and street names', () => {
  assert.equal(headingDegrees([0, 0], [0, -1]), 0); // town y runs south
  assert.equal(headingDegrees([0, 0], [1, 0]), 90);
  assert.equal(headingDegrees([0, 0], [0, 1]), 180);
  assert.equal(headingDegrees([0, 0], [-1, 0]), 270);
  assert.equal(streetKey('East 5th Avenue').full, streetKey('412 E FIFTH AVE').full);
  assert.notEqual(streetKey('W 5TH AVE').full, streetKey('East 5th Avenue').full);
  assert.equal(streetKey('W 5TH AVE').base, streetKey('East 5th Avenue').base);
  assert.equal(streetKey('North McDonald Street').base, streetKey('MCDONALD ST').base);
  assert.equal(streetKey('100 N ALEXANDER ST').full, 'N ALEXANDER ST');
  assert.equal(streetKey(''), null);
});

test('county storeys map onto the native kit', () => {
  assert.deepEqual(storeys('1.00', []), {stories: 1, halfStory: false, source: 'county:STORIES 1.00'});
  assert.deepEqual(storeys('1.50', []).halfStory, true);
  assert.deepEqual([storeys('2.75', []).stories, storeys('2.75', []).halfStory], [2, true]);
  assert.equal(storeys('1.25', []).halfStory, true);
  assert.equal(storeys('6.00', []).stories, 5);
  assert.equal(storeys('', ['FLA', 'FUS']).stories, 2);
  assert.equal(storeys('', ['FLA']).stories, null);
});

test('house-reference.json is exactly what the builder produces from the committed inputs', () => {
  const text = build();
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(town, 'reference/house-reference.json'))).digest('hex'),
    createHash('sha256').update(text).digest('hex'), 'Stale: run node tools/maps/house-reference/build-house-reference.mjs');
  assert.equal(reference.buildings.length, features.filter(f => f.category === 'building').length);
});

test('recorded footprint matches hold up, and the same test fails 30 m away (negative control)', () => {
  const sketches = new Map(json('reference/county/footprints.geojson').features.map(f => [`${f.properties.AltKey.trim()}#${Number.parseInt(f.properties.BuildingNumber, 10)}`, f]));
  const byId = new Map(features.map(f => [f.id, f]));
  const toTown = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(p => p.map(r => r.map(([lon, lat]) => projection.toTown(lat, lon))));
  const accept = (game, sketch) => { const o = overlapArea(game, sketch), iou = o / (area(game) + area(sketch) - o); return o / area(sketch) >= MATCH.assignCover || iou >= MATCH.assignIoU; };
  let held = 0, shiftedHeld = 0, n = 0;
  for (const b of reference.buildings.filter(b => b.match.method === 'footprint')) {
    const game = byId.get(b.id).geographicGeometry.coordinates, best = b.match.countyBuildings[0];
    const sketch = toTown(sketches.get(`${best.altKey}#${best.bldgNum}`).geometry);
    const shifted = sketch.map(p => p.map(r => r.map(([x, y]) => [x + 30, y])));
    held += accept(game, sketch); shiftedHeld += accept(game, shifted); n++;
  }
  assert.ok(n > 600, `${n} footprint matches`);
  assert.equal(held, n);
  assert.ok(shiftedHeld / n < .05, `${shiftedHeld} of ${n} still match 30 m east`);
});

test('every planned view is a keyless Google Maps URL within the documented ranges', () => {
  for (const b of reference.buildings) {
    const sv = b.streetView;
    assert.ok(sv, `${b.id} has no viewpoint`);
    const url = new URL(sv.url);
    assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/@');
    assert.equal(url.searchParams.get('api'), '1');
    assert.equal(url.searchParams.get('map_action'), 'pano');
    assert.equal(url.searchParams.has('key'), false);
    const heading = Number(url.searchParams.get('heading')), pitch = Number(url.searchParams.get('pitch')), fov = Number(url.searchParams.get('fov'));
    assert.ok(heading >= 0 && heading < 360 && pitch >= -90 && pitch <= 90 && fov >= 10 && fov <= 100, sv.url);
    const [lat, lon] = url.searchParams.get('viewpoint').split(',').map(Number), [x, y] = projection.toTown(lat, lon);
    assert.ok(Math.hypot(x - sv.town[0], y - sv.town[1]) < .2, `${b.id} viewpoint drifts from its town point`);
  }
});

test('the county snapshot keeps building facts only', () => {
  const header = file => fs.readFileSync(path.join(town, 'reference/county', file), 'utf8').split('\n', 1)[0].split(',');
  const banned = /OWNER|MAIL|GRANTEE|SALE|PRICE|VAL|EXEMPT|TAX|BEDRM|BATH/i;
  for (const file of ['buildings.csv', 'subareas.csv', 'extra-features.csv']) assert.deepEqual(header(file).filter(c => banned.test(c)), [], file);
  for (const file of ['parcels.geojson', 'footprints.geojson']) {
    const keys = new Set(json(`reference/county/${file}`).features.flatMap(f => Object.keys(f.properties)));
    assert.deepEqual([...keys].filter(k => banned.test(k)), [], file);
  }
  const text = fs.readFileSync(path.join(town, 'reference/house-reference.json'), 'utf8');
  assert.equal(/owner|grantee|sale_?price|appraised/i.test(text), false);
});
