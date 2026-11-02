# Mount Dora downtown and lakefront

An editable geographic blockout for the existing **Nautilus map workshop**, pinned
to `2502646482218524fd5129641da769bb82462e4d`. It covers **1,440 × 1,680 metres** in
**42 adjoining 240 × 240 m sectors**: six columns, A–F, and seven rows, 01–07.
North is up. Columns go east and rows go south.

Start with [the geographic overview](atlas.svg), then use the
[sector atlas and workshop instructions](workshop/README.md). The atlas selects
and downloads individual sectors; its isolated review host can open them in the
actual pinned workshop. The maps are authoring documents, not a new Farmyard
combat operation. Opening a sector does not stream neighboring sectors into it.

The published [sector atlas](https://syntaxswine.github.io/farmyard-commando/maps/mount-dora/workshop/)
offers the geographic overview and JSON downloads. Direct opening is available
only on the matching isolated Nautilus review host. The older AFT designer
embedded in the game is not evidence that Nautilus wall-run extensions render.

## What is authored

- Roads and paths, the complete Lake Dora shoreline polygon, park and wetland
  areas, and 950 source building footprints, including courtyard holes.
- Native angled exterior walls, floors and upper masks. Eighty-eight buildings
  cross sector boundaries; their source identities and wall geometry continue
  across the cuts without invented closing walls.
- Source-backed bridge and wooden boardwalk routes. Water is retained beneath
  these routes; park and vegetation fills do not manufacture land in the lake.
- A common metre coordinate system, all 42 native JSON documents, neighbor
  references, source feature identities, raw input snapshots and reproducible
  generation records.
- Declared mapped-tree proxies and seeded vegetation. These are scenery
  approximations, not a survey of individual trees or species.
- Mapped sports pitches exclude procedural trees. Tennis and pickleball polygons
  use a declared existing asphalt ground proxy without invented court markings;
  overlapping source records are retained rather than asserted as a current count.

**Thirty-nine sectors pass the existing native import contract.** A05, A06 and
A07 contain only lake water. Their geographic files are complete, but the
workshop refuses them because it requires four walkable squad starts and a
travel marker. The authoring data does not add fake platforms to bypass that
rule. The other sectors have five clearly identified authoring-validator
markers on connected existing land; these are not designed mission starts or
extraction points. No guards or objectives have been added.

## Scale, coverage and precision

The user's ruler measured approximately 1,480.5 m from the northern downtown
streets toward Palm Island. Seven 240 m rows leave room around those landmarks.
The screenshot's endpoints are not surveyed control points, so the source
geography is not stretched to fit the ruler exactly. `project.json` records the
calibration and the southern crop, including which Johns Avenue segments lie
outside it.

Coordinates use a WGS84 local tangent plane with east/south axes. Donnelly
Park's geocoding reference is town `(480,480)`; the named lighthouse source
point is `(500.2877,1169.7989)`. Source vectors retain sub-cell coordinates.
Terrain and floor masks sample one global 1 m grid before slicing it into
sectors, so adjacent maps use the same raster and origin. Legacy integer tile
centres are at sector origin plus `(x+0.5,y+0.5)`; wall endpoints account for that
offset once.

This is a geographic blockout, with **flat terrain and unsurveyed buildings**.
Native kit story heights, material defaults and source-tagged level counts are
declared in `project.json`. Closed exterior proxies do not imply known doors,
rooms, roofs or accessible interiors. Seven wall fragments below the native
0.1 m minimum are recorded in `features.json` diagnostics rather than silently
changing the source. Incomplete residential land-use relations are also
recorded and left unfilled. Proposed roads are retained as source references
and excluded from the terrain.

## Files and regeneration

| File | Purpose |
| --- | --- |
| `project.json` | Sector positions, neighbors, import status, hashes and assumptions |
| `features.json` | Source identities and projected vectors in local metres |
| `sectors/*.map.json` | Native AFT v2 maps with bounded `mountDora` metadata |
| `source/authoring-config.json` | Projection, source selection and generation settings |
| `source/*-source.json` | Request URLs, retrieval times, licence and exact input hashes |
| `art/` | Landmark treatment references and native-renderer studies |
| `workshop/` | Sector selection, downloads and the existing-editor bridge |

From the repository root, Python 3's standard library and Node 22+ are sufficient
for the base geography checks:

```powershell
python -B tools/maps/build-mount-dora.py --check
python -B -m unittest discover -s tests/maps -p 'test_*.py' -v
node tests/maps/validate-native-baseline.mjs
```

Omit `--check` to regenerate the 45 owned base outputs. Source snapshots are
retained byte for byte; `.gitattributes` prevents newline conversion from
invalidating their provenance. The workshop README documents the additional
exact-version API and browser checks, including editing, Undo/Redo and reopening
exported JSON. The basic format check alone is not evidence of native rendering.

## Editor findings

The [workshop feedback](../../docs/maps/mount-dora-editor-feedback.json) separates
observed behavior from proposals. The [art handoff](../../docs/art/mount-dora/shortcomings.md)
also records the real catalogue and source renderer limits.

| Missing capability | Effect on this project |
| --- | --- |
| Terrain-only authoring validation | Three all-water maps cannot open without invented mission markers. |
| Native town/georeference and shared cross-sector ownership | The atlas supplies context; a whole building cannot yet be edited across map boundaries as one object. |
| Continuous elevation authoring | Real road grades, sloped ground and boardwalk elevations remain unmodeled. |
| Freely placed facade/outdoor components and cross-map roof ownership | Landmark palettes and studies are useful references, but are not registered placements on the final sectors. |

The existing arbitrary-angle wall runs, Import/Export, terrain tools and
Undo/Redo are reused. The sector atlas adds selection and safe explicit opening;
it does not replace those editor systems.

## Source credit

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
available under ODbL 1.0. Read [source/NOTICE.txt](source/NOTICE.txt) for attribution
and reuse details. Official Mount Dora facility pages and the user's screenshots
inform the references; no Google imagery is included as terrain or a texture.
