// node --test tests/maps/house-reference.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createProjection, headingDegrees} from '../../tools/maps/house-reference/projection.mjs';
import {area, centroid, contains, overlapArea} from '../../tools/maps/house-reference/geometry.mjs';
import {build, exceptionDoubts, storeys, LOT_EXCEPTIONS, MATCH} from '../../tools/maps/house-reference/build-house-reference.mjs';
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
    landUse: (f.properties.LandUseDescription || '').trim(), yearBuilt: Number.parseInt(f.properties.YearBuilt, 10) || null,
    address: (f.properties.PropertyAddress || '').trim(), name: (f.properties.PropertyName || '').trim(),
    buildings: Number.parseInt(f.properties.NumberOfBuildings, 10) || 0, geometry: toTown(f.geometry)}))
    .map(p => { const xy = p.geometry.flat(2); return {...p, area: area(p.geometry), box: [Math.min(...xy.map(q => q[0])), Math.min(...xy.map(q => q[1])), Math.max(...xy.map(q => q[0])), Math.max(...xy.map(q => q[1]))]}; });
  const sketches = new Map(json('reference/county/footprints.geojson').features
    .map(f => [`${f.properties.AltKey.trim()}/${Number.parseInt(f.properties.BuildingNumber, 10)}`, toTown(f.geometry)]));
  // The county's building records and sub-areas, read straight from the CSVs.
  const rows = file => {
    const [head, ...rest] = fs.readFileSync(path.join(town, 'reference/county', file), 'utf8').trimEnd().split('\n');
    assert.ok(!rest.some(r => r.includes('"')), `${file} has no quoted fields, so a plain split reads it`);
    const keys = head.split(',');
    return rest.map(r => Object.fromEntries(r.split(',').map((v, i) => [keys[i], v])));
  };
  const buildings = rows('buildings.csv'), subareas = rows('subareas.csv');
  // A parcel's records as exceptionDoubts takes them: building number and sub-areas in sq ft.
  const recordsOf = altKey => buildings.filter(r => r.ALT_KEY === altKey).map(r => {
    const bldgNum = String(Number.parseInt(r.BLDG_NUM, 10)), subAreasSqft = {};
    for (const s of subareas.filter(s => s.REM_PID === altKey && String(Number.parseInt(s.BLD_BLDG_NUM, 10)) === bldgNum && s.SUB_CODE && s.SUB_CODE !== 'NULL'))
      subAreasSqft[s.SUB_CODE] = (subAreasSqft[s.SUB_CODE] || 0) + (Number.parseFloat(s['Gross Area']) || 0);
    return {bldgNum, subAreasSqft};
  });
  return {parcels, sketches, buildings, subareas, recordsOf, parcelsOf: altKey => parcels.filter(p => p.altKey === altKey)};
})();

test('a building takes the parcel its county sketches are filed under, where they lie on it or the county places them', () => {
  const {parcels, sketches, parcelsOf} = lotEvidence;
  // The rule, worked out here on its own. First the parcel a sketch is filed
  // under, unless it is a condo unit, where at least 1% of the sketch lies on it.
  const own = k => { const g = sketches.get(k), share = .01 * area(g);
    return parcelsOf(k.split('/')[0]).some(p => !/CONDO/.test(p.landUse) && overlapArea(g, p.geometry) >= share) ? k.split('/')[0] : null; };
  // Then, for a county-only sketch alone, the documented exceptions: the store
  // at 525 N DONNELLY ST, whose sketch lies wholly on the lot next door (its
  // evidence is checked in 'the store at 525 N DONNELLY ST is the one lot
  // exception…' below).
  const exceptions = new Map([['1470846/1', '1470846']]);
  assert.deepEqual(LOT_EXCEPTIONS, [...exceptions.keys()]);
  // Otherwise the parcel under the centre: the smallest that is not a condo
  // unit, else the smallest.
  const underCentre = ([x, y]) => {
    const hits = parcels.filter(p => x >= p.box[0] && x <= p.box[2] && y >= p.box[1] && y <= p.box[3] && contains(p.geometry, [x, y]))
      .sort((a, b) => a.area - b.area || a.altKey.localeCompare(b.altKey));
    return (hits.find(p => !/CONDO/.test(p.landUse)) || hits[0])?.altKey ?? null;
  };
  const tally = {countyOnly: {own: 0, exception: 0, centre: 0}, game: {own: 0, centre: 0}};
  for (const c of reference.countyOnly) {
    const k = `${c.altKey}/${c.bldgNum}`, lot = own(k) ?? exceptions.get(k);
    tally.countyOnly[own(k) ? 'own' : lot ? 'exception' : 'centre']++;
    assert.equal(c.parcel?.altKey ?? null, lot ?? underCentre(centroid(sketches.get(k))), k);
  }
  assert.deepEqual(reference.lotExceptions, [...exceptions.keys()]);
  // A game building whose sketches are all filed under one parcel takes it
  // where its lead sketch lies on it, with no exceptions; sketches spread over
  // several parcels leave the parcel under its centre. countyBuildings lists
  // the sketches a building holds, whether or not they have records.
  const outlines = new Map(features.map(f => [f.id, f.geographicGeometry?.coordinates]));
  for (const b of reference.buildings) {
    const held = b.match.countyBuildings || [];
    const lot = held.length && new Set(held.map(m => m.altKey)).size === 1 ? own(`${held[0].altKey}/${held[0].bldgNum}`) : null;
    tally.game[lot ? 'own' : 'centre']++;
    assert.equal(b.parcel?.altKey ?? null, lot ?? underCentre(centroid(outlines.get(b.id))), b.id);
  }
  assert.deepEqual(tally, {countyOnly: {own: 126, exception: 1, centre: 120}, game: {own: 751, centre: 199}});
  // 15 of those buildings hold sketches with no record, and take their record
  // from the lot (parcel-single, parcel-area): their sketches still decide it.
  assert.equal(reference.buildings.filter(b => b.match.method.startsWith('parcel-') && b.match.countyBuildings).length, 15);
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
  // building keeps its common lot.
  const elsewhere = {};
  for (const c of reference.countyOnly) if (c.parcel?.altKey !== c.altKey) (elsewhere[c.parcel?.altKey ?? 'no lot'] ??= []).push(`${c.altKey}/${c.bldgNum}`);
  assert.deepEqual(Object.fromEntries(Object.entries(elsewhere).map(([lot, list]) => [lot, list.length]).sort()),
    {3891857: 9, 3891858: 31, 3891860: 26, 3891862: 47});
  for (const k of Object.values(elsewhere).flat()) {
    const units = parcelsOf(k.split('/')[0]);
    assert.ok(units.length && units.every(p => /CONDO/.test(p.landUse)), `${k} is not a condo unit`);
  }
});

test('the store at 525 N DONNELLY ST is the one lot exception, and the county records back it', () => {
  // Its sketch lies wholly on the Masonic Temple's lot, centre included, so
  // the overlap test finds none of it on its own parcel, and the parcel under
  // its centre would give it the temple's address. The county files it
  // under the store's own parcel, whose one building on record has the
  // sketch's ground floor; the temple's lot has one building on record, the
  // temple, which a game building holds. Read from the county files here.
  const {sketches, parcelsOf, buildings, subareas, recordsOf} = lotEvidence;
  const store = sketches.get('1470846/1'), own = parcelsOf('1470846'), temple = parcelsOf('1470854');
  assert.deepEqual(exceptionDoubts({bldgNum: '1', area: area(store)}, own, recordsOf('1470846')), []);
  assert.deepEqual([own.length, own[0].landUse, own[0].buildings], [1, 'STORE 1 STORY FREE STANDING', 1]);
  assert.equal(overlapArea(store, own[0].geometry), 0);
  assert.ok(own[0].area < area(store), 'its parcel outline is smaller than the store');
  assert.equal(temple.length, 1);
  assert.ok(contains(temple[0].geometry, centroid(store)));
  assert.ok(overlapArea(store, temple[0].geometry) / area(store) > .99, 'the sketch lies wholly on the temple lot, to the 0.1 m overlap raster');
  assert.deepEqual(buildings.filter(r => r.ALT_KEY === '1470846').map(r => [r.BLDG_NUM, r.CNS_STYLE_DESC]), [['1', '1 STORY STORE']]);
  assert.deepEqual(subareas.filter(r => r.REM_PID === '1470846' && r.SUB_CODE === 'FLA').map(r => [r.BLD_BLDG_NUM, Number(r['Gross Area'])]), [['1', 440]]);
  assert.ok(Math.abs(area(store) / .09290304 / 440 - 1) < .001, `the sketch is ${area(store) / .09290304} sq ft`);
  assert.deepEqual(buildings.filter(r => r.ALT_KEY === '1470854').map(r => [r.BLDG_NUM, r.CNS_STYLE_DESC]), [['1', 'CLUB LODGE UNION HALL']]);
  const holder = reference.buildings.filter(b => b.match.countyBuildings?.some(m => m.altKey === '1470854'));
  assert.deepEqual(holder.map(b => [b.id, b.address, b.placeName]), [['osm-way-547799531', '535 N DONNELLY ST', 'MASONIC TEMPLE']]);
  const entry = reference.countyOnly.find(c => c.altKey === '1470846' && c.bldgNum === '1');
  assert.deepEqual([entry.address, entry.placeName, entry.parcel, entry.county.lotExtras],
    ['525 N DONNELLY ST', 'MEMORIES & MARVELS', {altKey: '1470846', landUse: 'STORE 1 STORY FREE STANDING', buildings: 1}, []]);
});

test('a documented lot exception stands only while the county records back it', () => {
  // exceptionDoubts on declared records: the store's, then one change each.
  const sketch = {bldgNum: '001', area: 440 * .09290304}, parcel = {landUse: 'STORE 1 STORY FREE STANDING', buildings: 1};
  const rec = (bldgNum, sqft) => ({bldgNum, subAreasSqft: {FLA: sqft, COP: 286}});
  assert.deepEqual(exceptionDoubts(sketch, [parcel], [rec('1', 440)]), []);
  // The area bound is 1% (MATCH.exceptionAreaTolerance): 436 and 444 sq ft
  // (0.9% and 0.8% off, after the record's rounding to 0.1 m²) pass; 434 and
  // 446 (1.4% and 1.3%) do not.
  for (const sqft of [436, 444]) assert.deepEqual(exceptionDoubts(sketch, [parcel], [rec('1', sqft)]), [], `${sqft} sq ft`);
  for (const [label, filed, records] of [
    ['446 sq ft', [parcel], [rec('1', 446)]],
    ['434 sq ft', [parcel], [rec('1', 434)]],
    ['no record of its own', [parcel], [rec('2', 440)]],
    ['a condo unit', [{...parcel, landUse: 'CONDOMINIUM'}], [rec('1', 440)]],
    ['two buildings, both on record', [{...parcel, buildings: 2}], [rec('1', 440), rec('2', 900)]],
    ['two buildings, one on record', [{...parcel, buildings: 2}], [rec('1', 440)]],
    ['one building, two on record', [parcel], [rec('1', 440), rec('2', 900)]],
    ['two parcel outlines', [parcel, parcel], [rec('1', 440)]],
    ['no parcel', [], [rec('1', 440)]]])
    assert.equal(exceptionDoubts(sketch, filed, records).length, 1, label);
});

test('the build stops on a lot exception the county records do not back', () => {
  // The committed list with one more entry: a condo unit's sketch, whose
  // parcel is not ground; a lake house that already lies on its parcel; four
  // sketches game buildings hold; and no sketch at all. None may be listed.
  // The game-held four stand for the places a game path could consult the
  // list, each asserted below:
  // - 1465231/1, osm-relation-7980769's only sketch, lies on its own parcel
  //   and the records back it: a path that tries the list before ownLot takes it;
  // - 1469465/1, osm-way-556562392's lead sketch, over two parcels, which the
  //   records back too: a path outside the one-parcel guard takes it;
  // - 1468621/1 and 3765575/1, the only sketches of osm-way-1240419614 and
  //   osm-way-1240419645, filed under no outline and under a condo unit, so
  //   ownLot gives them nothing: a path that tries the list after ownLot
  //   reaches them, and stops on another doubt or (without the doubts) takes
  //   3765575's unit.
  // Taking an entry lets the build run on, and the test expects it to stop.
  // One kind of path cannot be seen in this town: after ownLot, inside the
  // guard, passing condo units over or keeping to the doubts. No game building
  // is filed under one parcel that is not a condo unit and that it does not
  // lie on, so such a path never has a lot to hand over.
  const {sketches, parcelsOf, recordsOf} = lotEvidence;
  const held = id => reference.buildings.find(x => x.id === id).match.countyBuildings.map(m => `${m.altKey}/${m.bldgNum}`);
  const doubts = k => exceptionDoubts({bldgNum: k.split('/')[1], area: area(sketches.get(k))}, parcelsOf(k.split('/')[0]), recordsOf(k.split('/')[0]));
  assert.deepEqual(held('osm-relation-7980769'), ['1465231/1']);
  assert.ok(parcelsOf('1465231').some(p => !/CONDO/.test(p.landUse) && overlapArea(sketches.get('1465231/1'), p.geometry) >= .01 * area(sketches.get('1465231/1'))),
    '1465231/1 lies on its own parcel');
  assert.deepEqual(doubts('1465231/1'), []);
  const spread = held('osm-way-556562392');
  assert.equal(spread[0], '1469465/1');
  assert.ok(new Set(spread.map(k => k.split('/')[0])).size > 1, 'osm-way-556562392 holds sketches filed under several parcels');
  assert.deepEqual(doubts('1469465/1'), []);
  assert.deepEqual(held('osm-way-1240419614'), ['1468621/1']);
  assert.deepEqual(parcelsOf('1468621'), [], '1468621 has no outline');
  assert.deepEqual(held('osm-way-1240419645'), ['3765575/1']);
  assert.deepEqual(parcelsOf('3765575').map(p => p.landUse), ['CONDOMINIUM']);
  assert.throws(() => build({lotExceptions: [...LOT_EXCEPTIONS, '2579871/1']}), /2579871\/1 is in LOT_EXCEPTIONS, but its parcel is a condo unit/);
  for (const extra of ['1236797/1', '1465231/1', '1469465/1', '1468621/1', '3765575/1', '9999999/1'])
    assert.throws(() => build({lotExceptions: [...LOT_EXCEPTIONS, extra]}), /LOT_EXCEPTIONS lists a sketch that is no exception/, extra);
  assert.throws(() => build({lotExceptions: [...LOT_EXCEPTIONS, ...LOT_EXCEPTIONS]}), /LOT_EXCEPTIONS lists a sketch twice/);
});

test('a county sketch takes the parcel it is filed under, and a condo unit its building\'s common area', () => {
  // From #49, the same fix made in the house-parts session. Every county-only
  // sketch filed under a parcel that is not a condo unit reads that parcel:
  // all by the overlap test but the store, which reads it by its exception.
  const toTown = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(poly => poly.map(ring => ring.map(([lon, lat]) => projection.toTown(lat, lon))));
  const parcels = new Map();
  for (const f of json('reference/county/parcels.geojson').features) {
    const key = f.properties.AltKey.trim();
    if (!parcels.has(key)) parcels.set(key, {landUse: (f.properties.LandUseDescription || '').trim(), geometry: []});
    parcels.get(key).geometry.push(...toTown(f.geometry));
  }
  const kinds = {filed: 0, commonArea: 0, unitAlone: 0};
  for (const s of reference.countyOnly) {
    const id = `${s.altKey}/${s.bldgNum}`, filed = parcels.get(s.altKey);
    assert.ok(filed, `${id} is filed under no parcel`);
    if (!/CONDO/.test(filed.landUse)) { assert.equal(s.parcel?.altKey, s.altKey, id); kinds.filed++; }
    else if (s.parcel && !/CONDO/.test(s.parcel.landUse)) {
      // A unit's parcel is not ground: its lot is a parcel under its centre that is not a unit.
      assert.ok(contains(parcels.get(s.parcel.altKey).geometry, s.centroid), id);
      kinds.commonArea++;
    } else kinds.unitAlone++;
  }
  assert.deepEqual(kinds, {filed: 127, commonArea: 113, unitAlone: 7});
  // The parcel under the centre would have put these on another lot: two lakefront
  // houses on Lake Dora's submerged land, and a store on the Masonic Temple's lot.
  for (const id of ['1236797/1', '1475414/2', '1470846/1']) {
    const s = reference.countyOnly.find(c => `${c.altKey}/${c.bldgNum}` === id);
    assert.equal(contains(parcels.get(s.altKey).geometry, s.centroid), false, id);
  }
  assert.deepEqual(['1236797/1', '1475414/2', '1470846/1'].map(id => reference.countyOnly.find(c => `${c.altKey}/${c.bldgNum}` === id).address),
    ['401 LAKE DORA RD', '402 LAKE DORA RD', '525 N DONNELLY ST']);
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
    // The lot itself: its parcel, address and place name, as the county has them.
    const lot = b.parcel ? parcelsOf(b.parcel.altKey)[0] : null;
    assert.deepEqual([b.parcel, b.address, b.placeName], lot ? [{altKey: lot.altKey, landUse: lot.landUse, buildings: lot.buildings},
      lot.address !== 'UNASSIGNED' ? lot.address : null, lot.name || null] : [null, null, null], name);
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
