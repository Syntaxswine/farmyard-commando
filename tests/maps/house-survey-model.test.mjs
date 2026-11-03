// node --test tests/maps/house-survey-model.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cleanAnswer, edgeKey, exportDocument, nearestEdge, toggleEntrance, unitEdges} from '../../maps/mount-dora/reference/survey/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const features = JSON.parse(fs.readFileSync(path.join(root, 'maps/mount-dora/features.json'), 'utf8')).features;
const KEYS = ['stories', 'roofShape', 'confidence', 'imageryDate', 'entrances', 'note'];

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
  const doc = exportDocument({sha256: 'abc', keys: KEYS, exportedAt: '2026-11-03T00:00:00.000Z', answers: {
    'osm-way-2': {roofShape: 'hip', at: '2026-11-03T01:00:00.000Z'}, 'osm-way-1': {note: 'porch', at: 'x'}, 'osm-way-3': {stories: ''}}});
  assert.equal(doc.version, 2);
  assert.deepEqual(Object.keys(doc.answers), ['osm-way-1', 'osm-way-2']);
  assert.equal(doc.answers['osm-way-2'].at, '2026-11-03T01:00:00.000Z');
  for (const k of ['source', 'coordinates', 'observationDate', 'uncertainty', 'entrances']) assert.ok(doc.evidence[k], k);
});
