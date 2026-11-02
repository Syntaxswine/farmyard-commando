# Mount Dora walking tour

The playable integration starts from released Farmyard `75a6b61` and the
reviewed Nautilus `2502646482218524fd5129641da769bb82462e4d`. The runtime and
production artwork are implemented on separate branches and reviewed together.

## Coordinate and physical contract

Geographic/art records remain in town east/south metres. Farmyard preserves its
existing integer-centred gameplay tiles: **game = town − (0.5,0.5)**. Apply that
conversion once to art, art solids, visit positions and markers. Native wall-run
endpoints already contain it; add only their sector origin. The lighthouse is
town `(500.2877,1169.7989)`, game `(499.7877,1169.2989)`.

A native block-window rectangle becomes town bounds
`[window.x,window.y,window.x+window.w,window.y+window.h]`. Keep complete objects
whose bounds intersect that rectangle, even if their anchors lie outside it.
Physics and source identities remain independent of rendering residency.

The production art manifest separates three collision policies:

- `retain-source-walls`: closed mapped buildings retain exact native wall
  collision. Their duplicate art footprint polygons do not add another solid.
- `replace-source-walls`: mapped open shelters remove their closed native proxy
  walls and upper/roof visuals, retain ground/decks, and use actual support
  parts. A shared wall survives if an unreplaced owner still needs it.
- `additional-solids`: lighthouse, posts and boardwalk rails supplement the
  existing source. Their shapes and mesh placements share one source record.

Building facade replacement also removes the corresponding native wall/upper
visual proxies. Court markings and facade decoration do not reserve walkable
ground. Existing wall queries and panel geometry are reused from the immutable
Nautilus source, with the original 0.16 m thickness, 2 m wall body and 2.12 m
story pitch.

## Independent outdoor route evidence

`maps/mount-dora/playable/route-fixtures.json` records a source-backed Donnelly
Park spawn, ten approaches, all eleven internal north/south or east/west sector
boundary lines, and a four-sector loop at Donnelly Park. It also records an
unobstructed approach beside the source building crossing B03/C03 and a probe
that must be stopped by that building's wall.

The audit reuses the **exact original** `wallRunsIntersect` implementation with
the game's 0.23 m animal radius. It checks outdoor native terrain, excludes
water and closed building interiors, and conservatively reserves vegetation
anchor cells. All **39 land sectors** are in one reachable outdoor component.
The Palm Island approach lies on a mapped bridge/wood route over the source
lake polygon, rather than merely on a wooden path on land.

The fixture also retains both original boardwalk centre lines. Production side
rails can legitimately intersect a source-only grid route that hugged the deck
edge. Validate movement through the actual lane and its joins; the old grid
turn points are not an instruction to cross a rail. Early geometry checks found
the mapped centre lines clear at the 0.23 m animal radius.

This is reference geometry evidence, not proof of the finished runtime. Final
tests must apply production landmark supports, loading failures, scene/resource
retirement and save/resume. Route fixtures must be walked through the real
movement rules; teleporting to their destinations is not a seam-travel test.

To reproduce the source audit, supply the immutable wall helper (SHA-256 is
checked before import):

```powershell
node tools/maps/review-mount-dora-routes.mjs --wall-module PATH_TO_EXACT_WALL_RUNS_JS
```

The helper is `packages/map-core/wall-runs.js` at the revision above; the
artifact snapshot used during review is byte-identical to that Git object.

## Building references

Street View extraction is not part of the asset pipeline. Google's published
[Geo Guidelines](https://about.google/brand-resource-center/products-and-services/geo-guidelines/)
restrict creating data from Street View imagery. Actual facade observations
instead use the city's [historic-preservation material](https://mountdora.gov/282/Historic-Preservation),
the [Mount Dora Archives](https://www.mountdoraarchives.com/), and official
property references such as [Lakeside Inn](https://lakeside-inn.com/about-us/).

The artist records observation separately from inferred dimensions, roof forms
and ordinary house typology. All source footprints and courtyard holes remain
authoritative; historical photographs are not a survey of current buildings or
interiors. Reference photographs are not embedded as game textures.
