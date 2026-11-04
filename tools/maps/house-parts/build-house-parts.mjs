// Writes maps/mount-dora/parts/: one house-part file per building plus
// index.json. With --check, confirms the committed files are exactly what the
// current town generates. Either way it refuses unless every part validates,
// the parts stamp back into all 42 sectors byte for byte, and every art
// placement rebuilds from its part.
//
//   node tools/maps/house-parts/build-house-parts.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {root, PARTS_DIR, INDEX_KIND, VERSION, loadTown, buildParts, validatePart, roundTrip, placePoint, iou, localAxisDeg,
  formatPart, formatIndex, blockFits, sha256} from './house-parts.mjs';

// Files in the parts folder that this tool does not write.
export const KEEP = new Set(['README.md', 'workshop.json']);

const median = values => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const offAxis = deg => { const m = ((deg % 90) + 90) % 90; return Math.min(m, 90 - m); };
const digest = value => sha256(JSON.stringify(value));

// The exact input values a part reads, so an unrelated change to an input file
// (a new survey camera, say) does not make the parts look stale.
function inputDigests(town) {
  const buildings = town.features.features.filter(f => f.category === 'building');
  return {
    'maps/mount-dora/source/authoring-config.json': digest(town.extent),
    'maps/mount-dora/authored-buildings.json': digest(town.authored.records),
    'maps/mount-dora/features.json': digest({projection: town.features.projection, buildings: buildings.map(f => ({id: f.id, osm: f.osm, county: f.county, tags: f.tags,
      geometry: f.geometry, geographicGeometry: f.geographicGeometry, nativeProxy: f.nativeProxy, nativeSectors: f.nativeSectors, authoredLayoutSHA256: f.authoredLayoutSHA256}))}),
    'maps/mount-dora/reference/lidar-roofs.json': digest({collection: town.lidar.collection, buildings: town.lidar.buildings}),
    'maps/mount-dora/reference/county-buildings.json': digest(town.county.buildings.map(b => ({id: b.id, lidar: b.lidar}))),
    'maps/mount-dora/reference/house-reference.json': digest(town.reference.buildings.map(b => ({id: b.id, address: b.address, altKey: b.parcel?.altKey, match: b.match?.method}))),
    'sites/tactical-animal/dist/mission-art/mount-dora/manifest.js': digest({artRevision: town.art.ART_REVISION, buildings: town.art.PLACEMENTS.filter(p => p.kind === 'building')}),
  };
}

// The checks recorded in the index. The pose and ridge figures say how well a
// part placed at its true angle matches the measured house.
function checks(parts, town, trip) {
  const geographic = new Map(town.features.features.map(f => [f.id, f.geographicGeometry?.coordinates]));
  const turned = parts.filter(p => offAxis(p.placements.true.rotationDeg) > 5);
  const wrongSign = p => { const pose = {pivot: p.placements.pivot, at: p.placements.true.at, rotationDeg: -p.placements.true.rotationDeg};
    return Number(iou(p.outline.map(poly => poly.map(r => r.map(v => placePoint(v, pose)))), geographic.get(p.id)).toFixed(3)); };
  const ridged = parts.filter(p => ['gable', 'hip'].includes(p.roof.form) && p.roof.confidence >= .7 && p.roof.ridgeAxisDeg !== null);
  const within = (list, axisOf) => list.filter(p => offAxis(axisOf(p)) <= 5).length;
  const turnedRidges = ridged.filter(p => offAxis(p.placements.true.rotationDeg) > 5);
  const kitAxis = deg => { const m = ((deg % 180) + 180) % 180; return m < 45 || m >= 135 ? 'x' : 'y'; };
  const withKitAxis = ridged.filter(p => p.appearance.treatment.roofAxis);
  return {
    sectors: {stamped: trip.sectors, byteIdentical: trip.identical},
    artPlacements: {rebuilt: parts.length, identical: parts.length},
    poses: {
      note: 'fitIoU: intersection over union of the placed outline with the measured footprint (features.json geographicGeometry)',
      medianGridFitIoU: median(parts.map(p => p.placements.grid.fitIoU)), medianTrueFitIoU: median(parts.map(p => p.placements.true.fitIoU)),
      turnedMoreThan5Deg: turned.length, turnedMedianGridFitIoU: median(turned.map(p => p.placements.grid.fitIoU)),
      turnedMedianTrueFitIoU: median(turned.map(p => p.placements.true.fitIoU)), turnedMedianWrongSignFitIoU: median(turned.map(wrongSign)),
      turnedTrueBeatsGrid: turned.filter(p => p.placements.true.fitIoU > p.placements.grid.fitIoU).length,
      turnedTrueBeatsWrongSign: turned.filter(p => p.placements.true.fitIoU > wrongSign(p)).length,
    },
    ridges: {
      note: 'lidar ridges of confident (>= 0.7) gable and hip roofs, turned into the part frame; a ridge parallel to a wall is within 5 degrees of a part axis',
      confident: ridged.length, withinFiveDegOfPartAxis: within(ridged, p => p.roof.ridgeAxisDeg),
      turnedHouses: turnedRidges.length, turnedWithinFiveDeg: within(turnedRidges, p => p.roof.ridgeAxisDeg),
      turnedWithinFiveDegWrongSign: within(turnedRidges, p => localAxisDeg(p.roof.ridgeBearingMeasuredDeg, -p.placements.true.rotationDeg)),
      turnedWithinFiveDegUnrotated: within(turnedRidges, p => localAxisDeg(p.roof.ridgeBearingMeasuredDeg, 0)),
      artKitRoofAxisAgrees: withKitAxis.filter(p => kitAxis(p.roof.ridgeAxisDeg) === p.appearance.treatment.roofAxis).length,
      artKitRoofAxisCompared: withKitAxis.length,
      artKitRoofAxisDisagrees: withKitAxis.filter(p => kitAxis(p.roof.ridgeAxisDeg) !== p.appearance.treatment.roofAxis).map(p => p.id),
    },
    latLonRoundTripMaxM: Number(Math.max(...parts.map(p => { const [x, y] = town.projection.toTown(p.placements.true.latitude, p.placements.true.longitude);
      return Math.hypot(x - p.placements.true.at[0], y - p.placements.true.at[1]); })).toFixed(4)),
  };
}

// Every file the parts folder should hold, from the current town.
export function generate(town) {
  const parts = buildParts(town), problems = parts.flatMap(validatePart);
  if (problems.length) throw Error('Invalid parts:\n' + problems.slice(0, 20).join('\n'));
  const trip = roundTrip(parts, town);
  if (trip.identical !== trip.sectors) throw Error('The parts do not reproduce the sectors: ' + JSON.stringify(trip.mismatches.slice(0, 2)));
  const files = new Map();
  for (const part of parts) files.set(part.id + '.json', formatPart(part));
  const index = {
    kind: INDEX_KIND, version: VERSION, project: town.project.id,
    about: 'One self-contained house-part file per Mount Dora building; README.md in this folder documents the format',
    generatedBy: 'node tools/maps/house-parts/build-house-parts.mjs',
    counts: {parts: parts.length, osm: parts.filter(p => p.source.osm).length, county: parts.filter(p => p.source.county).length,
      fitA24mBlock: parts.filter(blockFits).length, withSharedWalls: parts.filter(p => p.walls.some(w => w.sharedWith.length)).length,
      crossSectorEdges: parts.filter(p => p.provenance.sectors.length > 1).length,
      croppedByTownEdge: parts.filter(p => { const [x0, y0] = p.placements.grid.origin; return x0 < 0 || y0 < 0 || x0 + p.size[0] > town.extent.widthM || y0 + p.size[1] > town.extent.depthM; }).length},
    inputs: inputDigests(town),
    checks: checks(parts, town, trip),
    parts: parts.map(p => ({id: p.id, file: p.id + '.json', name: p.name, address: p.address?.text ?? null, size: p.size, storeys: p.storeys.count,
      roof: p.roof.form, block: blockFits(p), sha256: sha256(files.get(p.id + '.json'))})),
  };
  files.set('index.json', formatIndex(index));
  return {parts, index, files};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check'), dir = path.join(root, PARTS_DIR);
  const {files, index} = generate(await loadTown());
  const present = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => !KEEP.has(f)) : [];
  if (check) {
    const stale = [...files].filter(([name, text]) => !fs.existsSync(path.join(dir, name)) || fs.readFileSync(path.join(dir, name), 'utf8') !== text).map(([name]) => name);
    const extra = present.filter(f => !files.has(f));
    if (stale.length || extra.length) {
      console.error(`House parts are stale: ${stale.length} differ or are missing (${stale.slice(0, 5).join(', ')}), ${extra.length} extra (${extra.slice(0, 5).join(', ')}).`);
      console.error('Regenerate with: node tools/maps/house-parts/build-house-parts.mjs');
      process.exit(1);
    }
    console.log(`House parts are current: ${index.counts.parts} parts; ${index.checks.sectors.byteIdentical}/${index.checks.sectors.stamped} sectors reproduced byte for byte.`);
  } else {
    fs.mkdirSync(dir, {recursive: true});
    for (const f of present) if (!files.has(f)) fs.rmSync(path.join(dir, f));
    for (const [name, text] of files) fs.writeFileSync(path.join(dir, name), text);
    console.log(`Wrote ${files.size - 1} house parts and index.json to ${PARTS_DIR}; ${index.counts.fitA24mBlock} fit a 24 m block.`);
    console.log(JSON.stringify(index.checks, null, 1));
  }
}
