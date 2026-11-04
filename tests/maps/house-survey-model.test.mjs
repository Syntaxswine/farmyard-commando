// node --test tests/maps/house-survey-model.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {cleanAnswer, edgeKey, exportDocument, mergeAnswers, moveAnswer, nearestEdge, outlineText, pinMismatches, queueEntries, toggleEntrance, unitEdges,
  warningsFor} from '../../maps/mount-dora/reference/survey/model.js';

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
  const roofed = queue.filter(b => b.countySketch?.lidarSaw === 'class-6 roof' && b.county.records.length && b.streetView.onAddressedStreet && b.streetView.distanceM <= 60);
  assert.ok(roofed.length > 90);
  for (const b of roofed) assert.deepEqual(warningsFor(b).map(w => lacks.test(w)), [true], b.id);
  const stacked = roofed.find(b => b.countySketch.sketches > 1);
  assert.match(warningsFor(stacked)[0], new RegExp(`from ${stacked.countySketch.sketches} county sketches\\.`));
  // A county building with no record says so, like an OSM building with none.
  const recordless = queue.filter(b => b.countySketch && !b.county.records.length);
  assert.ok(recordless.length >= 1);
  for (const b of recordless) assert.match(warningsFor(b)[0], /^No county record/, b.id);
  // The OSM buildings are unchanged: a clean footprint match on its own street warns of nothing.
  assert.deepEqual(warningsFor(queue.find(b => !b.countySketch && b.match.method === 'footprint' && b.streetView.onAddressedStreet && b.streetView.distanceM <= 60)), []);
});

test('an import names what it was exported against that has changed since', () => {
  const pins = {reference: 'r1', countyBuildings: 'c1', outlines: 'o1'};
  assert.deepEqual(pinMismatches({reference: {sha256: 'r1'}, countyBuildings: {sha256: 'c0'}, outlines: {sha256: 'o0'}}, pins),
    ['county-buildings.json', 'the building outlines in features.json']);
  assert.deepEqual(pinMismatches({reference: {sha256: 'r1'}}, pins), [], 'a version 2 export pins only house-reference.json');
  assert.deepEqual(pinMismatches({reference: {sha256: 'r0'}}, pins), ['house-reference.json']);
});

test('the outlines pin moves with a building outline, not with what the generator writes about it', () => {
  const pin = list => createHash('sha256').update(outlineText(list)).digest('hex'), base = pin(features);
  const copy = () => JSON.parse(JSON.stringify(features)), first = list => list.find(f => f.id === 'county-1475627-1');
  // The generator writes each survey answer into nativeProxy; that must not read as an outline change.
  const surveyed = copy(); first(surveyed).nativeProxy = {...first(surveyed).nativeProxy, stories: 2, evidence: {survey: {roofShape: 'hip'}}};
  assert.equal(pin(surveyed), base);
  const moved = copy(); first(moved).geometry.coordinates[0][0][0][0] += 1;
  assert.notEqual(pin(moved), base);
  const renamed = copy(); first(renamed).id = 'county-1475627-2';
  assert.notEqual(pin(renamed), base);
});

test('answers for building ids the queue lacks are kept apart, never dropped, and can be moved or dropped', () => {
  const known = new Set(['osm-way-1', 'county-1-1']), at = t => `2026-11-0${t}T00:00:00.000Z`;
  // Export: an id the queue lacks goes under `unmatched`, which the generator ignores.
  const doc = exportDocument({answers: {'osm-way-1': {stories: '1', at: at(1)}, 'county-9-9': {stories: '2', at: at(2)}}, known, pins: {}, keys: KEYS, exportedAt: at(3)});
  assert.deepEqual([Object.keys(doc.answers), Object.keys(doc.unmatched)], [['osm-way-1'], ['county-9-9']]);
  assert.equal('unmatched' in exportDocument({answers: {'osm-way-1': {stories: '1'}}, known, pins: {}, keys: KEYS, exportedAt: at(3)}), false);
  // Import: a teammate's answer for an id this queue lacks is kept, and counted; the newer answer wins.
  const merged = mergeAnswers({'osm-way-1': {stories: '2', at: at(5)}}, {answers: {'osm-way-1': {stories: '3', at: at(4)}, 'county-7-7': {stories: '1', at: at(4)}},
    unmatched: {'county-8-8': {note: 'gone', at: at(4)}}}, KEYS, known);
  assert.deepEqual([merged.added, merged.unmatched], [2, 2]);
  assert.deepEqual([merged.answers['osm-way-1'].stories, merged.answers['county-7-7'].stories, merged.answers['county-8-8'].note], ['2', '1', 'gone']);
  // Move: to the building it belongs to, keeping only entrances on that outline.
  const edges = unitEdges([[[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]]]);
  const answer = {stories: '2', at: at(1), entrances: [{segment: [[1, 0], [2, 0]]}, {segment: [[9, 9], [9, 10]]}]};
  const result = moveAnswer({'county-9-9': answer}, 'county-9-9', 'county-1-1', edges);
  assert.deepEqual(Object.keys(result.answers), ['county-1-1']);
  assert.deepEqual([result.answers['county-1-1'].entrances.map(e => edgeKey(e.segment)), result.answers['county-1-1'].at, result.entrancesLeftOut], [['1,0:2,0'], at(1), 1]);
  assert.equal(moveAnswer({'county-9-9': answer, 'county-1-1': {stories: '1'}}, 'county-9-9', 'county-1-1', edges), null, 'never over another answer');
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
  const pins = {reference: 'abc', countyBuildings: 'def', outlines: 'ghi'}, known = new Set(['osm-way-1', 'osm-way-2', 'osm-way-3', 'county-1-1']);
  const doc = exportDocument({pins, known, keys: KEYS, exportedAt: '2026-11-03T00:00:00.000Z', answers: {
    'osm-way-2': {roofShape: 'hip', at: '2026-11-03T01:00:00.000Z'}, 'osm-way-1': {note: 'porch', at: 'x'}, 'osm-way-3': {stories: ''}, 'county-1-1': {stories: '2'}}});
  assert.equal(doc.version, 3);
  // The two files the queue came from, and the building outlines its entrance edges lie on.
  assert.deepEqual([doc.reference, doc.countyBuildings, doc.outlines], [{file: 'maps/mount-dora/reference/house-reference.json', sha256: 'abc'},
    {file: 'maps/mount-dora/reference/county-buildings.json', sha256: 'def'},
    {file: 'maps/mount-dora/features.json', fields: 'the id and authored geometry of every building', sha256: 'ghi'}]);
  assert.deepEqual(pinMismatches(doc, pins), [], 'an export matches what it was made from');
  assert.deepEqual(Object.keys(doc.answers), ['county-1-1', 'osm-way-1', 'osm-way-2']);
  assert.equal(doc.answers['osm-way-2'].at, '2026-11-03T01:00:00.000Z');
  for (const k of ['source', 'coordinates', 'observationDate', 'uncertainty', 'entrances', 'unmatched']) assert.ok(doc.evidence[k], k);
});
