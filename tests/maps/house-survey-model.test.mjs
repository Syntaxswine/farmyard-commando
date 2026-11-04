// node --test tests/maps/house-survey-model.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cleanAnswer, edgeKey, exportDocument, nearestEdge, pinMismatches, PINNED, queueEntries, toggleEntrance, unitEdges, warningsFor} from '../../maps/mount-dora/reference/survey/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = file => JSON.parse(fs.readFileSync(path.join(root, 'maps/mount-dora', file), 'utf8'));
const features = json('features.json').features;
const KEYS = ['stories', 'roofShape', 'confidence', 'imageryDate', 'entrances', 'note'];

const reference = json('reference/house-reference.json'), county = json('reference/county-buildings.json');
const queue = queueEntries(reference, county, features), entry = id => queue.find(b => b.id === id);

test('the queue holds every game building once: the OSM ones and the county ones, shaped alike', () => {
  assert.deepEqual(queue.map(b => b.id).sort(), features.filter(f => f.category === 'building').map(f => f.id).sort());
  // A county entry has a value for every field the page reads from a house-reference.json building.
  const fields = Object.keys(reference.buildings[0]);
  for (const b of queue.slice(reference.buildings.length)) {
    assert.deepEqual(fields.filter(k => b[k] === undefined), [], b.id);
    assert.ok(b.sectors.length && b.streetView && b.county.records && b.suggested && b.match.method === 'county-sketch' && b.countySketch.sketches >= 1, b.id);
  }
});

test('a county building warns that OSM lacks it, and to check it stands where the 2018 lidar saw no roof', () => {
  const lacks = /^OpenStreetMap lacks this building/, noRoof = /^The 2018 lidar saw no building roof here/;
  // A 1935 house on open ground in December 2018, with its camera on its own street.
  const open = warningsFor(entry('county-1475627-1'));
  assert.equal(open.length, 2, open.join(' | '));
  assert.match(open[0], lacks); assert.match(open[0], /from the county sketch\./); assert.match(open[1], noRoof);
  const roofed = queue.filter(b => b.countySketch?.lidarSaw === 'class-6 roof' && b.streetView.onAddressedStreet && b.streetView.distanceM <= 60);
  assert.ok(roofed.length > 90);
  for (const b of roofed) assert.deepEqual(warningsFor(b).map(w => lacks.test(w)), [true], b.id);
  const stacked = roofed.find(b => b.countySketch.sketches > 1);
  assert.match(warningsFor(stacked)[0], new RegExp(`from ${stacked.countySketch.sketches} county sketches\\.`));
  // The OSM buildings are unchanged: a clean footprint match on its own street warns of nothing.
  assert.deepEqual(warningsFor(queue.find(b => !b.countySketch && b.match.method === 'footprint' && b.streetView.onAddressedStreet && b.streetView.distanceM <= 60)), []);
});

test('an import names each file it was exported against that has changed since', () => {
  const pins = {reference: 'r1', countyBuildings: 'c1', features: 'f1'};
  assert.deepEqual(pinMismatches({reference: {sha256: 'r1'}, countyBuildings: {sha256: 'c0'}, features: {sha256: 'f0'}}, pins), ['county-buildings.json', 'features.json']);
  assert.deepEqual(pinMismatches({reference: {sha256: 'r1'}}, pins), [], 'a version 2 export pins only house-reference.json');
  assert.deepEqual(pinMismatches({reference: {sha256: 'r0'}}, pins), ['house-reference.json']);
});

test('authored outlines split into 1 m wall edges', () => {
  const lShape = [[[[0, 0], [3, 0], [3, 1], [1, 1], [1, 2], [0, 2], [0, 0]]]];
  const edges = unitEdges(lShape);
  assert.equal(edges.length, 10);
  for (const [a, b] of edges) assert.equal(Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]), 1);
  assert.equal(new Set(edges.map(edgeKey)).size, 10);
  assert.deepEqual(unitEdges([[[[0, 0], [2.5, 0], [2.5, 2], [0, 0]]]]), [], 'oblique or fractional runs carry no door edges');
});

test('every grid-aligned game building offers its whole perimeter for entrances', () => {
  let buildings = 0, partial = [];
  for (const f of features.filter(f => f.category === 'building')) {
    const perimeter = f.geometry.coordinates.flat().reduce((sum, ring) => sum + ring.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - ring[i][0], p[1] - ring[i][1]), 0), 0);
    const edges = unitEdges(f.geometry.coordinates).length;
    buildings++;
    if (Math.abs(edges - perimeter) > 1e-9) partial.push(f.id);
  }
  assert.equal(buildings, 950 + 126, '950 OSM outlines and 126 county buildings (reference/county-buildings.json)');
  assert.deepEqual(partial, [], `outlines that are not fully on the 1 m grid: ${partial.join(', ')}`);
});

test('a click snaps to the nearest edge, and only close to the outline', () => {
  const edges = unitEdges([[[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]]]);
  assert.equal(edgeKey(nearestEdge(edges, [2.4, -.3], 1).segment), '2,0:3,0');
  assert.equal(edgeKey(nearestEdge(edges, [4.2, 1.5], 1).segment), '4,1:4,2');
  assert.equal(nearestEdge(edges, [2, 2], 1), null, 'the middle of the floor is not a wall');
});

test('marking an edge twice removes it, and the list stays ordered', () => {
  const a = [[2, 0], [3, 0]], b = [[0, 1], [0, 2]];
  let list = toggleEntrance([], a);
  list = toggleEntrance(list, b);
  assert.deepEqual(list.map(e => edgeKey(e.segment)), ['0,1:0,2', '2,0:3,0']);
  assert.deepEqual(toggleEntrance(list, a).map(e => edgeKey(e.segment)), ['0,1:0,2']);
});

test('answers keep only valid evidence, and the export says what each field means', () => {
  assert.equal(cleanAnswer({stories: '', entrances: [], imageryDate: '03/2024', confidence: 'certain'}, KEYS), null);
  assert.deepEqual(cleanAnswer({stories: '2', imageryDate: '2024-03', confidence: 'likely', extra: 1}, KEYS), {stories: '2', confidence: 'likely', imageryDate: '2024-03'});
  const doc = exportDocument({pins: {reference: 'abc', countyBuildings: 'def', features: 'ghi'}, keys: KEYS, exportedAt: '2026-11-03T00:00:00.000Z', answers: {
    'osm-way-2': {roofShape: 'hip', at: '2026-11-03T01:00:00.000Z'}, 'osm-way-1': {note: 'porch', at: 'x'}, 'osm-way-3': {stories: ''}, 'county-1-1': {stories: '2'}}});
  assert.equal(doc.version, 3);
  // The two files the queue came from, and the outlines its entrance edges lie on.
  assert.deepEqual([doc.reference, doc.countyBuildings, doc.features], [{file: PINNED.reference, sha256: 'abc'}, {file: PINNED.countyBuildings, sha256: 'def'},
    {file: 'maps/mount-dora/features.json', sha256: 'ghi'}]);
  assert.deepEqual(pinMismatches(doc, {reference: 'abc', countyBuildings: 'def', features: 'ghi'}), [], 'an export matches the files it was made from');
  assert.deepEqual(Object.keys(doc.answers), ['county-1-1', 'osm-way-1', 'osm-way-2']);
  assert.equal(doc.answers['osm-way-2'].at, '2026-11-03T01:00:00.000Z');
  for (const k of ['source', 'coordinates', 'observationDate', 'uncertainty', 'entrances']) assert.ok(doc.evidence[k], k);
});
