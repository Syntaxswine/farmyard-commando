# Mount Dora walking-tour runtime

The regular game can load the full 1440 × 1680 metre town as a free walking tour.
Open `game.html?activity=mount-dora`, choose an animal and equipment, then deploy.
The link selects preparation only. Walking, joystick, keyboard, stance and camera
controls use the existing game. Combat actions are explicitly unavailable in this
activity. Other operations retain their existing rules and save slots.

## Coordinate and source contract

The adapter preserves Farmyard's integer-centred gameplay coordinates. Town/art
coordinates are metres east/south; game x/y equal town east/south minus 0.5 exactly
once. Three coordinates are `(game x, height, game y)`, without scaling.
Native tile centres add the sector origin. Native wall endpoints already contain
the minus-half shift and add the sector origin only. Artist roots, movement
solids, visits and minimap markers receive the same single transform.

The lighthouse at town `(500.2877,1169.7989)` is game
`(499.7877,1169.2989)`. The outer edges become
`[-0.5,1439.5] × [-0.5,1679.5]`; the animal's radius must fit inside them.

`TownWorld` reads `project.json` and the 42 native 240 metre sectors directly.
Each sector is SHA-256 verified against the project before decoding. The runtime
source revision includes projection, generator version and all sector hashes.
Feature bytes must match the artist manifest's source hash. Unsupported native
geometry fails explicitly. Authoring squad starts/exits never become gameplay
objectives or markers. Upper masks represent exterior height/roof proxies, with
no invented building interiors, doors or extra gameplay floors.

The unchanged Nautilus wall helper, its immutable source commit and SHA-256 are
recorded in `dist/mount-dora-source/`. Movement uses its oriented wall slabs,
plus the kit's polygon, circle and capsule solids; AABBs are broad-phase queries
only. A shared wall remains solid whenever any native owner remains. Water and
unknown ground block movement. Mapped bridge/wood tiles support walking.

## Production art and ownership

The reviewed production kit is consumed through its manifest and
`createMountDoraArt({THREE,atlas})` factory. Runtime never edits the artist-owned
`dist/mission-art/mount-dora/`, `maps/mount-dora/art/` or `docs/art/mount-dora/`.

The manifest supplies stable source IDs, complete bounds, `ART_REVISION` and
explicit collision policy. `retain-source-walls` replaces visual proxies while
keeping native physical walls. `replace-source-walls` removes only named native
owners and uses the model's actual supports. `additional-solids` supplies parts
such as the lighthouse and boardwalk rails. All native building proxies in the
current kit are replaced. Whole objects are selected by bounds intersection,
including objects spanning blocks or sectors; no seam caps are added.

`TownEnvironment` owns its native ground/plant textures, buffers, materials and
atlas load lifetime. The kit borrows the atlas, owns placement resources and is
disposed before its atlas owner. Its sampler/material ownership remains inside
the kit. `updateResident` instantiates intersecting placements only. `setFocus`
runs after actor/camera updates and fades actual occluding meshes without
changing collision. Pooled opaque materials remain available on exit from focus.

## Bounded residency and movement

The render window contains at most nine 24 metre blocks. Crossing one block
retains six blocks and replaces three. A 72 metre window intersects at most four
240 metre source sectors. Camera-window sources and nearby actor collision
sources are pinned; neighboring sectors are prefetched subject to these caps:

| Resource | Cap |
| --- | --- |
| Decoded sectors | 9 |
| Concurrent fetches | 2 |
| Pending fetches | 9 |
| Sector response bytes | 4,000,000 |
| Navigation nodes / links | 16,384 / 131,072 |
| Explored blocks | 4,200 × 72 bytes |
| Geographic overview | 180 × 210 pixels |

The terrain facade has metadata-only lazy rows. There is no full-town JavaScript
terrain matrix, per-move clone or scan, or eagerly instantiated building scene.
Loaded sector packets retain their native terrain arrays by reference; least
recently used unpinned packets retire before another packet is decoded. Movement
and bounded navigation query nearby geometry, while explored bits update locally.

Absent terrain stops the animal at its last clear position. Source failures are
visible with an explicit retry. `Visit landmark` is optional: it loads and
validates the destination before moving the animal. Failure leaves position
unchanged, and choosing that landmark again retries. Continuous travel across
seams remains available independently of visits. Disposal aborts source loads and
releases caches, listeners, navigation and resident rendering resources.

## Separate progress and verification

Tour progress uses `farmyard-mount-dora-tour-v1`, separate from operation slots.
It contains source/art revisions, global position, animal/equipment/resources,
distance, elapsed time and compact explored bits. Static map cells are never
serialized. A full explored-town bitset occupies 302,400 raw bytes. Resume validates
resources, equipment and position against the current loaded town before starting.
Preparation preferences may remember the chosen activity; the operation writer
refuses tour state explicitly.

`npm run check` includes source/cache, coordinate, oriented-wall/shared-owner,
water/deck, compact-save, deep-link and production-kit travel regressions.
`tools/test-mount-dora-walkthrough.mjs` builds on the ordinary production route
and uses real browser clicks, keyboard and touch input with read-only diagnostics.
It covers a four-sector corner, a spanning building, landmark loading/failure and
retry, the original boardwalk entrance/join/over-water return, reload, operation
save preservation, source/render caps and exit cleanup on desktop and 390 × 844.
This viewport check is not a physical-phone performance benchmark. Browser/server
helpers have a fifteen-minute hard deadline and close in `finally`, recording
process identities and released ports. Evidence is written to ignored
`artifacts/mount-dora-walkthrough/` and retained by the dedicated CI workflow.

Branch `codex/mount-dora-walkthrough` starts from published release `75a6b61` and
includes reviewed combined map/art base `5218ffc`. The Architect owns combined
release integration and promotion; this branch does not publish main or Pages.
