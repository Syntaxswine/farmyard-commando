# Mount Dora house reference

Per-building facts for the 950 game buildings, so houses can be built to the
right height, material and porch rather than the generator's default. Today
`building_style()` in `tools/maps/build-mount-dora.py` makes every building
without a `building:levels` tag a **one-storey brick box**. Only 13 of the 950
have that tag, and none has an OSM material, roof shape or colour.

This folder adds two layers on top of the OSM geography, without editing it:

1. **County records, automatic.** Lake County publishes a building record for
   every parcel (storeys, exterior wall, roof cover, year built, porches,
   garage). `house-reference.json` ties each game building to its record.
2. **A person's eyes, fast.** The [survey page](survey/) opens Google Street View
   at each building in turn, already aimed at it, and records what a person
   sees: roof shape, colours, wall finish, porch. Answers export to
   `house-survey.json`.

Nothing here changes the sectors, `features.json` or the art kit, and the Pages
build does not publish this folder (`build.mjs` copies an explicit file list).

## What the county records add

| Measure (950 game buildings) | Before | With county records |
| --- | ---: | ---: |
| Storey count from a source | 13 | 910 (798 one, 107 two, 4 three, 1 four) |
| Two storeys or more | 10 | 112 |
| Rooms in the roof (county 1.25–1.75 or 2.25–2.75) | 0 | 89 |
| Wall material from a source | 0 | 759 (265 wood frame) |
| Roof cover known | 0 | 729: 519 shingle, 176 metal, 18 tar-and-gravel (flat), 10 rolled, 6 tile |
| Porch recorded | 0 | 638 |
| Planned Street View camera | 0 | 950 (865 on the addressed street; median 24 m away) |

How each building was matched (`match.method`):

| Method | Buildings | Meaning |
| --- | ---: | --- |
| `footprint` | 684 | The appraiser's building sketch overlaps the game outline, IoU ≥ 0.5 |
| `footprint-partial` | 90 | Most of a sketch lies inside the game outline, but the outlines differ |
| `parcel-single` | 135 | No sketch (commercial or unsketched); the only building on the lot |
| `parcel-area` | 23 | Several buildings on the lot; picked by ground-floor area |
| `none` | 18 | No record: the high-school campus and a few outbuildings |

**The county also has buildings the game lacks.** 247 appraiser sketches inside
the town are claimed by no game building. 205 of them have no game building on
them at all: 82 single-family houses, 89 residential-condo buildings, 4
duplexes, and offices and shops. They are listed under `countyOnly`, with their
outline in town metres and `coveredByGame`, so the generator can add them.

## Caveats, checked on real buildings

- County codes are a strong prior, not ground truth. The Donnelly House
  (1893, wooden Queen Anne, already hand-built yellow siding in the art kit) is
  recorded as `CONCRETE BLOCK PLAIN`. Commercial records often leave wall and
  roof blank. The survey exists to confirm or correct them.
- `BRICK/BLOCK STUCCO OR SIDING` is one county code for three finishes. It maps
  to the kit's `concrete` with `finishUnknown`, and the survey decides.
- `STORIES` 1.25–1.75 means usable rooms under the roof. It maps to
  `stories: 1, halfStory: true` (a steep roof with dormers), not to two floors.
- The sketch layer is residential only and "only the portion of the county
  completed to this point" (the appraiser's caveat). Commercial buildings join
  through their parcel.
- `basement: true` (75 game buildings) usually marks a sloping lot. The town is
  still flat in the game; this is a lead for terrain, not used yet.

## Lidar: roof shape, heights and terrain

USGS 3DEP lidar (flown 6 December 2018, 29.6 returns per m²) adds what county
records lack: a roof form for every building (569 gable, 118 hip, 104 flat,
155 other, 4 too sparse to tell), eave and ridge heights, ground elevation,
and a 1 m bare-earth grid with 36 m of relief. It agrees with the county's
storeys (AUC 0.88, κ 0.54), and the same pipeline on footprints shifted 30 m
fails. It also puts the Grantham Point lighthouse at 7.0 m, not 35 ft. Method,
validation and files are in [lidar/README.md](lidar/README.md).

## Why Street View is a link and not a download

Automating Street View captures would break Google's terms. The Google Maps
Additional Terms (modified 2026-01-27) forbid users to "mass download or create
bulk feeds of the content". The Maps Platform terms (the paid API route) add
"Customer will not create content based on Google Maps Content". This
repository is also public, and the art kit's
[source policy](../../../docs/art/mount-dora/production-sources.json) already
rules out Street View tracing, extraction or caching. So the tool plans the
camera (`streetView.url`, a keyless
[Maps URL](https://developers.google.com/maps/documentation/urls/get-started)),
Google shows the panorama in its own viewer, and a person writes down what they
see. No pixels are requested, stored or traced.

Openly licensed street photos exist on Mapillary (CC BY-SA), but in November
2026 it covers only a few downtown streets, so it is not used here.

## Files

| File | Written by | Contents |
| --- | --- | --- |
| `county/footprints.geojson` | `fetch-county.mjs` | Appraiser building sketches in the town box (AltKey, building number, outline) |
| `county/parcels.geojson` | `fetch-county.mjs` | Parcels: situs address, land use, building count. No owner fields |
| `county/buildings.csv` | `fetch-county.mjs` | Building records: style, wall, roof cover, storeys, year built, areas |
| `county/subareas.csv` | `fetch-county.mjs` | Sub-areas per building in sq ft (living, upper storey, porches, garage…) |
| `county/extra-features.csv` | `fetch-county.mjs` | Lot features: detached garages, pools, docks, sheds |
| `county/source.json` | `fetch-county.mjs` | URLs, retrieval times, bytes and SHA-256 of every input and kept file |
| `house-reference.json` | `build-house-reference.mjs` | One record per game building, plus `countyOnly` |
| `survey/` | hand-written | The survey page |
| `house-survey.json` | the survey's Export | A person's answers, keyed by building id (not created yet) |
| `lidar-roofs.json` | `tools/maps/lidar/build-lidar.mjs` | Lidar roof form, eave and ridge heights and ground per game building |
| `lidar/` | `tools/maps/lidar/` | Lidar provenance and the 1 m bare-earth grid ([details](lidar/README.md)) |

Owner names and mailing addresses, sale prices, appraised values, exemptions,
bedrooms and bathrooms are never requested or written. A test enforces this.

## Running it

From the repository root, with Node 22 or later (no dependencies):

```powershell
node tools/maps/house-reference/fetch-county.mjs          # monthly county release; ~110 MB cached in artifacts/
node tools/maps/house-reference/build-house-reference.mjs # writes house-reference.json
node tools/maps/house-reference/build-house-reference.mjs --check
node --test tests/maps/house-reference.test.mjs
node tools/maps/house-reference/serve.mjs                 # http://127.0.0.1:4597/reference/survey/
```

The county replaces its files each month (`Bldg_MMDDYY.txt`). The fetch picks
the newest release; `--release 100626` pins one. A re-fetch changes
`county/source.json` and usually a few records; rerun the build after it.

## Surveying

Open the survey, pick a sector or keep the whole town, and work down the queue.
It runs street by street. For each building:

1. Press **V**. Street View opens in a second tab, always the same one, at the
   nearest panorama, facing the building. Pan if it is off-centre. **A** opens
   the satellite view, where the roof shape is easiest to read.
2. Tap what you see. Buttons marked *county* show what the record says.
3. If you can see a door, click the dashed game outline on the mini-map where it
   is. That marks one 1 m wall edge; click it again to remove it.
4. Type the panorama's "Image capture" month (`2024-03`) and pick a confidence.
5. Press **Enter** for the next building. Answers save in the browser as you go.

Export whenever you stop, and commit the file as
`maps/mount-dora/reference/house-survey.json`. Import merges by the newest answer
per building, so two people can split the town by sector.

### Evidence rules

The repository's `AGENTS.md` (from PR #39) says geographic details, doors above
all, go "only where source data or reviewed observations establish them", and
keep "the source, coordinates, observation date and uncertainty". A survey
answer is such a reviewed observation, and its export (version 2) says so in an
`evidence` block:

| Rule | Where it lives in `house-survey.json` |
| --- | --- |
| Source | `evidence.source`: a person viewing Google Maps; no imagery stored |
| Coordinates | the building id; each entrance is a 1 m edge of the game's grid outline, in town metres |
| Observation date | `imageryDate` (Google's capture month) and `at` (when the answer was recorded) |
| Uncertainty | `confidence`: sure, likely or unsure. An unanswered field is unknown, not absent |

Entrances are only doors a person saw. None are inferred from an address, an
outline or a facade, so a building with no marked entrance keeps none. All 950
authored outlines lie on the 1 m grid (a test checks this), so any wall can take
an entrance. Editor doors are grid edges too (`e:x:y` / `s:x:y` in a sector), so
converting a marked edge to a door record is a sector offset away. That
conversion, and a playtest through the real game path, belong to the wiring
step.

## Use in the generator and the art kit

`building_style(feature)` in `tools/maps/build-mount-dora.py` takes storeys, in
this order:

1. the survey answer (`house-survey.json`);
2. the mapped `building:levels` tag;
3. the county suggestion (`house-reference.json` → `suggested`);
4. lidar (`lidar-roofs.json` → `storeysFromLidar`, from the eave height);
5. the one-storey kit default.

The tag outranks the county because county `STORIES` is wrong for some
commercial records. The three-storey Shamrock Building is recorded as 1, while
OSM says 3 and lidar measures a 10.5 m eave. Materials follow the survey, then
the `building:material` tag, then the county wall code, then the brick default.
Survey `wall` maps to the kit as follows: `wood-siding` and `other-siding` →
`wood`, `brick` → `brick`, and `stucco`, `block` and `stone` → `concrete`.

Each building records its sources in `nativeProxy` (`storiesSource`,
`materialSource`, `evidence`). Where county and lidar give different storeys
(114 buildings), `evidence.storiesDisagreement` keeps both for a survey to settle.
The three evidence files are pinned in `project.json`. They pin `features.json`
without `nativeProxy` (`tools/maps/house-reference/features-digest.mjs`), so a
regeneration never invalidates its own inputs.

The art kit (`maps/mount-dora/art/tools/build-playable.mjs`) then sets the
following from the same evidence:

- the wall class: frame → one of the siding textures, masonry → plaster, brick → brick;
- the roof cover: metal → silver metal, tile → terracotta, tar-and-gravel → flat;
- the roof form, pitch and ridge axis, from lidar at confidence ≥ 0.7, or from a survey answer.

Colours stay seeded placeholders until a survey records them. Hand-authored
landmarks (Donnelly House, museum, depot, Shamrock, Lakeside Inn) keep their
curated treatments. Each placement's `provenance.evidence` names the source of
every evidence-driven field.
