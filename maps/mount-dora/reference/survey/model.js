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

export function exportDocument({answers, sha256, countySha256, keys, exportedAt}) {
  const out = {};
  for (const id of Object.keys(answers).sort()) {
    const a = cleanAnswer(answers[id], keys);
    if (a) out[id] = {...a, ...(answers[id].at ? {at: answers[id].at} : {})};
  }
  return {
    kind: 'mount-dora-house-survey', version: 3,
    reference: {file: 'maps/mount-dora/reference/house-reference.json', sha256},
    countyBuildings: {file: 'maps/mount-dora/reference/county-buildings.json', sha256: countySha256}, exportedAt,
    evidence: {
      source: 'A person viewing Google Maps Street View and satellite imagery in Google Maps; no imagery is stored.',
      coordinates: 'Keyed by game building id: an OSM id, or a county- id for a building OSM lacks (county-buildings.json). Entrances are 1 m edges of the authored outline in town east/south metres.',
      observationDate: 'imageryDate is the "Image capture" month Google shows; at is when the answer was recorded.',
      uncertainty: 'confidence is the surveyor\'s own: sure, likely or unsure. Unanswered fields are unknown, not absent.',
      entrances: 'Only doors a person saw are marked. None are inferred from an address, outline or facade.',
    },
    answers: out,
  };
}
