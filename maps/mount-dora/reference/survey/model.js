// Pure helpers for the house survey, shared by the page and its Node test.
// Coordinates are town east/south metres (maps/mount-dora/project.json).

export const CONFIDENCE = ['sure', 'likely', 'unsure'];
export const IMAGERY_DATE = /^(19|20)\d\d(-(0[1-9]|1[0-2]))?$/;

// The game's authored outlines are axis-aligned with integer corners. Split
// them into the 1 m wall edges a door can occupy, each ordered low to high.
export function unitEdges(multiPolygon) {
  const edges = [];
  for (const polygon of multiPolygon) for (const ring of polygon) for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length];
    if (![x0, y0, x1, y1].every(Number.isInteger) || x0 !== x1 && y0 !== y1) continue;
    const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
    for (let k = 0, n = Math.abs(x1 - x0) + Math.abs(y1 - y0); k < n; k++) {
      const a = [x0 + dx * k, y0 + dy * k], b = [a[0] + dx, a[1] + dy];
      edges.push(a[0] + a[1] < b[0] + b[1] ? [a, b] : [b, a]);
    }
  }
  return edges;
}

export const edgeKey = ([a, b]) => `${a[0]},${a[1]}:${b[0]},${b[1]}`;

export function nearestEdge(edges, [x, y], maxDistance) {
  let best = null;
  for (const segment of edges) {
    const [a, b] = segment, t = Math.max(0, Math.min(1, (x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])));
    const d = Math.hypot(x - (a[0] + t * (b[0] - a[0])), y - (a[1] + t * (b[1] - a[1])));
    if (d <= maxDistance && (!best || d < best.distance || d === best.distance && edgeKey(segment) < edgeKey(best.segment))) best = {segment, distance: d};
  }
  return best;
}

// Adds the entrance, or removes it when that edge is already marked.
export function toggleEntrance(list = [], segment) {
  const key = edgeKey(segment), kept = list.filter(e => edgeKey(e.segment) !== key);
  if (kept.length < list.length) return kept;
  return [...list, {segment: segment.map(p => [...p])}].sort((p, q) => edgeKey(p.segment).localeCompare(edgeKey(q.segment)));
}

// A county building (reference/county-buildings.json) as a queue entry with the
// fields of a house-reference.json building. Its sectors come from
// features.json, which the generator writes after both reference files.
export function countyEntry(c, sectors = []) {
  return {id: c.id, sectors, centroid: c.centroid, areaM2: c.areaM2, osmTags: {}, address: c.address, placeName: c.placeName, parcel: c.parcel,
    match: c.county.match, county: c.county.county, suggested: c.county.suggested, streetView: c.streetView, aerialUrl: c.aerialUrl,
    countySketch: {sketches: c.members.length, lidarSaw: c.lidarSaw, roofShare: c.roofShare}};
}

// The queue: every game building, the OSM ones from house-reference.json and
// the county-sketched ones OSM lacks from county-buildings.json.
export function queueEntries(reference, county, features) {
  const sectorsOf = new Map(features.filter(f => f.category === 'building').map(f => [f.id, f.nativeSectors || []]));
  return [...reference.buildings, ...county.buildings.map(c => countyEntry(c, sectorsOf.get(c.id)))];
}

// What a surveyor should know about a building before looking.
export function warningsFor(b) {
  const sv = b.streetView, sketched = b.countySketch, out = [];
  if (b.match.method === 'none' || sketched && !b.county.records.length) out.push('No county record: everything here comes from what you see.');
  if (b.match.method === 'footprint-partial') out.push('The game outline and the county sketch disagree; check this is one building.');
  if (b.match.method === 'parcel-area') out.push('Several buildings share this lot; the record was picked by size.');
  if (sketched) out.push(`OpenStreetMap lacks this building; the game drew it from ${sketched.sketches === 1 ? 'the county sketch' : `${sketched.sketches} county sketches`}. ` +
    'If Street View shows none here, flag "Changed since the record".');
  if (sketched && sketched.lidarSaw !== 'class-6 roof') out.push(`The 2018 lidar saw no building roof here (${sketched.lidarSaw}). Check that it stands.`);
  if (sv && sv.distanceM > 60) out.push('Far from the street; it may be hidden or reached by a drive.');
  if (sv && !sv.onAddressedStreet && b.address) out.push(`The camera is not on the addressed street (${b.address}).`);
  return out;
}

// What an export depends on: the two files the queue came from, and the
// building outlines its entrance edges lie on. The outlines are pinned by their
// ids and authored geometry, not by features.json's bytes, which the generator
// rewrites with every survey answer it applies.
export const PINNED = {
  reference: {file: 'maps/mount-dora/reference/house-reference.json'},
  countyBuildings: {file: 'maps/mount-dora/reference/county-buildings.json'},
  outlines: {file: 'maps/mount-dora/features.json', fields: 'the id and authored geometry of every building'},
};
// The text the outlines pin hashes.
export const outlineText = features => JSON.stringify(features.filter(f => f.category === 'building').map(f => [f.id, f.geometry]));

// What an export was made against that differs from what is loaded now.
export const pinMismatches = (doc, pins) => Object.keys(PINNED).filter(key => doc[key]?.sha256 && doc[key].sha256 !== pins[key])
  .map(key => key === 'outlines' ? 'the building outlines in features.json' : PINNED[key].file.split('/').pop());

// Import: the newer answer per building wins. Answers for ids this queue lacks
// are kept as well, apart (they export under `unmatched`), so a teammate's
// answer is never dropped because this copy of the files is older or newer.
export function mergeAnswers(mine, doc, keys, known) {
  const answers = {...mine};
  let added = 0, unmatched = 0;
  for (const [id, answer] of [...Object.entries(doc.answers || {}), ...Object.entries(doc.unmatched || {})]) {
    const clean = cleanAnswer(answer, keys);
    if (!clean || answers[id] && (answer.at || '') <= (answers[id].at || '')) continue;
    answers[id] = {...clean, ...(answer.at ? {at: answer.at} : {})};
    added++;
    if (!known.has(id)) unmatched++;
  }
  return {answers, added, unmatched};
}

// Moves an answer to the building it belongs to, as when a county building's id
// changed. Null if the target already has an answer. Entrances not on the
// target's outline (its 1 m edges) are left out, and counted.
export function moveAnswer(answers, from, to, edges) {
  if (!answers[from] || answers[to]) return null;
  const {[from]: answer, ...rest} = answers, on = new Set(edges.map(edgeKey));
  const entrances = (answer.entrances || []).filter(e => on.has(edgeKey(e.segment)));
  const moved = {...answer, entrances};
  if (!entrances.length) delete moved.entrances;
  return {answers: {...rest, [to]: moved}, entrancesLeftOut: (answer.entrances || []).length - entrances.length};
}

// Drops empty values; an answer with nothing left is null.
export function cleanAnswer(answer, keys) {
  const out = {};
  for (const key of keys) {
    const v = answer?.[key];
    if (v === undefined || v === null || v === '' || Array.isArray(v) && !v.length) continue;
    if (key === 'imageryDate' && !IMAGERY_DATE.test(v)) continue;
    if (key === 'confidence' && !CONFIDENCE.includes(v)) continue;
    out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}

// `known` holds the queue's building ids. Answers for any other id go under
// `unmatched`, which the generator ignores, so nothing a surveyor saved is lost
// and nothing the generator would refuse reaches `answers`.
export function exportDocument({answers, known, pins, keys, exportedAt}) {
  const out = {}, unmatched = {};
  for (const id of Object.keys(answers).sort()) {
    const a = cleanAnswer(answers[id], keys);
    if (a) (known.has(id) ? out : unmatched)[id] = {...a, ...(answers[id].at ? {at: answers[id].at} : {})};
  }
  return {
    kind: 'mount-dora-house-survey', version: 3,
    ...Object.fromEntries(Object.entries(PINNED).map(([key, pin]) => [key, {...pin, sha256: pins[key]}])), exportedAt,
    evidence: {
      source: 'A person viewing Google Maps Street View and satellite imagery in Google Maps; no imagery is stored.',
      coordinates: 'Keyed by game building id: an OSM id, or a county- id for a building OSM lacks (county-buildings.json). Entrances are 1 m edges of the authored outline in town east/south metres.',
      observationDate: 'imageryDate is the "Image capture" month Google shows; at is when the answer was recorded.',
      uncertainty: 'confidence is the surveyor\'s own: sure, likely or unsure. Unanswered fields are unknown, not absent.',
      entrances: 'Only doors a person saw are marked. None are inferred from an address, outline or facade.',
      unmatched: 'Answers for building ids the surveyor\'s queue lacked. The generator ignores them until they are moved to a building.',
    },
    answers: out, ...(Object.keys(unmatched).length ? {unmatched} : {}),
  };
}
