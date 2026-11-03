// Join Lake County building records to the game's 950 Mount Dora buildings and
// plan one Street View viewpoint per building.
//
// Reads maps/mount-dora/features.json and the county snapshot written by
// fetch-county.mjs; writes maps/mount-dora/reference/house-reference.json.
// Nothing here edits the generator, the sectors or the art kit: the file is a
// reference that build-mount-dora.py's building_style() can consume later.
//
//   node tools/maps/house-reference/build-house-reference.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createProjection, headingDegrees} from './projection.mjs';
import {area, bounds, centroid, contains, gridIndex, nearestOnPolyline, overlapArea} from './geometry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const town = path.join(root, 'maps/mount-dora');
const county = path.join(town, 'reference/county');
const target = path.join(town, 'reference/house-reference.json');
const hash = data => createHash('sha256').update(data).digest('hex');
const r2 = v => Math.round(v * 100) / 100, r1 = v => Math.round(v * 10) / 10;
const SQFT = .09290304;

// Match thresholds. A county sketch belongs to the game building holding most
// of it; IoU grades how well the two outlines agree.
export const MATCH = {assignCover: .5, assignIoU: .3, goodIoU: .5};
const VIEW_ROADS = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link',
  'residential', 'unclassified', 'living_street']);
const VIEW_RADIUS_M = 90, ADDRESS_NEAR_M = 45, ADDRESS_SLACK_M = 25;

// County code descriptions -> game vocabulary. Unknown codes fall through to null.
export const WALLS = {
  'WOOD/METAL FRAME W/OUTER FINISH': {construction: 'frame', material: 'wood'},
  'CONCRETE BLOCK PLAIN': {construction: 'masonry', material: 'concrete'},
  'BRICK/BLOCK STUCCO OR SIDING': {construction: 'masonry', material: 'concrete', finishUnknown: 'brick, stucco or siding over block'},
  'STONE/SOLID CONCRETE WALLS': {construction: 'masonry', material: 'concrete'},
};
export const ROOFS = {
  'ASPHALT SHINGLE': {cover: 'asphalt-shingle', pitch: 'pitched'},
  'METAL': {cover: 'metal', pitch: 'pitched'},
  'CONCRETE/CLAY TILE': {cover: 'tile', pitch: 'pitched'},
  'TAR & GRAVEL': {cover: 'tar-and-gravel', pitch: 'flat'},
  'ASPHALT ROLLED': {cover: 'rolled-asphalt', pitch: 'low-slope'},
};
// Sub-area codes (Area file). Ground-floor codes estimate a building's footprint.
export const SUBAREAS = {
  ground: ['FLA', 'GAR', 'GBF', 'GCF', 'EPF', 'EPA', 'STF', 'SAF'],
  open: ['OPF', 'OPU'], screen: ['SPF', 'SPU'], enclosed: ['EPF', 'EPA'],
  garage: ['GAR', 'GBF', 'GCF'], carport: ['CPF', 'CPU'], upper: ['FUS', 'FHS', 'FTQ'],
  basement: ['BSF', 'BSM', 'FBS'], canopy: ['COP'],
};

export function storeys(raw, codes) {
  const value = Number.parseFloat(raw);
  if (Number.isFinite(value) && value >= 1) {
    const whole = Math.min(5, Math.floor(value)), half = value - Math.floor(value) >= .25 && whole < 5;
    return {stories: whole, halfStory: half, source: `county:STORIES ${raw}`};
  }
  if (codes.some(c => SUBAREAS.upper.includes(c))) return {stories: 2, halfStory: false, source: 'county:upper-storey sub-area'};
  return {stories: null, halfStory: false, source: 'county:no-storey-record'};
}

const ORDINALS = {FIRST: '1ST', SECOND: '2ND', THIRD: '3RD', FOURTH: '4TH', FIFTH: '5TH', SIXTH: '6TH', SEVENTH: '7TH',
  EIGHTH: '8TH', NINTH: '9TH', TENTH: '10TH', ELEVENTH: '11TH', TWELFTH: '12TH'};
const TYPES = {AVENUE: 'AVE', STREET: 'ST', ROAD: 'RD', DRIVE: 'DR', COURT: 'CT', PARKWAY: 'PKWY', BOULEVARD: 'BLVD',
  LANE: 'LN', PLACE: 'PL', CIRCLE: 'CIR', TERRACE: 'TER', HIGHWAY: 'HWY', TRAIL: 'TRL'};
const DIRECTIONS = {NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W'};
// "East 5th Avenue" and "412 E FIFTH AVE" both become {full: 'E 5TH AVE', base: '5TH AVE'}.
export function streetKey(name) {
  if (!name) return null;
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  while (words.length && /^\d+[A-Z]?$/.test(words[0]) && !/^\d+(ST|ND|RD|TH)$/.test(words[0])) words.shift();
  const norm = words.map(w => ORDINALS[w] || TYPES[w] || DIRECTIONS[w] || w);
  if (!norm.length) return null;
  const base = norm.filter((w, i) => !(i === 0 && ['N', 'S', 'E', 'W'].includes(w) && norm.length > 1));
  return {full: norm.join(' '), base: base.join(' ')};
}

function readCsv(file) {
  const [header, ...rows] = fs.readFileSync(path.join(county, file), 'utf8').trimEnd().split('\n').map(line => {
    const cells = []; let cell = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) { if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
      else if (c === '"') quoted = true; else if (c === ',') { cells.push(cell); cell = ''; } else cell += c;
    }
    cells.push(cell); return cells;
  });
  return rows.map(r => Object.fromEntries(header.map((k, i) => [k, r[i] === 'NULL' ? '' : r[i]])));
}

export function build() {
  const featuresBytes = fs.readFileSync(path.join(town, 'features.json'));
  const sourceBytes = fs.readFileSync(path.join(county, 'source.json'));
  const project = JSON.parse(fs.readFileSync(path.join(town, 'project.json'), 'utf8'));
  const source = JSON.parse(sourceBytes), features = JSON.parse(featuresBytes).features;
  for (const kept of [...Object.values(source.layers), ...source.tables].map(x => x.kept))
    assert.equal(hash(fs.readFileSync(path.join(county, kept.file))), kept.sha256, `County snapshot changed: ${kept.file}`);
  const {toTown, toLatLon} = createProjection(project.projection);
  const project4326 = geometry => (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates)
    .map(polygon => polygon.map(ring => ring.map(([lon, lat]) => toTown(lat, lon))));

  const sketches = JSON.parse(fs.readFileSync(path.join(county, 'footprints.geojson'), 'utf8')).features.map(f => {
    const geometry = project4326(f.geometry);
    return {altKey: f.properties.AltKey.trim(), bldgNum: f.properties.BuildingNumber.trim(), geometry, box: bounds(geometry), area: area(geometry)};
  });
  const parcels = JSON.parse(fs.readFileSync(path.join(county, 'parcels.geojson'), 'utf8')).features.map(f => {
    const geometry = project4326(f.geometry), p = f.properties;
    return {altKey: p.AltKey.trim(), address: (p.PropertyAddress || '').trim(), name: (p.PropertyName || '').trim(),
      landUse: (p.LandUseDescription || '').trim(), buildings: Number.parseInt(p.NumberOfBuildings, 10) || 0,
      yearBuilt: Number.parseInt(p.YearBuilt, 10) || null, geometry, box: bounds(geometry), area: area(geometry)};
  });
  const records = new Map(), subareas = new Map(), extras = new Map();
  const key = (altKey, bldg) => `${altKey}#${Number.parseInt(bldg, 10)}`;
  for (const row of readCsv('buildings.csv')) records.set(key(row.ALT_KEY, row.BLDG_NUM), row);
  for (const row of readCsv('subareas.csv')) {
    const k = key(row.REM_PID, row.BLD_BLDG_NUM);
    if (!subareas.has(k)) subareas.set(k, {});
    const list = subareas.get(k), gross = Number.parseFloat(row['Gross Area']) || 0;
    if (row.SUB_CODE) list[row.SUB_CODE] = (list[row.SUB_CODE] || 0) + gross;
  }
  for (const row of readCsv('extra-features.csv')) {
    if (!extras.has(row.REM_PID)) extras.set(row.REM_PID, new Set());
    if (row.OXF_DESC) extras.get(row.REM_PID).add(row.OXF_DESC.trim());
  }

  const houses = features.filter(f => f.category === 'building').map(f => {
    const geometry = f.geographicGeometry.coordinates;
    return {feature: f, geometry, box: bounds(geometry), area: area(geometry), centre: centroid(geometry)};
  }).sort((a, b) => a.feature.id.localeCompare(b.feature.id));
  const sketchIndex = gridIndex(sketches.map(s => s.box)), parcelIndex = gridIndex(parcels.map(p => p.box));

  // Pairwise overlaps, then each sketch goes to the game building holding most of it.
  const pairs = new Map();
  for (const [h, house] of houses.entries()) for (const s of sketchIndex(house.box)) {
    const o = overlapArea(house.geometry, sketches[s].geometry, .1, house.box, sketches[s].box);
    if (o > 0) pairs.set(`${h}:${s}`, o);
  }
  const owner = new Map();
  for (const [pair, o] of pairs) {
    const [h, s] = pair.split(':').map(Number), sk = sketches[s];
    const iou = o / (houses[h].area + sk.area - o), cover = o / sk.area;
    if (cover < MATCH.assignCover && iou < MATCH.assignIoU) continue;
    const held = owner.get(s);
    if (!held || o > held.overlap || o === held.overlap && h < held.house) owner.set(s, {house: h, overlap: o, iou, cover});
  }
  const assigned = houses.map(() => []);
  for (const [s, m] of owner) assigned[m.house].push({sketch: s, ...m});
  for (const list of assigned) list.sort((a, b) => b.overlap - a.overlap || a.sketch - b.sketch);

  const roads = features.filter(f => f.category === 'road' && f.geometry.type === 'LineString').map(f => ({
    id: f.id, name: f.tags.name || null, highway: f.tags.highway, line: f.geometry.coordinates, key: streetKey(f.tags.name)}));
  const roadIndex = gridIndex(roads.map(r => bounds([[r.line]])), 48);

  const describe = (altKey, bldgNum) => {
    const row = records.get(key(altKey, bldgNum));
    if (!row) return null;
    const sub = subareas.get(key(altKey, bldgNum)) || {};
    const codes = Object.keys(sub).sort();
    return {altKey, bldgNum: String(Number.parseInt(bldgNum, 10)), style: row.CNS_STYLE_DESC || null, model: row.CNS_MDL_DESC || null,
      wall: row.CNS_EXT_WALL_1_DESC || null, roofCover: row.ROOF_COVER_DESC || null, foundation: row.FOUNDATION_DESC || null,
      yearBuilt: Number.parseInt(row.ACTUAL_YEAR_BUILT, 10) || null, effectiveYearBuilt: Number.parseInt(row.EFFECTIVE_YEAR_BUILT, 10) || null,
      stories: row.STORIES || null, livingSqft: Number.parseInt(row.LIVING_AREA, 10) || null,
      subAreasSqft: Object.fromEntries(codes.map(c => [c, sub[c]]))};
  };
  const groundM2 = rec => r1(SUBAREAS.ground.reduce((s, c) => s + (rec.subAreasSqft[c] || 0), 0) * SQFT);
  const parcelRecords = altKey => [...records.values()].filter(r => r.ALT_KEY === altKey).map(r => describe(altKey, r.BLDG_NUM));

  const out = [];
  for (const [h, house] of houses.entries()) {
    const f = house.feature, matches = assigned[h];
    const hits = parcelIndex(house.box).map(i => parcels[i]).filter(p => contains(p.geometry, house.centre));
    // Stacked condo units share one outline; the smallest-area hit is the lot itself.
    hits.sort((a, b) => a.area - b.area || a.altKey.localeCompare(b.altKey));
    const lot = hits.find(p => !/CONDO/.test(p.landUse)) || hits[0] || null;
    let method = 'none', recs = [], match = null;
    if (matches.length) {
      recs = matches.map(m => describe(sketches[m.sketch].altKey, sketches[m.sketch].bldgNum)).filter(Boolean);
      const best = matches[0];
      method = best.iou >= MATCH.goodIoU ? 'footprint' : 'footprint-partial';
      match = {iou: r2(best.iou), coverGame: r2(matches.reduce((s, m) => s + m.overlap, 0) / house.area), coverCounty: r2(best.cover),
        countyBuildings: matches.map(m => ({altKey: sketches[m.sketch].altKey, bldgNum: String(Number.parseInt(sketches[m.sketch].bldgNum, 10)), overlapM2: r1(m.overlap), iou: r2(m.iou)}))};
    }
    if (!recs.length && hits.length) {
      const condos = hits.filter(p => /CONDO/.test(p.landUse));
      if (condos.length >= 2) {
        method = 'condo-units';
        recs = condos.flatMap(p => parcelRecords(p.altKey)).filter(Boolean);
        match = {units: condos.length};
      } else if (lot) {
        const candidates = parcelRecords(lot.altKey).filter(Boolean);
        if (candidates.length === 1) { method = 'parcel-single'; recs = candidates; match = {altKey: lot.altKey}; }
        else if (candidates.length > 1) {
          const scored = candidates.map(c => ({c, ratio: groundM2(c) / house.area})).sort((a, b) => Math.abs(Math.log(a.ratio || 1e-9)) - Math.abs(Math.log(b.ratio || 1e-9)));
          method = 'parcel-area'; recs = [scored[0].c]; match = {altKey: lot.altKey, groundAreaRatio: r2(scored[0].ratio), candidates: candidates.length};
        }
      }
    }
    const primary = recs[0] || null;
    const codes = primary ? Object.keys(primary.subAreasSqft) : [];
    const sum = list => r1(list.reduce((s, c) => s + (primary?.subAreasSqft[c] || 0), 0) * SQFT);
    const condoMax = method === 'condo-units' ? Math.max(...recs.map(r => Number.parseFloat(r.stories) || 0)) : null;
    const st = primary ? storeys(condoMax ? String(condoMax) : primary.stories, codes) : {stories: null, halfStory: false, source: 'no-county-record'};
    if (method === 'condo-units') st.source += ' (largest of the unit records; units may not span the building)';
    const wall = primary && WALLS[primary.wall], roof = primary && ROOFS[primary.roofCover];
    const lotExtras = lot ? [...(extras.get(lot.altKey) || [])].sort() : [];
    const suggested = {
      stories: st.stories, halfStory: st.halfStory, storiesSource: st.source,
      material: wall?.material ?? null, wallConstruction: wall?.construction ?? null,
      ...(wall?.finishUnknown ? {finishUnknown: wall.finishUnknown} : {}),
      materialSource: primary?.wall ? `county:CNS_EXT_WALL_1 ${primary.wall}` : 'no-county-wall-record',
      roofCover: roof?.cover ?? null, roofPitch: roof?.pitch ?? null,
      roofSource: primary?.roofCover ? `county:ROOF_COVER ${primary.roofCover}` : 'no-county-roof-record',
      porchM2: {open: sum(SUBAREAS.open), screen: sum(SUBAREAS.screen), enclosed: sum(SUBAREAS.enclosed)},
      canopyM2: sum(SUBAREAS.canopy),
      garage: codes.some(c => SUBAREAS.garage.includes(c)) ? 'attached' : codes.some(c => SUBAREAS.carport.includes(c)) ? 'carport'
        : lotExtras.includes('DETACHED GARAGE') ? 'detached-on-lot' : null,
      basement: codes.some(c => SUBAREAS.basement.includes(c)),
      yearBuilt: primary?.yearBuilt ?? lot?.yearBuilt ?? null,
    };

    // Street View: the nearest point on the addressed street, else the nearest public road.
    const addressKey = streetKey(lot?.address && lot.address !== 'UNASSIGNED' ? lot.address : null);
    const near = roadIndex([house.box[0] - VIEW_RADIUS_M, house.box[1] - VIEW_RADIUS_M, house.box[2] + VIEW_RADIUS_M, house.box[3] + VIEW_RADIUS_M])
      .map(i => roads[i]).map(r => ({road: r, hit: nearestOnPolyline(r.line, house.centre)})).filter(x => x.hit.distance <= VIEW_RADIUS_M);
    const pick = list => list.sort((a, b) => a.hit.distance - b.hit.distance || a.road.id.localeCompare(b.road.id))[0];
    // "W 5TH AVE" must not snap to East 5th Avenue: the full name wins, then the base name.
    const onAddress = addressKey && (pick(near.filter(x => x.road.key?.full === addressKey.full))
      || pick(near.filter(x => x.road.key?.base === addressKey.base)));
    // The addressed street wins unless it is much farther than the nearest public
    // road (a way that stops short of the lot puts its nearest point far away).
    const nearestPublic = pick(near.filter(x => VIEW_ROADS.has(x.road.highway)));
    const addressOk = onAddress && (onAddress.hit.distance <= ADDRESS_NEAR_M || onAddress.hit.distance <= (nearestPublic?.hit.distance ?? Infinity) + ADDRESS_SLACK_M);
    const chosen = (addressOk && onAddress) || nearestPublic || pick(near.filter(x => x.road.highway === 'service')) || pick(near);
    let streetView = null;
    if (chosen) {
      const v = chosen.hit.point, [lat, lon] = toLatLon(v[0], v[1]), heading = Math.round(headingDegrees(v, house.centre)) % 360;
      // Fit the outline's angular width as seen from the viewpoint, with margin.
      const angles = house.geometry[0][0].map(p => Math.atan2(p[0] - v[0], -(p[1] - v[1])) * 180 / Math.PI - heading).map(a => ((a + 540) % 360) - 180);
      const fov = Math.round(Math.max(35, Math.min(100, (Math.max(...angles) - Math.min(...angles)) * 1.25 + 10)));
      const pitch = Math.min(20, 5 + 4 * Math.max(0, (st.stories || 1) - 1));
      const ll = `${lat.toFixed(6)},${lon.toFixed(6)}`, line = chosen.road.line, seg = chosen.hit.segment;
      // Metres along the road polyline, so a survey can walk one side of a street in order.
      let along = Math.hypot(v[0] - line[seg][0], v[1] - line[seg][1]);
      for (let i = 0; i < seg; i++) along += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
      streetView = {viewpoint: [Number(lat.toFixed(6)), Number(lon.toFixed(6))], town: v.map(r2), heading, pitch, fov,
        road: chosen.road.name, roadId: chosen.road.id, roadClass: chosen.road.highway, alongM: r1(along), distanceM: r1(chosen.hit.distance),
        onAddressedStreet: Boolean(addressOk && chosen === onAddress),
        url: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}&heading=${heading}&pitch=${pitch}&fov=${fov}`};
    }
    // Roof shape reads best from above: the same building in Google Maps' satellite view.
    const [clat, clon] = toLatLon(house.centre[0], house.centre[1]);
    const aerialUrl = `https://www.google.com/maps/@?api=1&map_action=map&center=${clat.toFixed(6)},${clon.toFixed(6)}&zoom=20&basemap=satellite`;
    const tags = f.tags, keepTags = Object.fromEntries(Object.entries(tags).filter(([k]) => /^(building|name|building:levels|roof:|addr:|amenity|shop|tourism)/.test(k)));
    out.push({id: f.id, sectors: f.nativeSectors || [], centroid: house.centre.map(r2), areaM2: r1(house.area), osmTags: keepTags,
      address: lot && lot.address !== 'UNASSIGNED' ? lot.address : null, placeName: lot?.name || null,
      parcel: lot ? {altKey: lot.altKey, landUse: lot.landUse, buildings: lot.buildings} : null,
      match: {method, ...match}, county: {records: recs, lotExtras}, suggested, streetView, aerialUrl});
  }

  // County sketches inside the town that no game building claims. `coveredByGame`
  // is the largest share of the sketch under any one game building.
  const extent = [0, 0, project.extent.widthM, project.extent.depthM], covered = new Map();
  for (const [pair, o] of pairs) { const s = Number(pair.split(':')[1]); covered.set(s, Math.max(covered.get(s) || 0, o / sketches[s].area)); }
  const countyOnly = sketches.map((s, i) => ({s, i})).filter(({i}) => !owner.has(i))
    .filter(({s}) => { const c = centroid(s.geometry); return c[0] >= extent[0] && c[1] >= extent[1] && c[0] <= extent[2] && c[1] <= extent[3]; })
    .map(({s, i}) => {
      const rec = describe(s.altKey, s.bldgNum), c = centroid(s.geometry);
      return {altKey: s.altKey, bldgNum: String(Number.parseInt(s.bldgNum, 10)), centroid: c.map(r2), areaM2: r1(s.area), coveredByGame: r2(covered.get(i) || 0),
        geometry: s.geometry.map(poly => poly.map(ring => ring.map(p => p.map(r2)))),
        record: rec && {style: rec.style, stories: rec.stories, wall: rec.wall, roofCover: rec.roofCover, yearBuilt: rec.yearBuilt}};
    }).sort((a, b) => a.altKey.localeCompare(b.altKey) || a.bldgNum.localeCompare(b.bldgNum));

  const count = fn => out.filter(fn).length;
  const metrics = {
    gameBuildings: out.length, countySketches: sketches.length, countyRecords: records.size,
    byMethod: Object.fromEntries(['footprint', 'footprint-partial', 'parcel-single', 'parcel-area', 'condo-units', 'none'].map(m => [m, count(b => b.match.method === m)])),
    withStories: count(b => b.suggested.stories !== null), multiStorey: count(b => b.suggested.stories >= 2), halfStorey: count(b => b.suggested.halfStory),
    withMaterial: count(b => b.suggested.material !== null), wood: count(b => b.suggested.material === 'wood'),
    flatRoof: count(b => b.suggested.roofPitch === 'flat'), metalRoof: count(b => b.suggested.roofCover === 'metal'),
    withPorch: count(b => b.suggested.porchM2.open + b.suggested.porchM2.screen + b.suggested.porchM2.enclosed > 0),
    withStreetView: count(b => b.streetView), onAddressedStreet: count(b => b.streetView?.onAddressedStreet),
    countyOnlySketches: countyOnly.length, countyOnlyHouseSized: countyOnly.filter(c => c.areaM2 >= 40).length,
  };
  const reference = {
    kind: 'mount-dora-house-reference', version: 1,
    inputs: {features: {file: 'maps/mount-dora/features.json', sha256: hash(featuresBytes)},
      county: {file: 'maps/mount-dora/reference/county/source.json', sha256: hash(sourceBytes), release: source.release}},
    policy: 'County facts and planned viewpoints only. Street View is opened in Google Maps by URL for a person to look at; no imagery is requested, stored or traced by this tool.',
    thresholds: {...MATCH, viewRadiusM: VIEW_RADIUS_M, addressNearM: ADDRESS_NEAR_M, addressSlackM: ADDRESS_SLACK_M}, vocabulary: {walls: WALLS, roofs: ROOFS, subAreas: SUBAREAS},
    metrics, buildings: out, countyOnly,
  };
  return JSON.stringify(reference, null, 1) + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert(args.length === 0 || args.length === 1 && args[0] === '--check', 'Usage: node tools/maps/house-reference/build-house-reference.mjs [--check]');
  const text = build();
  if (args[0] === '--check') {
    assert(fs.existsSync(target), 'house-reference.json is missing; run without --check.');
    assert.equal(hash(fs.readFileSync(target)), hash(text), 'house-reference.json is stale; rerun without --check.');
    console.log('house-reference.json is current.');
  } else {
    fs.writeFileSync(target, text);
    console.log(JSON.stringify(JSON.parse(text).metrics, null, 1));
  }
}
