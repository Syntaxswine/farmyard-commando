# Coldwell art integration

`codex/coldwell-art` adapts the complete verified Coldwell surface and silo into Farmyard's existing Three instance. The architect owns combined integration and promotion. This package supplies artwork and presentation residency; it registers no gameplay capabilities.

## Runtime contract

```js
import {createColdwellArt} from './art/coldwell/index.js';
const art = await createColdwellArt({THREE});
scene.add(art.root);
renderer.localClippingEnabled = true;
await art.setVisibleRegion({
  rect: {x:120, y:72, w:72, h:72},
  heightBands: [{min:33.8, max:38.2}],
  cutaway: {roofs:false, display:false,
    plane:{normal:[0,0,-1], constant:103.5}}
});
art.syncDynamicState({'silo-cover':0.5, 'blast-door-west':45});
// When this operation/view ends:
await art.dispose();
```

`async createColdwellArt({THREE, assetBaseURL?, manifest?})` returns `{root,setVisibleRegion,syncDynamicState,getManifest,diagnostics,whenIdle,dispose}`. The default asset URL is this module's directory; a supplied URL must resolve to the same package layout. A supplied manifest is cloned and validated. Otherwise `manifest.json` loads first. All compressed data and default PNG loads verify their byte counts and SHA-256 before decoding. Browser requirements are Web Crypto, gzip `DecompressionStream`, and ordinary HTML images; the host owns renderer selection and WebGL support.

- `root` already uses canonical Three `(x,h,y)` metres and must retain an identity transform. Source frame children receive their conversion once. Do not add the old preview offset or another vertical translation.
- `await setVisibleRegion({rect:{x,y,w,h},heightBands:[{min,max}],cutaway})` loads components whose full bounds intersect the canonical metre rectangle and any height band. Static silo geometry is clipped into 24 m blocks and 2.12 m vertical bands. Source floor/component identity remains attached. Surface instances use full transformed bounds; moving rigs use conservative complete motion bounds and one owner.
- Overlapping calls are **latest-request-wins**. A superseded call resolves `{applied:false,superseded:true}`. Loads are staged with six workers; a successful latest call atomically replaces its prior region. A failed verification/load rejects and preserves the previous complete region. Identical rendering settings reuse overlapping resident models. There is no unbounded mesh cache.
- `cutaway` accepts `roofs`, `canopies`, `display` booleans (true means show), plus optional `plane:{normal:[x,h,y],constant}`. The plane is in canonical **world** coordinates and keeps the nonnegative signed-distance side. Non-unit input scales the normal **and constant** together to normalize the plane. Height unions and planes also clip custom depth/distance shadow materials. Enable host local clipping for the plane.
- `syncDynamicState(recordOrMap)` validates the whole update before changing any pose. Values are absolute source poses: four underground and three surface doors in degrees `0..90`; service bridges and cover in `0..1`. Missing IDs retain their last value. Hidden updates are retained, and a resident rig receives the newest value before joining the scene. No timer, interpolation, effects, AP, collision or save state lives here.
- `await dispose()` immediately detaches the root, cancels pending data loads, releases current resources and waits for late loads to settle and release their resources. It is idempotent. `whenIdle()` waits for outstanding region requests. Calls that start after disposal reject. Shared host Three and renderer resources are never disposed.
- `getManifest()` returns a copy. `diagnostics()` reports candidate objects/triangles, geometry and instance bytes, texture pixels, resident IDs, supplied poses and lifecycle counters. These are CPU-side resource measurements; use the host's `renderer.info` and device timing for draw calls/GPU performance.

The optional `fetch` and `loadTexture` injections support deterministic host tests. An injected texture loader must return a new **owned** texture, honoring the lifetime signal where possible. Default PNG loading performs integrity verification. Do not pass shared host textures to this owned-loader hook.

A surface view should include the actual canopy heights (the proving view uses `46.4..56 m`); a narrow indoor height band will intentionally clip tall vegetation. Nearby floor width is a configurable development setting. No phone performance budget has been inferred from CPU counts.

## Stable geometry and picking

`manifest.json` contains 635 components, 23 datums, 14 rig descriptors, canonical bounds and integrity descriptors. It retains the full 240 × 240 m terrain, 488 edges including 400 fence sections, 78 trees/four source families, five cargo props, 168 roof cells, all three support buildings, infill and the complete silo. The source game mesh has 96 curve segments and a maximum recorded shaft chord error of 4.56 mm. No boxes replace annular floors, clipped polygons, stairs or openings.

Every resident mesh has `userData.componentId`. Rig meshes also expose `rigId`. Surface instances have `userData.sourceIds[hit.instanceId]` for original floor, edge or prop identity. A source prop can have trunk and canopy render components; both refer to one source ID. `manifest.entries` retains source batch or source object IDs and full bounds. These IDs/bounds support presentation and picking, not exact simulation collision.

Original rig IDs are `service-bridge-5/8/11/14/17/20`, `blast-door-west/east/inner/portal`, and `silo-cover`. Surface IDs are `surface-door:s:94:141`, `surface-door:s:109:119`, and `surface-door:s:118:94`; they preserve the source leaves/handles and bind them to the original renderer's door pose function. Surface lintels remain static. Native descriptors and batches for the 11 supplied rigs are unchanged.

`semantics.json.gz` preserves complete silo floors/cells, landings, stairs, openings, cableways, rooms, bridges, cover and display metadata, tagged `frame:'silo'`. Infill is `frame:'site'`. Companion anchors and world datums are already canonical. These are source data for the coder's explicit provider and do not claim unsupported capabilities. `source/` preserves the original game mesh, infill, surface map/RLE, full collection catalogue, binding, layout and notices/provenance.

## Coordinates

[contract.js](../../../sites/tactical-animal/dist/art/coldwell/contract.js) defines:

| Source | Canonical `{x,y,h}` |
|---|---|
| Silo native Three `[X,Y,Z]` | `{x:X+38.5,y:Z+85.5,h:Y+46.64}` |
| Legacy site Three `[X,Y,Z]` | `{x:X+.5,y:Z+.5,h:Y+46.64}` |
| Companion access anchors / world datums | Already canonical; no additional offset |

Keep all 23 datums at `0..46.64 m`, exact 2.12 m pitch, 2 m walls, .12 m slabs and support roofs at 48.76 m. Deep slabs extend to `h=-.12`; do not clamp them to ground. The infill receives only the common site shift. The shaft center is `{x:149.5,y:103.5,h:46.64}`; the entry landing is `{x:72,y:115,h:46.64}`.

## Source reuse map

Nautilus release `8c4670450cb2b38c1e1abd811d633c22de9e2b7c` and original silo `3b9d4004a7e51e5d345cded068fc46eab2f320a2` are pinned. Farmyard baseline is `251bf8094b5f9ebe44208443084c1a6d6658512a`. [source provenance](../../../sites/tactical-animal/dist/art/coldwell/source/provenance.json) records source paths, bytes, original hashes and newline comparisons. Existing frozen AFT modules are unchanged.

| Existing implementation | Farmyard use | Demonstrated gap / minimal bridge |
|---|---|---|
| Silo `packages/silo/three.js` | Complete original geometry builder, materials, `setRigPose`, `setView`, diagnostics and disposal | Imports pull in procedural authoring/map-core. Generated import binding accepts verified prebuilt subsets and exact material/datum constants. Original renderer body, motion math and view code are unchanged and tested byte-for-byte after import substitution. |
| Silo game mesh + atlas | All static/rig geometry and unmodified painterly atlas | Original model allocates all geometry. Compiler clips static triangles at 24 m and 2.12 m boundaries, interpolating normals/UVs. Area conservation is independently checked. Original rig batches/descriptors stay whole. |
| Frozen `hybrid-world.js`, `environment-visuals.js`, `environment-geometry.js` | Exact surface floor/wall/window/fence descriptors and geometry | Run existing factories only at build time, then export prototype instances with complete bounds. Three is supplied by the host at runtime. |
| Frozen `biome-foliage-models.js`, parts/data and `biome-family.js` | All 78 trees, original variant hash, grounding, mature scale and rotated placement | Compile existing factory output into shared prototypes. No replacement tree model. |
| Frozen `painted-cargo.js`, `painted-environment-scene.js`, `battle-environment.js` | Native crate/drum geometry, source finishes, atlas crops and shader patches | Serialize existing factory geometry/material results; retain exact source paint patches. Three source surfaces bind to the existing door pose function. |
| Frozen biome foliage / map-ground paint and atlas LOD | Original plant projection, ground mixture, periodic sampling and far averages | Parameterize Three; select only requested paint; use precomputed original map weights instead of importing map-core into the runtime. Subtract the common source shift in paint coordinates so atlas phase stays unchanged. |
| Frozen `hybrid-materials.js` | Original surface pixels/material IDs and planar world UV mapping | Serialize source pixels; adapt instance UV origin to canonical placement. No new industrial material style is invented. |

Full byte copies of the original silo renderer, geometry and designs remain under `upstream/`, alongside donor notices. The unchanged outer/nested intake archives remain in the verified primary-project intake; the runtime contains the needed original data and reproducible derivatives rather than shipping every duplicate glTF/authoring export.

## Reproduce and review

The tested build environment is Node 24.15.0 and Python 3.12.14. Preparation verifies the entire extracted package against the outer archive, verifies the nested silo hash, reads immutable Nautilus Git objects and checks the reused Farmyard modules against them. It never runs donor build scripts or edits donor checkouts.

```powershell
python sites/tactical-animal/dist/art/coldwell/tools/prepare.py VERIFIED_PACKAGE_DIR PINNED_NAUTILUS_CHECKOUT
node sites/tactical-animal/dist/art/coldwell/tools/compile.mjs
node --test sites/tactical-animal/tests/coldwell-art.test.mjs
npm run build
npm run check
```

Verified outer SHA-256: `4abaee28fa9070f53a8923db28e2f92f8618d7443dfe16c5ae4421e21de87b36`; nested silo: `b489bb7439a22746281eb2dcc052cd124cc77917a9c00aeaa4c02ee5f1db873f`. Re-running the compiler must leave identical derivative hashes. Its cleanup removes only obsolete files from its own flat `chunks/` directory.

[Native proving page](../../../sites/tactical-animal/dist/art/coldwell/review.html) uses Farmyard's pinned Three, not a donor renderer instance. It provides approach, roof-hidden building, portal, B5 curved floor/openings, stairs, and closed/half/open cover views; resource counts, unload/restore/dispose controls and the reviewed revision are visible. If WebGL is unavailable it explicitly withholds visual approval while exercising actual geometry and decoded assets. It does not display a substitute render as native proof. Exact-commit evidence and browser limitations are recorded in `review.json` when QA finishes.

The coder owns FieldView, collision/clearance/support, interaction state/saves, mission registration, build cache versioning and runtime CI. In particular, add `art/coldwell/**` to the application's coordinated cache-version inputs when integrating it. This draft PR does not alter those files and is not promoted to main/Pages.

Final art QA: production build and all **401** repository tests pass, including **11** focused art tests. Compilation is deterministic; original geometry area, source object coverage, rigs, residency races and disposal are checked. The eight proving views decoded their verified assets in the real browser, the 390 × 844 layout has no horizontal overflow, and all 274 created models / 352 geometries / nine atlas lifetimes were released at the end of review. No preview helper or tab remains running.

**Native visual approval remains pending:** the available Codex browser returned no WebGL 2 context. `review.json` pins the reviewed runtime commit `372c09c23754c00fede6b1cc927063204421e4f5`, measurements and source hashes. `browser-observations.json` contains the DOM-visible counts and lifecycle evidence. The accompanying screenshot records the explicit unavailable-rendering status; it is not a rendered artwork comparison. Actual shader compilation, shadows, combined FieldView and device performance remain architect/coder review gates.
