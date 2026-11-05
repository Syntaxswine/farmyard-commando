// node --test tests/maps/house-reference.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createProjection, headingDegrees} from '../../tools/maps/house-reference/projection.mjs';
import {area, centroid, contains, overlapArea} from '../../tools/maps/house-reference/geometry.mjs';
import {build, storeys, MATCH} from '../../tools/maps/house-reference/build-house-reference.mjs';
import {isOsm} from '../../tools/maps/house-reference/features-digest.mjs';
import {planStreetView, streetKey, viewRoads} from '../../tools/maps/house-reference/viewpoint.mjs';

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
  // Neither a unit nor a house-number suffix is part of the street...
  assert.equal(streetKey('350 LIBERTY AVE # 14').full, streetKey('Liberty Avenue').full);
  assert.equal(streetKey('343 N MCDONALD ST APT 102').base, streetKey('McDonald Street').base);
  assert.equal(streetKey('343 N MCDONALD ST APT101').full, 'N MCDONALD ST');
  assert.equal(streetKey('525 N TREMAIN ST # 1-A').full, 'N TREMAIN ST');
  assert.equal(streetKey('12 E 5TH AVE UNIT 3').full, 'E 5TH AVE');
  assert.equal(streetKey('445 S GRANDVIEW ST 10').full, 'S GRANDVIEW ST');
  assert.equal(streetKey('112-D S GRANDVIEW ST').full, 'S GRANDVIEW ST');
  assert.equal(streetKey('142A/B W 4TH AVE').full, 'W 4TH AVE');
  for (const unit of ['12 MAIN ST UNIT A', '12 MAIN ST 10-A', '12 MAIN ST A', '12 MAIN ST STE 200', '12 MAIN ST STE. 5', '12 MAIN ST APT. 3'])
    assert.equal(streetKey(unit).full, 'MAIN ST', unit);
  // ...a direction written last or glued on moves to the front...
  assert.equal(streetKey('620 HIGHLAND ST N').full, streetKey('North Highland Street').full);
  assert.equal(streetKey('325 E3RD AVE').full, streetKey('East 3rd Avenue').full);
  // ...but a name with a unit word in it, a lettered street and a route number stay.
  assert.equal(streetKey('100 STEWART AVE').full, 'STEWART AVE');
  assert.equal(streetKey('Unity Lane').full, 'UNITY LN');
  assert.equal(streetKey('12 APTOS ST').full, 'APTOS ST');
  assert.equal(streetKey('9 SUITER DR').full, 'SUITER DR');
  assert.equal(streetKey('123 STE CLAIRE ST').full, 'STE CLAIRE ST');
  assert.equal(streetKey('9 SUITE ST').full, 'SUITE ST');
  assert.equal(streetKey('100 UNIT RD').full, 'UNIT RD');
  assert.equal(streetKey('Avenue A').full, 'AVE A');
  assert.equal(streetKey('100 W AVE A').full, 'W AVE A');
  assert.equal(streetKey('1234 STATE ROAD 19').full, 'STATE RD 19');
  assert.equal(streetKey('US Highway 441').full, 'US HWY 441');
  // Known gap: an address without a street type matches no road ("N GRANDVIEW" is not "N GRANDVIEW ST").
  assert.notEqual(streetKey('460 N GRANDVIEW').full, streetKey('North Grandview Street').full);
});

test('the camera prefers the addressed street, by its full name, unless it is much farther than the nearest public road', () => {
  // East-west roads; the building's centre is the origin, and town y runs south.
  const road = (id, name, y, highway = 'residential') => ({id, osm: {}, category: 'road', tags: {name, highway}, geometry: {type: 'LineString', coordinates: [[-200, y], [200, y]]}});
  const toLatLon = (x, y) => [28.8 - y / 111132, -81.6 + x / 97500], house = {geometry: [[[[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]]]], box: [-5, -5, 5, 5], centre: [0, 0]};
  const plan = (roads, address) => planStreetView(viewRoads(roads), house, {stories: 1, address}, toLatLon);
  assert.equal(plan([road('a', 'Elm Street', 40), road('b', 'Oak Street', -10)], '1 ELM ST').road, 'Elm Street', 'within 45 m, the addressed street wins');
  assert.equal(plan([road('a', 'Elm Street', 70), road('b', 'Oak Street', -10)], '1 ELM ST').road, 'Oak Street', 'beyond 45 m and 25 m past the public road');
  assert.equal(plan([road('a', 'Elm Street', 70), road('b', 'Oak Street', -50)], '1 ELM ST').road, 'Elm Street', 'within 25 m of the public road');
  const ew = plan([road('e', 'East Elm Street', 10), road('w', 'West Elm Street', 30)], '1 W ELM ST');
  assert.deepEqual([ew.road, ew.onAddressedStreet], ['West Elm Street', true], 'W ELM ST does not snap to the nearer East Elm');
  assert.equal(plan([road('e', 'East Elm Street', 10), road('w', 'West Elm Street', 30)], null).road, 'East Elm Street');
  assert.equal(plan([road('s', 'Back Alley', 20, 'service'), road('p', 'Oak Street', 60)], null).road, 'Oak Street', 'a public road before a service road');
  assert.equal(plan([road('s', 'Back Alley', 20, 'service')], null).road, 'Back Alley');
  assert.equal(plan([road('far', 'Oak Street', 120)], null), null, 'no road within 90 m');
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
  // One record per OSM building; the county buildings the generator adds come from it (county-buildings.json).
  assert.equal(reference.buildings.length, features.filter(f => f.category === 'building' && isOsm(f)).length);
});

// County parcels and sketches in town metres, for the lot tests.
const lotEvidence = (() => {
  const toTown = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(p => p.map(r => r.map(([lon, lat]) => projection.toTown(lat, lon))));
  const parcels = json('reference/county/parcels.geojson').features.map(f => ({altKey: f.properties.AltKey.trim(),
    landUse: (f.properties.LandUseDescription || '').trim(), yearBuilt: Number.parseInt(f.properties.YearBuilt, 10) || null, geometry: toTown(f.geometry)}))
    .map(p => { const xy = p.geometry.flat(2); return {...p, area: area(p.geometry), box: [Math.min(...xy.map(q => q[0])), Math.min(...xy.map(q => q[1])), Math.max(...xy.map(q => q[0])), Math.max(...xy.map(q => q[1]))]}; });
  const sketches = new Map(json('reference/county/footprints.geojson').features
    .map(f => [`${f.properties.AltKey.trim()}/${Number.parseInt(f.properties.BuildingNumber, 10)}`, toTown(f.geometry)]));
  return {parcels, sketches, parcelsOf: altKey => parcels.filter(p => p.altKey === altKey)};
})();

test('a building takes the parcel its county sketches are filed under, where they lie on it', () => {
  const {parcels, sketches, parcelsOf} = lotEvidence;
  // The rule, worked out here on its own. First the parcel a sketch is filed
  // under, unless it is a condo unit, where at least 1% of the sketch lies on it.
  const own = k => { const g = sketches.get(k), share = .01 * area(g);
    return parcelsOf(k.split('/')[0]).some(p => !/CONDO/.test(p.landUse) && overlapArea(g, p.geometry) >= share) ? k.split('/')[0] : null; };
  // Otherwise the parcel under the centre: the smallest that is not a condo
  // unit, else the smallest.
  const underCentre = ([x, y]) => {
    const hits = parcels.filter(p => x >= p.box[0] && x <= p.box[2] && y >= p.box[1] && y <= p.box[3] && contains(p.geometry, [x, y]))
      .sort((a, b) => a.area - b.area || a.altKey.localeCompare(b.altKey));
    return (hits.find(p => !/CONDO/.test(p.landUse)) || hits[0])?.altKey ?? null;
  };
  const tally = {countyOnly: {own: 0, centre: 0}, game: {own: 0, centre: 0}};
  for (const c of reference.countyOnly) {
    const k = `${c.altKey}/${c.bldgNum}`, lot = own(k);
    tally.countyOnly[lot ? 'own' : 'centre']++;
    assert.equal(c.parcel?.altKey ?? null, lot ?? underCentre(centroid(sketches.get(k))), k);
  }
  // A game building whose sketches are all filed under one parcel takes it;
  // sketches spread over several parcels leave the parcel under its centre.
  const outlines = new Map(features.map(f => [f.id, f.geographicGeometry?.coordinates]));
  for (const b of reference.buildings) {
    const held = b.match.countyBuildings || [];
    const lot = held.length && new Set(held.map(m => m.altKey)).size === 1 ? own(`${held[0].altKey}/${held[0].bldgNum}`) : null;
    tally.game[lot ? 'own' : 'centre']++;
    assert.equal(b.parcel?.altKey ?? null, lot ?? underCentre(centroid(outlines.get(b.id))), b.id);
  }
  assert.deepEqual(tally, {countyOnly: {own: 126, centre: 121}, game: {own: 740, centre: 210}});
});

test('the lots the parcel under the centre got wrong, and the ones left on it', () => {
  const {sketches, parcelsOf} = lotEvidence;
  const only = new Map(reference.countyOnly.map(c => [`${c.altKey}/${c.bldgNum}`, c])), game = new Map(reference.buildings.map(b => [b.id, b]));
  const on = (altKey, point) => parcelsOf(altKey).some(p => contains(p.geometry, point));
  // Two lakefront sketches have their centres on Lake Dora's submerged-land
  // parcel 3883811 ("LAKESHORE DR"), and two game houses have theirs on the
  // vacant lot next door. Each reads its own lot.
  assert.equal(parcelsOf('3883811')[0].landUse, 'GOVT SUBMERGED LAND');
  for (const k of ['1236797/1', '1475414/2']) assert.ok(on('3883811', centroid(sketches.get(k))), k);
  assert.deepEqual(['1236797/1', '1475414/2'].map(k => [only.get(k).address, only.get(k).parcel.altKey]),
    [['401 LAKE DORA RD', '1236797'], ['402 LAKE DORA RD', '1475414']]);
  for (const [id, vacant] of [['osm-way-1240419568', '1132860'], ['osm-way-1240419587', '3816701']]) {
    assert.equal(parcelsOf(vacant)[0].landUse, 'VACANT RESIDENTIAL');
    assert.ok(on(vacant, centroid(features.find(f => f.id === id).geographicGeometry.coordinates)), id);
  }
  assert.deepEqual(['osm-way-1240419568', 'osm-way-1240419587'].map(id => [game.get(id).address, game.get(id).parcel.altKey]),
    [['610 E 1ST AVE', '1469091'], ['221 S CLAYTON ST', '1473331']]);
  // A county-only sketch's lot is another parcel only for condo units, whose
  // building keeps its common lot, and for one store drawn wholly on the lot
  // next door, where the drawing and the record disagree.
  const elsewhere = {};
  for (const c of reference.countyOnly) if (c.parcel?.altKey !== c.altKey) (elsewhere[c.parcel?.altKey ?? 'no lot'] ??= []).push(`${c.altKey}/${c.bldgNum}`);
  assert.deepEqual(Object.fromEntries(Object.entries(elsewhere).map(([lot, list]) => [lot, list.length]).sort()),
    {1470854: 1, 3891857: 9, 3891858: 31, 3891860: 26, 3891862: 47});
  for (const k of Object.entries(elsewhere).filter(([lot]) => lot !== '1470854').flatMap(([, list]) => list)) {
    const units = parcelsOf(k.split('/')[0]);
    assert.ok(units.length && units.every(p => /CONDO/.test(p.landUse)), `${k} is not a condo unit`);
  }
  assert.deepEqual(elsewhere[1470854], ['1470846/1']);
  assert.equal(overlapArea(sketches.get('1470846/1'), parcelsOf('1470846')[0].geometry), 0);
});

test('the lot facts a building gets are those of its lot', () => {
  // lotExtras, the detached-garage call and the year-built fallback all read
  // the lot, so each must be the reported parcel's.
  const {parcelsOf} = lotEvidence;
  const rows = fs.readFileSync(path.join(town, 'reference/county/extra-features.csv'), 'utf8').trimEnd().split('\n');
  assert.ok(!rows.some(r => r.includes('"')), 'no quoted fields, so a plain split reads the file');
  const header = rows[0].split(','), pid = header.indexOf('REM_PID'), desc = header.indexOf('OXF_DESC'), extras = new Map();
  for (const cells of rows.slice(1).map(r => r.split(','))) if (cells[desc] && cells[desc] !== 'NULL')
    extras.set(cells[pid], new Set([...(extras.get(cells[pid]) || []), cells[desc].trim()]));
  let detached = 0, fallback = 0;
  for (const b of [...reference.buildings, ...reference.countyOnly]) {
    const name = b.id ?? `${b.altKey}/${b.bldgNum}`, lotExtras = b.parcel ? [...(extras.get(b.parcel.altKey) || [])].sort() : [];
    assert.deepEqual(b.county.lotExtras, lotExtras, name);
    const primary = b.county.records[0], codes = Object.keys(primary?.subAreasSqft || {});
    const garage = codes.some(c => ['GAR', 'GBF', 'GCF'].includes(c)) ? 'attached' : codes.some(c => ['CPF', 'CPU'].includes(c)) ? 'carport'
      : lotExtras.includes('DETACHED GARAGE') ? 'detached-on-lot' : null;
    assert.equal(b.suggested.garage, garage, name);
    const year = primary?.yearBuilt ?? (b.parcel ? parcelsOf(b.parcel.altKey)[0].yearBuilt : null) ?? null;
    assert.equal(b.suggested.yearBuilt, year, name);
    detached += garage === 'detached-on-lot'; fallback += !primary?.yearBuilt && year !== null;
  }
  assert.ok(detached > 0 && fallback > 0, `${detached} detached garages, ${fallback} lot years: the lot reads are exercised`);
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
  // The game's OSM buildings here, and the county buildings OSM lacks (county-buildings.json).
  const county = json('reference/county-buildings.json').buildings;
  assert.equal(reference.buildings.length + county.length, features.filter(f => f.category === 'building').length);
  for (const b of [...reference.buildings, ...county]) {
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
  // Everything but the policy, which says what is left out.
  for (const file of ['reference/house-reference.json', 'reference/county-buildings.json']) {
    const {policy, ...data} = json(file);
    assert.equal(/owner|grantee|sale_?price|appraised/i.test(JSON.stringify(data)), false, file);
  }
});
