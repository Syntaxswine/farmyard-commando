# Mount Dora house parts

One file per building, so each house can be reused in another map or game:
1,076 files covering the 950 OpenStreetMap footprints and the 126 county-sketched
buildings OSM lacks. Each `<id>.json` is a self-contained `house-part`, version 1,
that a reader can use without the rest of the town. `index.json` lists them with
their size, storeys, roof form, whether they fit a workshop block and their
SHA-256.

A part is the house alone on its own 1 m grid. It moves as one rigid unit: by
quarter turns on any grid, or at any angle and position in a host that is not
on a grid, such as a house set along a curved street.

## What a part holds

| Field | Meaning |
| --- | --- |
| `kind`, `version`, `id` | `house-part`, `1`, and the town's building id (an OSM way or relation, or `county-…`) |
| `name`, `address` | The OSM name. The address is from OSM, else the county parcel joined to the building, with its join method. Either may be null. |
| `frame` | The coordinate conventions, repeated in every file so it stands alone |
| `size` | `[width, depth]` of the outline in metres |
| `outline` | GeoJSON-style MultiPolygon on the 1 m grid, origin at its minimum corner, holes kept |
| `floorCells` | The 1 m cells inside the outline, as rows `[y, x0, x1]` covering `x0` to `x1 - 1` |
| `walls` | Exterior walls as integer segments that trace the outline exactly once. `sharedWith` names a neighbour across a party wall; `sourceWallId` is the generator's wall id. |
| `storeys`, `material` | The count and wall material (wood, brick or concrete), each with the evidence that set it: survey, then OSM tag, then county, then lidar, then the kit default |
| `kit` | Native dimensions: 2.12 m storey pitch, 2 m walls, 0.12 m slabs, 0.16 m wall thickness. Interiors are not surveyed. |
| `roof` | The lidar roof: form, confidence, pitch, the ridge's axis in the part frame, eave, upper-eave and ridge heights above the ground, the ground in NAVD88 metres, coverage, and the dataset and flight date (2018-12-06) |
| `appearance` | The production art kit's treatment, seed and provenance at its `artRevision`, with its points in the part frame |
| `entrances` | `not-surveyed`, with no records. Doors come only from a person's survey (AGENTS.md); none are inferred from an address, outline or facade. |
| `placements` | The pivot, the grid pose (where the house sits in the town) and the true pose (its measured angle, latitude and longitude), each with its fit to the measured footprint |
| `evidence` | County, lidar and survey values and their disagreements, as in `features.json` |
| `source` | The OSM element's id, version, timestamp and tags, or the county sketches |
| `provenance` | Layout digest, shared-wall component, sectors, the grid fit's derivation and metrics, and the measured footprint in the part frame |

Every level from 0 to `storeys` has floor on `floorCells`. Level 0 is the ground
floor and level `storeys` is the roof deck, as in the town's sector maps.

## Placing a part

```
world = at + R(rotationDeg) · (p − pivot)        R(θ) = [[cos θ, −sin θ], [sin θ, cos θ]]
```

`p` is a point in the part frame. `R` turns +x toward +y, which is clockwise on
a north-up map because +y is south. `placePoint` and `placePart` in
`tools/maps/house-parts/house-parts.mjs` are the reference implementation.

- **Grid pose** (`placements.grid`): `rotationDeg` 0. It puts the house back
  exactly where the town has it.
- **True pose** (`placements.true`): the angle the grid fit removed when it squared
  the house to the town grid. Most Mount Dora houses are within a few degrees of
  the grid. For the 52 turned more than 5°, the true pose covers the measured
  footprint at a median IoU of 0.906, against 0.663 squared to the grid and
  0.589 turned the wrong way. It wins on all 52.
- **Any pose**: pick `at` and `rotationDeg`. The walls, floor and roof turn
  together. The ridge's compass bearing is `90 + rotationDeg + roof.ridgeAxisDeg`.

Three buildings use reviewed grid overrides (`placements.true.method`). Their
true pose is only as good as its `fitIoU`.

## In the Nautilus workshop

873 parts fit a 24 × 24 m block; 203 are larger, up to 88 × 61 m. Export blocks
on demand. They are not committed:

```powershell
node tools/maps/house-parts/export-block.mjs osm-way-547799531
node tools/maps/house-parts/export-block.mjs --all
```

They land in `artifacts/house-parts/blocks/`. To use one in the workshop:

1. Open **Settings** and **Import** the `.block.json` file.
2. Click **Save** to keep it in the browser's design library.
3. Switch **Workspace** to the map. Pick the house under **Saved designs**, set the
   sector, and click **Place selected block**.

A block replaces its whole 24 m square and lands only on the 24 m grid. The house
sits centred in it; `housePart.offset` records where.

`workshop.json` is the receipt for the pinned workshop at Nautilus `2502646`:
- **Every block:** validates, imports with no value changed, places into a valid
  map, extracts back unchanged, and is restored by four quarter turns.
- **Three houses through the real controls:** Import, Save, Place selected
  block, Export.

## Regenerating and checking

```powershell
node tools/maps/house-parts/build-house-parts.mjs          # after the town, evidence or art kit changes
node tools/maps/house-parts/build-house-parts.mjs --check
node --test tests/maps/house-parts.test.mjs
```

Generation refuses to write unless three things hold:
- every part validates;
- stamping all parts back into the 42 sector maps reproduces them byte for byte,
  with the generator's rules mirrored in `house-parts.mjs`;
- every art placement rebuilds exactly from its part.

`--check` fails while any part is stale. A change to a field the parts do not
read, such as a survey camera, leaves them current.

After a change to the geometry of a part that fits a block, rerun the workshop
receipt. The commands are in `maps/mount-dora/workshop/README.md`.

```powershell
node tools/prepare-mount-dora-workshop.mjs --source artifacts/mount-dora-workshop/nautilus-2502646 --git-source <read-only Nautilus repository> --project maps/mount-dora/project.json
node tools/maps/house-parts/review-house-part-blocks.mjs --source artifacts/mount-dora-workshop/nautilus-2502646 --git-source <read-only Nautilus repository> --browser
```

## Limits

- **Exterior shells only.** There are no interiors, stairs or doors, because none
  have been surveyed.
- **The roof is measured data, not geometry.** The game draws roofs from the art
  kit. Nautilus's sloped-roof contract takes rectangles only.
- **Walls follow the grid plan, not the survey.** The measured footprint is kept
  in `provenance.geographicOutline`.
- **No Farmyard operation map can play a part yet.** The operation loader
  (`adaptAftSector`) refuses upper floors and ignores wall runs. Only the Mount
  Dora tour reads them.
- **One known disagreement with the art kit.** It draws the ridge of one square
  house (`osm-way-1241962342`) along y, while lidar measures it along x.

## Sources

Footprints and tags © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
ODbL 1.0; see [../source/NOTICE.txt](../source/NOTICE.txt). County records are
Lake County Property Appraiser public data. Roofs and heights are from USGS 3DEP
lidar, which is public domain. The same sources and caveats as
[../reference/](../reference/README.md) apply.
