# Large breakable windows — integration review

Status: draft for combined review. The code and geometry checks pass; native WebGL shading, live field picking, editor placement and audible playback still need a graphics-capable browser pass before promotion.

This branch starts at released `6e47587` and includes the actual artist commits `46a224b76ddeaf47156a7a118359530cc15cdd30` and `0ef5b7186970a32397a0c61bdedca2ba24c17c79` from [art PR #24](https://github.com/Syntaxswine/farmyard-commando/pull/24). Local cherry-picks are `8ab521e` and `5c04afb`. The 36 definitions include full-height and waist-up windows, spans of 1/2/3 m, uninterrupted glass, vertical/horizontal divisions and grids. Pane IDs, bounds and mesh handles come directly from the committed artist catalog and factory.

## Gameplay and authoring

The title screen's Map Designer opens a Farmyard wrapper around the existing pinned designer. Select a ground-floor wall, choose a window and frame finish, then Place at selected wall. Wide windows start at the selected wall cell. Remove window restores its stored original edges. The existing export/import and undo/redo retain placement IDs and the `farmyardWindows` extension. The pinned designer and AFT files remain byte-for-byte unchanged.

Open proving yard loads a small encounter into the existing designer; Playtest map starts the actual `FieldView` and combat rules. `window-yard.html` also opens the default yard directly. It contains both heights, plain and divided glass, two repeated clear 3 m instances, four rotations, wall joins, and a pane crossing a 24 m render seam. Playtests have their own save slot and do not change the three offered story operations. Flat authored maps retain their selected start and placed guards; unsupported terrain/vertical traversal is rejected.

Tap glass or a frame to confirm a normal shot or burst. Tapping a guard through transparent glass still selects the guard; the bullet simulation decides the first impact. A pane stops and breaks on its first accepted hit, while later burst rounds can pass through its hole. Frames, mullions, sills and lower walls retain actual height and collision. Clear glass is transparent to sight and blocks flame until broken. Walking through broken windows remains unavailable; no vault mechanic is introduced.

Save data stores breakage by placed instance plus pane ID. Transient cues are omitted from saves. Accepted events consume no combat randomness; repeat hits on a hole, restore and chunk revisits do not create new break events. Grenade/RPG/fuel blast paths can break several independent panes using their existing blast rules.

## Verification

All **327 tests** pass, as do `npm run build` and `git diff --check`. Focused tests cover all rotations, real pane ray hits/heights, lower walls/mullions, full-span breakage, divided independence, repeated instances, burst continuation, grenade/tank blasts, full and partly broken window flame previews, old-map compatibility, invalid saves, editor history/export, wall-end clipping, shard area/ground clearance, receipt deduplication, delayed audio disposal, chunk eviction/revisit and resource ownership. The artist tests include 576 definition/join/rotation combinations. Nested window art and new entry scripts share the game's cache version.

The browser reported `GL_VENDOR = Disabled`, `GL_RENDERER = Disabled`, and `Error creating WebGL context` in both the actual field and the pinned editor. See [field limitation](webgl-unavailable.jpg) and [editor limitation](editor-webgl-unavailable.jpg). Native visual and audio approval is therefore pending.

A temporary browser proof exercised the actual `Core`, `WindowScenery`, `WindowEffects` and reused study against the artist's existing software geometry rasterizer. It is clearly labelled software, and is outside the shipped app:

| Browser action | Observed result |
| --- | --- |
| Three-round burst | Ammo 30→27, AP 14→8; one `clear-a/r0c0` break; later rounds hit guard 1; repeated `clear-b` stays intact. |
| Divided-cell shot | Only `grid-a/r0c1` disappears; its five neighbours and structural members remain. |
| Mullion shot | Ammo 30→29, AP 14→10; zero accepted breaks or shards. |
| Grenade | Two independent nearby panes break, two effects, 140 triangles. |
| Save/restore | Hole retained; zero transient receipts, effects or shards replayed. |
| Leave/return | Hole retained; zero new effects. |
| Phone 390×844 | Actual pane geometry and state report remain readable in the software proof. |

![Divided pane after a revisit, software geometry proof](divided-revisit-software.jpg)

Other captures: [burst](burst-clear-software.jpg), [source shards](shatter-software.jpg), [restored](restored-software.jpg), [phone](phone-software.jpg). Software rendering does not verify native shading, vertex-colour fidelity, live field controls, or audible playback.

To reproduce this optional proof from the repository root, run `npm run build`, then `node docs/reviews/window-pane-integration/prepare-window-proof.mjs`, and serve the generated `dist/window-proof.html`. A fresh `npm run build` removes the private proof files from the app build.

## Reused source and limits

The authoritative shatter study is `AnimalFactory3D/animation-studies/window-sneak` at `ebf51393909040b61a7c40649d9d5f0ac3678735`. The adapter keeps its deterministic triangular fracture, analytic metre-scale gravity, rigid ground clearance, bounce and fade. It now accepts actual pane bounds and clears the new .20 m frame depth before falling. Source and audio hashes, adaptations and rights are in `sites/tactical-animal/window-shatter-provenance.json`. The original recording and license retain their exact bytes; the recording is rubberduck's `bfh1_glass_breaking_01`, CC0, with the original credit/source/deed retained in `dist/assets/audio/GLASS-SMASH-RUBBERDUCK-LICENSE.md`. No project-wide license was declared for the user-supplied study code; reuse follows the user's explicit direction. Three.js retains its existing MIT notice.

Only flat receiving floors at height 0 are supported. Shards are cosmetic and do not collide with nearby props. Six live shard meshes share 210 triangles; small cells use fewer, and a simultaneous six-cell break shares the budget. Reduced-motion, offscreen and excess-budget effects can be omitted without changing damage. Audio requires a browser gesture, obeys the proving-yard mute control, and is limited to three voices. Cosmetic loading or autoplay failure never blocks combat.

The local review helper and its restart record are maintained under `artifacts/preview/window-helper.json`. It has an actual 30-minute expiry and is stopped after review. No service or private proof page is retained for this draft.
