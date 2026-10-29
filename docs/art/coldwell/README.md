# Coldwell art integration

Artist branch `codex/coldwell-art`, based on released Farmyard `251bf8094b5f9ebe44208443084c1a6d6658512a`. This draft establishes the shared boundary; runtime derivatives, native proving views and final measurements follow in this PR. The architect owns combined integration/promotion. No gameplay capability is declared by the art package.

## API v1

`async createColdwellArt({THREE, assetBaseURL, manifest})` returns `{root, setVisibleRegion, syncDynamicState, diagnostics, dispose}`. Host supplies its existing Three namespace; the adapter imports no vendor renderer. The owned runtime entry will be `art/coldwell/index.js` and the data entry `art/coldwell/manifest.json`.

- `root` is a Three Group that can be added directly to the canonical `(x,h,y)` scene at scale one. Source frame conversions occur once; the coder must not add the old silo offset again.
- `await setVisibleRegion({rect:{x,y,w,h},heightBands:[{min,max}],cutaway})` updates presentation residency. Rect/bands are canonical metres, not floor indices. It is asynchronous because newly resident geometry can load on demand. Callers should await it when a complete frame is required. Returning a region never replays effects.
- `cutaway` accepts `roofs`, `canopies`, `display` booleans (true means show), plus optional `plane:{normal:[x,h,y],constant}` in Three's world-plane convention. These affect presentation only.
- `syncDynamicState(posesById)` accepts a plain record or Map keyed by exported rig IDs with numeric poses. Doors use degrees 0..90; service bridges/sliding cover use normalized 0..1. Validate updates atomically, retain last provided poses when hidden, and restore presentation from them. No internal clock/actions or authoritative simulation.
- `diagnostics()` reports resident draw objects/triangles, owned resource bytes/counts and lifecycle counters. These are candidate geometry counts; real renderer/GPU measurements are reported separately. `dispose()` is idempotent and releases only owned resources.

The manifest will export stable component/pick IDs, source and render bounds, floor/component memberships, rig descriptors and source provenance. Bounds use `{min:{x,y,h},max:{x,y,h}}`; source semantic geometry remains tagged with its source frame. Full bounds intersection governs residency, including cross-block pieces and motion sweeps. Render geometry/AABBs are not authoritative gameplay collision.

## Canonical coordinates

[contract.js](../../../sites/tactical-animal/dist/art/coldwell/contract.js) is the pure shared reference. `toCanonical('silo',[X,Y,Z])` gives `{x:X+38.5,y:Z+85.5,h:Y+46.64}`. `site` gives the common `.5/.5/46.64` conversion only. Already canonical companion anchors use `canonical` and receive no new offset. `toThree` returns `[x,h,y]`.

The 240 × 240 m source and all 23 silo datums stay intact. Keep 2 m walls, .12 m slabs, exact 2.12 m pitch and support roofs at 48.76 m. Nearby floor bands are a configurable development setting, not a measured phone limit. Visibility does not mutate source data, actors, loot, damage, rig poses, navigation or combat geometry.

## Provenance

Verified intake outer archive SHA256 `4abaee28fa9070f53a8923db28e2f92f8618d7443dfe16c5ae4421e21de87b36`; unchanged nested silo SHA256 `b489bb7439a22746281eb2dcc052cd124cc77917a9c00aeaa4c02ee5f1db873f`. Nautilus target `8c4670450cb2b38c1e1abd811d633c22de9e2b7c`; silo `3b9d4004a7e51e5d345cded068fc46eab2f320a2`. Donor prose/scripts are references; the owned compiler will read source data without executing donor build tools or copying its vendor runtime. Original notices/atlas and complete source archive remain preserved.
