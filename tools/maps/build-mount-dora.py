#!/usr/bin/env python3
"""Deterministic, stdlib-only OSM -> editable Nautilus aft-map-v2 authoring maps.

Coordinates are real metres in the project's WGS84 local tangent plane. Nothing
here executes a donor program, infers interiors or adopts the maps into a game.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict, deque
import hashlib
import html
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
PROJECT = ROOT / "maps" / "mount-dora"
KINDS = ("ground-grass", "water", "woodland", "ground-dirt", "ground-gravel",
         "ground-asphalt", "ground-concrete", "ground-wood-planks", "bridge", "floor")
CODE = {name: i for i, name in enumerate(KINDS)}
WIDTHS = {"secondary": 8, "tertiary": 7, "residential": 6, "unclassified": 6,
          "service": 3.5, "pedestrian": 4, "cycleway": 2.5, "footway": 2,
          "path": 1.5, "steps": 1.5, "track": 3, "living_street": 5}
PALETTE = {"ground-grass": "#87956c", "water": "#64899a", "woodland": "#426148",
           "ground-dirt": "#bcad83", "ground-gravel": "#b3b0a1", "ground-asphalt": "#676c68",
           "ground-concrete": "#d5cfb8", "ground-wood-planks": "#a28b60", "bridge": "#c3a875", "floor": "#d0c0a1"}
WATER = CODE["water"]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value, pretty=False):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False,
                       indent=2 if pretty else None,
                       separators=None if pretty else (",", ":")) + "\n").encode("utf-8")


class Projection:
    def __init__(self, definition):
        self.definition = definition
        reference = definition["reference"]
        self.p, self.l = map(math.radians, (reference["lat"], reference["lon"]))
        self.a = definition["ellipsoid"]["semiMajorM"]
        self.e2 = definition["ellipsoid"]["eccentricitySquared"]
        self.origin = self.ecef(reference["lat"], reference["lon"])

    def ecef(self, lat, lon):
        p, l = map(math.radians, (lat, lon))
        n = self.a / math.sqrt(1 - self.e2 * math.sin(p) ** 2)
        return n * math.cos(p) * math.cos(l), n * math.cos(p) * math.sin(l), n * (1 - self.e2) * math.sin(p)

    def __call__(self, lat, lon):
        dx, dy, dz = (a - b for a, b in zip(self.ecef(lat, lon), self.origin))
        east = -math.sin(self.l) * dx + math.cos(self.l) * dy
        north = -math.sin(self.p) * math.cos(self.l) * dx - math.sin(self.p) * math.sin(self.l) * dy + math.cos(self.p) * dz
        offset = self.definition["townOffsetM"]
        # Match the survey's 0.1 mm coordinate precision, then place the town.
        return [round(round(east, 4) + offset["x"], 4), round(round(-north, 4) + offset["y"], 4)]


def bounds(points):
    return [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]


def intersects_extent(box, width, depth, padding=0):
    return box[2] + padding >= 0 and box[3] + padding >= 0 and box[0] - padding <= width and box[1] - padding <= depth


def point_in_ring(point, ring):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def join_members(member_ids, ways):
    """Join complete node-ref chains in either orientation; never close a gap."""
    missing = sorted(i for i in member_ids if i not in ways)
    remaining = [(i, list(ways[i]["nodes"])) for i in sorted(member_ids) if i in ways]
    rings, open_chains = [], []
    while remaining:
        source_id, chain = remaining.pop(0)
        owners = [source_id]
        while chain and chain[0] != chain[-1]:
            match = next(((j, ids if ids[0] == chain[-1] else list(reversed(ids)))
                          for j, (_, ids) in enumerate(remaining)
                          if ids and chain[-1] in (ids[0], ids[-1])), None)
            if match is None:
                break
            index, ids = match
            owners.append(remaining[index][0])
            remaining.pop(index)
            chain.extend(ids[1:])
        (rings if len(chain) >= 4 and chain[0] == chain[-1] else open_chains).append((chain, owners))
    return rings, missing, open_chains


def category(tags):
    if tags.get("natural") == "water" or tags.get("waterway") in ("riverbank", "dock") and tags.get("area") == "yes":
        return "water"
    if tags.get("building") not in (None, "no"):
        return "building"
    if tags.get("highway"):
        return "road"
    if tags.get("amenity") == "parking":
        return "parking"
    if tags.get("natural") == "wood" or tags.get("landuse") == "forest":
        return "wood"
    if tags.get("natural") == "wetland":
        return "wetland"
    if tags.get("natural") == "beach":
        return "beach"
    if tags.get("leisure") in ("park", "garden", "nature_reserve", "playground", "pitch") or tags.get("landuse") in ("grass", "orchard") or tags.get("natural") == "scrub":
        return "park"
    return "context"


def load_source(project=PROJECT):
    source = project / "source"
    config = json.loads((source / "authoring-config.json").read_text("utf-8"))
    projection = Projection(config["projection"])
    objects, provenance, source_records = {}, defaultdict(list), []
    for item in config["sources"]:
        raw = (source / item["file"]).read_bytes()
        metadata = json.loads((source / item["metadata"]).read_text("utf-8"))
        if len(raw) != metadata["bytes"] or sha(raw) != metadata["sha256"]:
            raise ValueError("Source integrity mismatch: " + item["file"])
        source_records.append({"file": "source/" + item["file"], "metadata": "source/" + item["metadata"], "sha256": sha(raw), "bytes": len(raw)})
        for element in json.loads(raw)["elements"]:
            key = (element["type"], element["id"])
            provenance[key].append(item["file"])
            if key not in objects or element.get("version", 0) > objects[key].get("version", 0):
                objects[key] = element
    nodes = {i: e for (kind, i), e in objects.items() if kind == "node"}
    ways = {i: e for (kind, i), e in objects.items() if kind == "way"}
    relations = {i: e for (kind, i), e in objects.items() if kind == "relation"}
    xy = {i: projection(n["lat"], n["lon"]) for i, n in nodes.items()}
    width, depth = config["extent"]["widthM"], config["extent"]["depthM"]
    diagnostics, features, claimed = [], [], set()

    def feature(element, geometry, *, refs=None, members=None):
        kind, osm_id = element["type"], element["id"]
        tags = dict(sorted(element.get("tags", {}).items()))
        coordinates = geometry["coordinates"]
        if geometry["type"] == "Point":
            points = [coordinates]
        elif geometry["type"] == "LineString":
            points = coordinates
        else:
            points = [p for polygon in coordinates for ring in polygon for p in ring]
        if not points or not intersects_extent(bounds(points), width, depth, 16 if tags.get("highway") else 0):
            return
        value = {"id": f"osm-{kind}-{osm_id}", "category": "point" if kind == "node" else category(tags),
                 "osm": {"type": kind, "id": osm_id, "version": element.get("version"), "timestamp": element.get("timestamp"),
                         "sourceFiles": sorted(set(provenance[(kind, osm_id)]))},
                 "tags": tags, "geometry": geometry, "bounds": bounds(points)}
        if refs is not None:
            value["nodeRefs"] = refs
        if members is not None:
            value["members"] = members
        features.append(value)

    for osm_id, relation in sorted(relations.items()):
        tags = relation.get("tags", {})
        if tags.get("type") != "multipolygon" or category(tags) == "context" and not tags.get("landuse"):
            continue
        rings = {}
        problems = []
        for role in ("outer", "inner"):
            ids = [m["ref"] for m in relation["members"] if m["type"] == "way" and m.get("role", "outer") == role]
            chains, missing, opened = join_members(ids, ways)
            if missing or opened:
                problems.append({"role": role, "missingWayIds": missing, "openMemberGroups": [owners for _, owners in opened]})
            for refs, _ in chains:
                if any(i not in xy for i in refs):
                    problems.append({"role": role, "missingNodeIds": [i for i in refs if i not in xy]})
            rings[role] = [[xy[i] for i in refs] for refs, _ in chains if all(i in xy for i in refs)]
        if problems:
            if osm_id == 1163258:
                raise ValueError("The complete Lake Dora boundary is required: " + json.dumps(problems))
            diagnostics.append({"kind": "incomplete-multipolygon", "sourceId": f"osm-relation-{osm_id}", "problems": problems, "policy": "Not filled; original relation remains in source snapshots."})
            continue
        polygons = [[outer] for outer in rings["outer"]]
        for inner in rings["inner"]:
            containers = [p for p in polygons if point_in_ring(inner[0], p[0])]
            if len(containers) != 1:
                raise ValueError(f"Ambiguous multipolygon hole in relation {osm_id}.")
            containers[0].append(inner)
        if polygons:
            feature(relation, {"type": "MultiPolygon", "coordinates": polygons}, members=relation["members"])
            for member in relation["members"]:
                if member["type"] == "way":
                    claimed.add((member["ref"], category(tags)))
    for osm_id, way in sorted(ways.items()):
        tags, refs = way.get("tags", {}), way.get("nodes", [])
        if not tags or not refs:
            continue
        if any(i not in xy for i in refs):
            diagnostics.append({"kind": "incomplete-way", "sourceId": f"osm-way-{osm_id}", "missingNodeIds": [i for i in refs if i not in xy]})
            continue
        if (osm_id, category(tags)) in claimed:
            continue
        points = [xy[i] for i in refs]
        closed = len(refs) >= 4 and refs[0] == refs[-1]
        area = closed and (category(tags) not in ("road", "context") or tags.get("area") == "yes" or tags.get("landuse"))
        feature(way, {"type": "MultiPolygon", "coordinates": [[points]]} if area else {"type": "LineString", "coordinates": points}, refs=refs)
    for osm_id, node in sorted(nodes.items()):
        if node.get("tags"):
            feature(node, {"type": "Point", "coordinates": xy[osm_id]})
    features.sort(key=lambda f: f["id"])
    lake = next((f for f in features if f["id"] == "osm-relation-1163258"), None)
    if not lake or len(lake["members"]) != 4 or len(lake["geometry"]["coordinates"]) != 1:
        raise ValueError("Expected all four original Lake Dora outer members joined into one ring.")
    return config, projection, source_records, features, diagnostics


def polygon_spans(polygons, width, depth):
    """Even/odd scan conversion at global cell centres, with original holes."""
    # Each polygon's holes participate in one parity test. Separate polygons
    # union by painting; no per-cell traversal of the lake's thousands of edges.
    for polygon in polygons:
        rows = defaultdict(list)
        for ring in polygon:
            for a, b in zip(ring, ring[1:]):
                if a[1] == b[1]:
                    continue
                first = max(0, math.ceil(min(a[1], b[1]) - .5))
                last = min(depth, math.ceil(max(a[1], b[1]) - .5))
                slope = (b[0] - a[0]) / (b[1] - a[1])
                for y in range(first, last):
                    rows[y].append(a[0] + (y + .5 - a[1]) * slope)
        for y, values in sorted(rows.items()):
            values.sort()
            if len(values) % 2:
                raise ValueError("A source ring did not produce even scanline crossings.")
            for left, right in zip(values[::2], values[1::2]):
                start, end = max(0, math.ceil(left - .5)), min(width, math.ceil(right - .5))
                if start < end:
                    yield y, start, end


def paint_polygon(grid, polygons, code, width, depth, *, land_only=False, mask=None):
    for y, left, right in polygon_spans(polygons, width, depth):
        start, end = y * width + left, y * width + right
        if not land_only:
            grid[start:end] = bytes([code]) * (end - start)
            if mask is not None:
                mask[start:end] = b"\1" * (end - start)
        else:
            for index in range(start, end):
                if grid[index] != WATER:
                    grid[index] = code
                    if mask is not None:
                        mask[index] = 1


def paint_line(grid, points, width_m, code, width, depth, *, land_only=False, water_code=None, offset=0):
    radius = width_m / 2
    for a, b in zip(points, points[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length2 = dx * dx + dy * dy
        if not length2:
            continue
        if offset:
            length = math.sqrt(length2)
            ox, oy = dy / length * offset, -dx / length * offset
            a, b = [a[0] + ox, a[1] + oy], [b[0] + ox, b[1] + oy]
        x0, x1 = max(0, math.ceil(min(a[0], b[0]) - radius - .5)), min(width - 1, math.floor(max(a[0], b[0]) + radius - .5))
        y0, y1 = max(0, math.ceil(min(a[1], b[1]) - radius - .5)), min(depth - 1, math.floor(max(a[1], b[1]) + radius - .5))
        for y in range(y0, y1 + 1):
            py = y + .5
            for x in range(x0, x1 + 1):
                px = x + .5
                t = max(0, min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / length2))
                if (px - a[0] - t * dx) ** 2 + (py - a[1] - t * dy) ** 2 <= radius * radius:
                    index = y * width + x
                    if not land_only or grid[index] != WATER:
                        grid[index] = water_code if water_code is not None and grid[index] == WATER else code


def road_style(feature):
    tags = feature["tags"]
    highway = tags.get("highway")
    if highway in (None, "proposed", "construction") or tags.get("proposed") or tags.get("construction"):
        return None
    width = None
    raw_width = tags.get("width", "")
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(m|metres?|meters?|ft|feet|')?\s*", raw_width)
    if match:
        width = float(match[1]) * (.3048 if match[2] in ("ft", "feet", "'") else 1)
        if not .5 <= width <= 40:
            width = None
    width_source = "tag:width" if width is not None else "declared-class-default"
    width = width if width is not None else WIDTHS.get(highway, 4)
    surface = tags.get("surface")
    if surface in ("wood", "wood_planks") or tags.get("bridge") == "boardwalk":
        terrain = "ground-wood-planks"
    elif surface in ("concrete", "paved", "paving_stones", "sett") or highway in ("footway", "cycleway", "pedestrian", "steps"):
        terrain = "ground-concrete"
    elif surface in ("gravel", "fine_gravel", "pebblestone"):
        terrain = "ground-gravel"
    elif surface in ("ground", "dirt", "sand", "woodchips", "grass") or highway in ("path", "track"):
        terrain = "ground-dirt"
    else:
        terrain = "ground-asphalt"
    bridge = tags.get("bridge") not in (None, "no", "false", "0")
    return {"widthM": width, "widthSource": width_source, "terrain": terrain, "bridge": bridge,
            "woodSurface": terrain == "ground-wood-planks", "sidewalk": tags.get("sidewalk", "none"),
            "sidewalkWidthM": 1.5, "sidewalkWidthSource": "declared-default-if-mapped-present",
            "verticalPolicy": "Mapped steps/bridges are flat native authoring proxies; no surveyed elevation inferred."}


def building_style(feature):
    tags = feature["tags"]
    raw = tags.get("building:levels", "")
    stories = int(raw) if re.fullmatch(r"[1-5]", raw) else 1
    material = tags.get("building:material")
    if material in ("wood", "timber"):
        material = "wood"
    elif material in ("concrete", "cement"):
        material = "concrete"
    else:
        material = "brick"
    return {"stories": stories, "storiesSource": "tag:building:levels" if re.fullmatch(r"[1-5]", raw) else "unsurveyed-one-story-kit-proxy",
            "material": material, "materialSource": "tag:building:material" if tags.get("building:material") in ("wood", "timber", "concrete", "cement", "brick") else "unsurveyed-native-kit-proxy",
            "wallHeightM": 2, "slabM": .12, "floorPitchM": 2.12,
            "interiors": "not-surveyed; closed exterior proxy; no invented doors, stairs or room partitions"}


def clip_segment(a, b, width, depth):
    dx, dy, lo, hi = b[0] - a[0], b[1] - a[1], 0., 1.
    for p, q in ((-dx, a[0]), (dx, width - a[0]), (-dy, a[1]), (dy, depth - a[1])):
        if abs(p) < 1e-15:
            if q < 0:
                return None
        elif p < 0:
            lo = max(lo, q / p)
        else:
            hi = min(hi, q / p)
        if lo > hi:
            return None
    return [a[0] + lo * dx, a[1] + lo * dy], [a[0] + hi * dx, a[1] + hi * dy]


def deduplicated_walls(buildings):
    """Exact collinear interval union; shared party walls retain every owner."""
    groups = defaultdict(list)
    for feature in buildings:
        for polygon in feature["geometry"]["coordinates"]:
            for ring in polygon:
                for a, b in zip(ring, ring[1:]):
                    ax, ay, bx, by = (round(n * 10000) for n in (*a, *b))
                    dx, dy = bx - ax, by - ay
                    if not dx and not dy:
                        continue
                    divisor = math.gcd(dx, dy)
                    ux, uy = dx // divisor, dy // divisor
                    if ux < 0 or ux == 0 and uy < 0:
                        ux, uy = -ux, -uy
                    constant = ux * ay - uy * ax
                    norm = math.hypot(ux, uy)
                    vx, vy = ux / norm, uy / norm
                    ta, tb = (a[0] * vx + a[1] * vy), (b[0] * vx + b[1] * vy)
                    groups[(ux, uy, constant)].append((min(ta, tb), max(ta, tb), feature["id"], a, vx, vy))
    styles = {f["id"]: f["nativeProxy"] for f in buildings}
    result = []
    for key, segments in sorted(groups.items()):
        stops = sorted({round(t, 9) for s in segments for t in s[:2]})
        active = []
        for left, right in zip(stops, stops[1:]):
            if right - left < 1e-8:
                continue
            owners = sorted({s[2] for s in segments if s[0] < (left + right) / 2 < s[1]})
            if not owners:
                continue
            if active and active[-1][2] == owners and abs(active[-1][1] - left) < 1e-8:
                active[-1] = (active[-1][0], right, owners)
            else:
                active.append((left, right, owners))
        _, _, _, a, vx, vy = segments[0]
        base = a[0] * vx + a[1] * vy
        for left, right, owners in active:
            start = [a[0] + (left - base) * vx, a[1] + (left - base) * vy]
            end = [a[0] + (right - base) * vx, a[1] + (right - base) * vy]
            result.append({"id": "wall-" + sha(encoded([key, left, right]))[:18], "a": start, "b": end,
                           "owners": owners, "stories": max(styles[o]["stories"] for o in owners),
                           "material": styles[owners[0]]["material"]})
    return result


def sector_id(column, row):
    return chr(65 + column) + f"{row + 1:02d}"


def split_walls(walls, extent, diagnostics):
    size, width, depth = extent["sectorSizeM"], extent["widthM"], extent["depthM"]
    pieces = defaultdict(list)
    for wall in walls:
        clipped = clip_segment(wall["a"], wall["b"], width, depth)
        if not clipped:
            continue
        a, b = clipped
        dx, dy = b[0] - a[0], b[1] - a[1]
        cuts = {0., 1.}
        if abs(dx) > 1e-12:
            cuts.update((x - a[0]) / dx for x in range(size, width, size) if 0 < (x - a[0]) / dx < 1)
        if abs(dy) > 1e-12:
            cuts.update((y - a[1]) / dy for y in range(size, depth, size) if 0 < (y - a[1]) / dy < 1)
        ordered = sorted(cuts)
        part = 0
        for left, right in zip(ordered, ordered[1:]):
            length = math.hypot(dx, dy) * (right - left)
            divisions = max(1, math.ceil(length / 64))
            for i in range(divisions):
                lo, hi = left + (right - left) * i / divisions, left + (right - left) * (i + 1) / divisions
                start = [round(a[0] + dx * lo, 6), round(a[1] + dy * lo, 6)]
                end = [round(a[0] + dx * hi, 6), round(a[1] + dy * hi, 6)]
                col = min(extent["columns"] - 1, max(0, int((start[0] + end[0]) / 2 // size)))
                row = min(extent["rows"] - 1, max(0, int((start[1] + end[1]) / 2 // size)))
                sid, part = sector_id(col, row), part + 1
                actual = math.dist(start, end)
                if actual < .1 - 1e-6:
                    diagnostics.append({"kind": "wall-sliver-below-native-minimum", "sourceWallId": wall["id"], "sourceBuildingIds": wall["owners"], "sectorId": sid, "a": start, "b": end, "lengthM": actual})
                    continue
                pieces[sid].append({"id": f"md-{wall['id']}-{part}", "a": [round(start[0] - col * size - .5, 6), round(start[1] - row * size - .5, 6)],
                                    "b": [round(end[0] - col * size - .5, 6), round(end[1] - row * size - .5, 6)],
                                    "z": 0, "stories": wall["stories"], "material": wall["material"],
                                    "sourceBuildingIds": wall["owners"], "sourceWallId": wall["id"]})
    return pieces


def mixed_hash(x, y, salt=0):
    n = ((x * 73856093) ^ (y * 19349663) ^ (salt * 83492791) ^ 1947) & 0xffffffff
    n ^= n >> 16
    n = (n * 0x7feb352d) & 0xffffffff
    n ^= n >> 15
    return n


def preview_anchors(terrain, blocked, props, origin, size, width):
    ox, oy = origin
    occupied = {(p["x"], p["y"]) for p in props}
    eligible = bytearray(size * size)
    for y in range(1, size - 1):
        for x in range(1, size - 1):
            index = (oy + y) * width + ox + x
            if terrain[index] not in (WATER, CODE["floor"]) and not blocked[index] and not any((x + dx, y + dy) in occupied for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                eligible[y * size + x] = 1
    # A five-cell flood produces connected existing floor, even on narrow land.
    for index, valid in enumerate(eligible):
        if not valid:
            continue
        queue, seen = deque([index]), {index}
        eligible[index] = 0
        cluster = []
        while queue and len(cluster) < 5:
            current = queue.popleft()
            cluster.append(current)
            x, y = current % size, current // size
            for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                nx, ny = x + dx, y + dy
                nxt = ny * size + nx
                if 0 <= nx < size and 0 <= ny < size and eligible[nxt] and nxt not in seen:
                    eligible[nxt] = 0
                    seen.add(nxt)
                    queue.append(nxt)
        if len(cluster) == 5:
            return [{"x": i % size, "y": i // size, "z": 0} for i in cluster]
    return []


def render_atlas(features, config):
    extent = config["extent"]
    width, depth = extent["widthM"], extent["depthM"]
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {depth}" role="img" aria-label="Mount Dora native map atlas">',
           '<title>Mount Dora — source geometry, local metres</title>', '<desc>OpenStreetMap contributors. Editable geographic authoring approximation. Not a property survey.</desc>',
           f'<defs><clipPath id="extent"><rect width="{width}" height="{depth}"/></clipPath></defs>', f'<rect width="{width}" height="{depth}" fill="{PALETTE["ground-grass"]}"/>', '<g clip-path="url(#extent)">']
    def paths(polygons):
        return " ".join("M" + " L".join(f"{p[0]},{p[1]}" for p in ring) + " Z" for polygon in polygons for ring in polygon)
    for kind, color in (("park", "#9ea77a"), ("wood", PALETTE["woodland"]), ("wetland", "#849476"), ("beach", "#d0bf8e"), ("parking", PALETTE["ground-asphalt"]), ("water", PALETTE["water"])):
        for feature in features:
            if feature["category"] == kind and feature["geometry"]["type"] == "MultiPolygon":
                out.append(f'<path d="{paths(feature["geometry"]["coordinates"])}" fill="{color}" fill-rule="evenodd"/>')
    for feature in features:
        style = feature.get("nativeRoad")
        if style and feature["geometry"]["type"] == "LineString":
            points = " ".join(f"{p[0]},{p[1]}" for p in feature["geometry"]["coordinates"])
            out.append(f'<polyline points="{points}" fill="none" stroke="{PALETTE["bridge"] if style["bridge"] else PALETTE[style["terrain"]]}" stroke-width="{style["widthM"]}" stroke-linecap="round" stroke-linejoin="round"/>')
    for feature in features:
        if feature["category"] == "building" and feature["geometry"]["type"] == "MultiPolygon":
            out.append(f'<path d="{paths(feature["geometry"]["coordinates"])}" fill="{PALETTE["floor"]}" stroke="#6c6254" stroke-width=".6" fill-rule="evenodd"/>')
    out.append('</g><g fill="none" stroke="#f6f0d8" stroke-width="1.2" opacity=".8">')
    for x in range(0, width + 1, extent["sectorSizeM"]):
        out.append(f'<path d="M{x},0 V{depth}"/>')
    for y in range(0, depth + 1, extent["sectorSizeM"]):
        out.append(f'<path d="M0,{y} H{width}"/>')
    out.append('</g><g font-family="monospace" font-size="14" fill="#fff7df" stroke="#26372e" stroke-width=".4" paint-order="stroke">')
    for row in range(extent["rows"]):
        for col in range(extent["columns"]):
            out.append(f'<text x="{col * 240 + 8}" y="{row * 240 + 20}">{sector_id(col,row)}</text>')
    for item in config.get("landmarkOverrides", []):
        point = item.get("town", item.get("townMetres", item.get("expectedTownM")))
        if isinstance(point, dict):
            point = [point["x"], point["y"]]
        if point:
            out.append(f'<text x="{point[0]}" y="{point[1]}">{html.escape(item.get("label", item.get("name", "Landmark")))}</text>')
    out.append('</g><g font-family="sans-serif" font-size="14" fill="#243d36">')
    out.append(f'<rect x="0" y="{depth - 27}" width="{width}" height="27" fill="#ede7d3" opacity=".94"/>')
    out.append(f'<text x="12" y="{depth - 9}">OpenStreetMap contributors · ODbL 1.0 · https://www.openstreetmap.org/copyright · 240 m sectors</text>')
    out.append('</g></svg>\n')
    return "\n".join(out).encode("utf-8")


def build_project(project=PROJECT):
    config, projection, source_records, features, diagnostics = load_source(project)
    extent = config["extent"]
    width, depth, size = extent["widthM"], extent["depthM"], extent["sectorSizeM"]
    if width != 1440 or depth != 1680 or size != 240 or extent["columns"] != 6 or extent["rows"] != 7:
        raise ValueError("This authoring extent is the agreed 42 native sectors.")
    terrain = bytearray(width * depth)
    green = bytearray(width * depth)
    source_water = bytearray(width * depth)
    buildings, roads = [], []
    for feature in features:
        if feature["category"] == "road":
            style = road_style(feature)
            if style:
                feature["nativeRoad"] = style
                roads.append(feature)
            else:
                feature["nativeOmission"] = "Proposed/construction road; retained as source, not painted."
        elif feature["category"] == "building" and feature["geometry"]["type"] == "MultiPolygon":
            feature["nativeProxy"] = building_style(feature)
            buildings.append(feature)
    for feature in features:
        if feature["category"] == "water" and feature["geometry"]["type"] == "MultiPolygon":
            paint_polygon(terrain, feature["geometry"]["coordinates"], WATER, width, depth)
    source_water[:] = bytes(1 if value == WATER else 0 for value in terrain)
    for kind, value, greenery in (("park", CODE["ground-grass"], 1), ("wood", CODE["woodland"], 2), ("wetland", CODE["ground-grass"], 3), ("beach", CODE["ground-dirt"], 0), ("parking", CODE["ground-asphalt"], 0)):
        for feature in features:
            if feature["category"] == kind and feature["geometry"]["type"] == "MultiPolygon":
                polygons = feature["geometry"]["coordinates"]
                paint_polygon(terrain, polygons, value, width, depth, land_only=True)
                if greenery:
                    for y, left, right in polygon_spans(polygons, width, depth):
                        for index in range(y * width + left, y * width + right):
                            if terrain[index] != WATER:
                                green[index] = greenery
    # Sidewalks first, then every mapped carriageway/path; no cross-junction curb
    # paints over a later road. Left/right follow OSM way direction in east/south.
    for feature in roads:
        style, geometry = feature["nativeRoad"], feature["geometry"]
        if geometry["type"] != "LineString":
            continue
        sidewalk = style["sidewalk"]
        sides = (-1, 1) if sidewalk in ("yes", "both") else (1,) if sidewalk == "left" else (-1,) if sidewalk == "right" else ()
        for side in sides:
            paint_line(terrain, geometry["coordinates"], 1.5, CODE["ground-concrete"], width, depth, land_only=True, offset=side * (style["widthM"] / 2 + .75))
    for feature in roads:
        style, geometry = feature["nativeRoad"], feature["geometry"]
        if geometry["type"] == "MultiPolygon":
            paint_polygon(terrain, geometry["coordinates"], CODE[style["terrain"]], width, depth, land_only=not style["bridge"])
        else:
            bridge, wooden = style["bridge"], style["woodSurface"]
            paint_line(terrain, geometry["coordinates"], style["widthM"], CODE["bridge"] if bridge else CODE[style["terrain"]], width, depth,
                       land_only=not (bridge or wooden), water_code=CODE["bridge"] if wooden else None)
    upper = defaultdict(dict)
    building_cells = defaultdict(int)
    sector_buildings = defaultdict(set)
    for feature in buildings:
        stories = feature["nativeProxy"]["stories"]
        sectors = set()
        for y, left, right in polygon_spans(feature["geometry"]["coordinates"], width, depth):
            for x in range(left, right):
                terrain[y * width + x] = CODE["floor"]
                sid = sector_id(x // size, y // size)
                sectors.add(sid)
                sector_buildings[sid].add(feature["id"])
                building_cells[feature["id"]] += 1
                for layer in range(1, stories + 1):
                    upper[(sid, layer)][f"{x % size},{y % size}"] = "floor"
        feature["nativeSectors"] = sorted(sectors)
        feature["nativeFloorCells"] = building_cells[feature["id"]]
        if not sectors:
            diagnostics.append({"kind": "building-below-raster-resolution-or-outside", "sourceId": feature["id"], "policy": "Footprint/walls retained; no raster cell centre lies inside."})
    walls = deduplicated_walls(buildings)
    wall_pieces = split_walls(walls, extent, diagnostics)
    # A source boundary can enter a neighbouring sector by less than one cell.
    # Preserve its global building identity there even when no floor sample fits.
    for sid, runs in wall_pieces.items():
        for run in runs:
            sector_buildings[sid].update(run["sourceBuildingIds"])
    for feature in buildings:
        feature["nativeSectors"] = sorted(sid for sid, owners in sector_buildings.items() if feature["id"] in owners)
    blocked = bytearray(width * depth)
    for wall in walls:
        paint_line(blocked, [wall["a"], wall["b"]], 2.6, 1, width, depth)
    # Native trees/reeds are intentional visual proxies, not a tree survey. All
    # scattering is global-coordinate seeded, so regeneration/seams never move it.
    props_by_sector = defaultdict(list)
    prop_cells = set()
    def add_prop(x, y, kind, source_id=None):
        if not (0 <= x < width and 0 <= y < depth) or (x, y) in prop_cells or terrain[y * width + x] not in (CODE["ground-grass"], CODE["woodland"]) or blocked[y * width + x]:
            return
        prop_cells.add((x, y))
        sid = sector_id(x // size, y // size)
        value = {"x": x % size, "y": y % size, "z": 0, "kind": kind}
        # Arbitrary per-prop metadata is preserved by native map JSON.
        value["mountDora"] = {"sourceId": source_id, "placement": "mapped-tree-cell-proxy" if source_id else "declared-seeded-greenery"}
        props_by_sector[sid].append(value)
    for feature in features:
        if feature["geometry"]["type"] == "Point" and feature["tags"].get("natural") == "tree":
            x, y = feature["geometry"]["coordinates"]
            add_prop(math.floor(x), math.floor(y), "tree-pine" if feature["tags"].get("leaf_type") == "needleleaved" else "tree-broadleaf", feature["id"])
    for gy in range(4, depth, 12):
        for gx in range(4, width, 12):
            seed = mixed_hash(gx, gy)
            x, y = gx + (seed % 7) - 3, gy + ((seed >> 4) % 7) - 3
            value = green[y * width + x]
            chance = {0: 0, 1: 25, 2: 80, 3: 50}[value]
            if (seed >> 12) % 100 < chance:
                add_prop(x, y, "reeds" if value == 3 else "tree-broadleaf")
    outputs, sectors = {}, []
    config_digest = sha((project / "source" / "authoring-config.json").read_bytes())
    digest = sha(encoded(source_records))
    for row in range(extent["rows"]):
        for col in range(extent["columns"]):
            sid, ox, oy = sector_id(col, row), col * size, row * size
            cells = b"".join(terrain[(oy + y) * width + ox:(oy + y) * width + ox + size] for y in range(size))
            counts = Counter(cells)
            runs = sorted(wall_pieces[sid], key=lambda r: r["id"])
            props = sorted(props_by_sector[sid], key=lambda p: (p["y"], p["x"], p["kind"]))
            anchors = preview_anchors(terrain, blocked, props, (ox, oy), size, width)
            levels = max(3, max((run["stories"] + 1 for run in runs), default=3),
                         max((layer + 1 for key_sid, layer in upper if key_sid == sid), default=3))
            mapping = {"version": 2, "width": size, "height": size, "levels": levels, "name": f"Mount Dora {sid} - native authoring sector",
                       "terrain": [[KINDS[value] for value in cells[y * size:(y + 1) * size]] for y in range(size)],
                       "upper": [upper.get((sid, z), {}) for z in range(1, levels)], "edges": {}, "stairs": [], "climbs": [], "props": props,
                       "starts": anchors[:4], "guards": [], "exits": anchors[4:],
                       "mountDora": {"version": 1, "projectId": config["id"], "sectorId": sid, "originM": {"x": ox, "y": oy},
                                     "sourceDigest": digest, "buildingIds": sorted(sector_buildings[sid]),
                                     "previewAnchors": "Authoring-validator markers on existing connected land; not real spawn/extraction locations.",
                                     "buildingPolicy": "Source footprints, closed native-kit exteriors; unsurveyed heights/interiors; no cut-boundary cap walls."}}
            if runs:
                mapping["wallRuns"] = {"version": 1, "segments": runs}
            filename = f"sectors/{sid}.map.json"
            data = encoded(mapping)
            if len(data) > 4000000 or len(runs) > 4096 or sum(math.ceil(math.dist(r["a"], r["b"]) - 1e-9) * r["stories"] for r in runs) > 50000:
                raise ValueError(f"Native document budget exceeded in {sid}.")
            outputs[filename] = data
            ready = len(anchors) == 5
            native_import = {"ready": ready}
            if not ready:
                native_import.update({"reason": "Existing native validator requires four distinct walkable starts and one walkable travel marker; this sector has no five safe connected existing land cells. Water is preserved without fake platforms.",
                                      "validatorRefusal": "Place exactly four valid squad starts."})
            metrics = {"terrainCells": size * size, "terrainCounts": {KINDS[k]: v for k, v in sorted(counts.items())}, "terrainSHA256": sha(cells),
                       "sourceWaterCells": sum(source_water[(oy + y) * width + ox:(oy + y) * width + ox + size].count(1) for y in range(size)),
                       "buildingCount": len(sector_buildings[sid]), "wallRunCount": len(runs), "nativePanelCount": sum(math.ceil(math.dist(r["a"], r["b"]) - 1e-9) * r["stories"] for r in runs),
                       "propCount": len(props), "bytes": len(data), "sha256": sha(data)}
            sectors.append({"id": sid, "column": col, "row": row, "origin": {"x": ox, "y": oy}, "file": filename,
                            "neighbors": {"north": sector_id(col,row-1) if row else None, "east": sector_id(col+1,row) if col+1 < extent["columns"] else None,
                                          "south": sector_id(col,row+1) if row+1 < extent["rows"] else None, "west": sector_id(col-1,row) if col else None},
                            "bounds": {"x": ox, "y": oy, "widthM": size, "depthM": size}, "nativeImport": native_import, "metrics": metrics,
                            "buildingIds": sorted(sector_buildings[sid])})
    feature_database = {"kind": "mount-dora-source-features", "version": 1, "id": config["id"], "projection": config["projection"],
                        "coordinates": "Local east/south metres, 0.0001m precision; original WGS84/node refs are preserved in source snapshots.",
                        "sources": source_records, "features": features, "diagnostics": diagnostics}
    outputs["features.json"] = encoded(feature_database)
    outputs["atlas.svg"] = render_atlas(features, config)
    manifest = {"kind": "mount-dora-native-project", "version": 1, "id": config["id"], "name": config["name"], "target": config["target"],
                "projection": config["projection"], "extent": {"widthM": width, "depthM": depth}, "sectorSize": size, "columns": extent["columns"], "rows": extent["rows"],
                "featuresFile": "features.json", "atlasFile": "atlas.svg", "sectors": sectors, "sources": source_records,
                "generation": {"tool": "tools/maps/build-mount-dora.py", "version": 1, "configFile": "source/authoring-config.json", "configSHA256": config_digest,
                               "sourceDigest": digest, "terrainCodebook": list(KINDS), "globalTerrainSHA256": sha(terrain),
                               "sampleRule": "Global cell centre (column*240+x+0.5, row*240+y+0.5); one global raster sliced without seam repaint.",
                               "nativeCoordinates": "Wall metre endpoints = global east/south - sectorOrigin - 0.5; tile indices remain integer cells.",
                               "defaultRoadWidthsM": WIDTHS, "sidewalkWidthM": 1.5, "sidewalkPresence": "Mapped sidewalk=yes/both/left/right only; separate footways retain their source geometry.",
                               "waterPolicy": "Fill complete source polygons first; land cover never creates land in water. Only mapped building footprints, bridges or wooden-surface paths can provide source-backed support over water.",
                               "vegetation": {"seed": 1947, "gridM": 12, "jitterM": 3, "parkAcceptancePercent": 25, "woodAcceptancePercent": 80, "wetlandAcceptancePercent": 50,
                                              "policy": "Mapped tree cell proxies plus declared seeded broadleaf/reed scatter on mapped land vegetation; not surveyed species or individual tree positions."},
                               "buildingDefaults": {"stories": 1, "material": "brick", "heightM": 2, "slabM": .12, "pitchM": 2.12,
                                                    "policy": "Native-kit closed exterior proxies; integer tagged levels1..5 honored. Source outlines/holes retained; no invented entrances/interiors; shared party wall ownership retained."}},
                "landmarks": config.get("landmarkOverrides", []),
                "calibration": config.get("calibration", {}), "coverageNotes": config.get("coverageNotes", []),
                "metrics": {"sectors": len(sectors), "nativeImportReady": sum(s["nativeImport"]["ready"] for s in sectors),
                            "nativeImportRefused": sum(not s["nativeImport"]["ready"] for s in sectors), "featureCount": len(features),
                            "featureCategories": dict(sorted(Counter(f["category"] for f in features).items())), "buildingCount": len(buildings),
                            "crossSectorBuildings": sum(len(f["nativeSectors"]) > 1 for f in buildings), "roadCount": len(roads),
                            "excludedProposedRoads": sum("nativeOmission" in f for f in features), "wallRuns": sum(len(r) for r in wall_pieces.values()),
                            "props": sum(len(p) for p in props_by_sector.values()), "terrainCounts": {KINDS[k]: v for k, v in sorted(Counter(terrain).items())},
                            "unrepresentedWallSlivers": sum(d["kind"] == "wall-sliver-below-native-minimum" for d in diagnostics)},
                "limitations": ["Geographic map-authoring source, not a deployed Farmyard mission or a property survey.",
                                "Flat terrain; no elevation survey, true building heights, real interiors or mapped entrance survey is inferred.",
                                "One-metre cell-centre floor/terrain masks approximate exact source polygons, whose vector geometry remains in features.json.",
                                "Native wall runs retain angled exterior/courtyard boundaries; sub0.1m run slivers cannot be represented and are listed in features.json diagnostics.",
                                "Native wall butt joints, per-run texture phases and one-metre floor stair-step boundaries retain the workshop's existing limits.",
                                "Water-only sectors remain complete in the atlas/source but the existing four-start/one-exit native validator refuses them.",
                                "Road widths, sidewalk widths, bridge/steps heights and seeded vegetation are declared authoring approximations, not measurements.",
                                "No suggested future roads are painted; no enemies or gameplay objectives are authored."]}
    outputs["project.json"] = encoded(manifest, pretty=True)
    return outputs, manifest, feature_database, terrain


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Regenerate in memory and verify every owned output without writing.")
    args = parser.parse_args()
    outputs, manifest, _, _ = build_project()
    for name, data in outputs.items():
        destination = PROJECT / name
        if args.check:
            if not destination.exists() or destination.read_bytes() != data:
                raise SystemExit("Stale Mount Dora output: " + name)
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
    print(json.dumps({"mode": "verified" if args.check else "generated", "files": len(outputs), **manifest["metrics"]}, indent=2))


if __name__ == "__main__":
    main()
