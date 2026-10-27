# Short Measure runtime blockout

This is the first new playable operation in **The First Shift**. The Night Ledger remains separately selectable. Spatial and story source: design commit `5524d91b3971328f27ccc9bb50b41ce7d2a19482`, `docs/missions/first-shift.md` and `first-shift.maps.json` (design PR #7). The authoring JSON is not imported as a runtime save or map.

## Simulation and presentation

`missions.js` owns the two immutable runtime definitions. Simulation, hand targets, preparation, objective/extraction pins, minimap, assignment, results, restart, and saves resolve the selected definition. Arrival is `(4,25)`, the shipping manifest is `(32,7)`, and the east loading gate is `(35,25)` on the existing 40 × 30 backing grid. One controllable animal uses the existing loadouts, distance/AP rules, weapons, grenades, and interaction costs. Guard deaths alone do not complete either operation.

All nine new doors use the same 2 m wall height and the same solid footprint in rendering, collision, sight, pathfinding, and grenade checks. Each door has an independently persisted open state. Free inspections record notes; collection records the manifest; extraction requires collection. Both the direct packing-hall route and the alternate route around its west/north sides are playable.

## Art handoff

Inherited cargo renders the following solid cells. Rectangles are `[x,y,width,height]`, including cells from the origin through `origin + size - 1`. Keep these footprints clear of additional collision unless the runtime definition is also deliberately updated.

| Placement ID | Rectangle | Purpose |
| --- | --- | --- |
| `west-sack-bay` | `[8,10,2,2]` | Western cover |
| `north-sack-bay` | `[11,5,3,1]` | Alternate route cover |
| `hall-sack-bay` | `[16,10,2,2]` | Packing hall cargo |
| `hall-packing-stack` | `[21,14,2,1]` | Packing hall cover |
| `sealed-load` | `[27,19,2,2]` | Inspectable Reserve 7 cargo |
| `loading-stack` | `[31,17,2,1]` | Dispatch-to-gate cover |
| `east-gate-stack` | `[34,21,2,1]` | Eastern cover |

The `worker-scale` clue is at `(8,20)` inside the ration shed. Its current marker adds no collision. The `sealed-load` clue at `(28,20)` belongs to the cargo rectangle above; reaching its face is sufficient to inspect it. Both markers use their stable interaction IDs and have a 1.7 m interaction range. Bespoke scale and sack artwork can replace these markers without changing mission logic.

| Room | Rectangle | Doors (center coordinates) |
| --- | --- | --- |
| Ration shed | `[6,17,6,6]` | `ration-west` `(5.5,20)`, `ration-south` `(9,22.5)`, `ration-east` `(11.5,20)` |
| Packing hall | `[14,8,11,10]` | `packing-west` `(13.5,13)`, `packing-south` `(19,17.5)`, `packing-east` `(24.5,13)`, `packing-north` `(19,7.5)` |
| Dispatch office | `[28,4,8,8]` | `dispatch-west` `(27.5,8)`, `dispatch-south` `(32,11.5)` |

West/east doors use `e` edges; north/south doors use `s` edges. Leaves swing inward and remain solid while open. The start chest is at `(4,22)`; guards start at `(13,20)`, `(21,12)`, and `(30,14)`.

## Save compatibility

Solo saves retain version 2 and add `solo.missionId`, `solo.objectives`, and `solo.inspected`. Missing mission IDs default to Night Ledger. Decoding preserves played coordinates, AP, terrain, doors, loot, units, and progress; it does not regenerate the map. The existing `solo.ledger` flag remains compatible.

Each operation owns a slot under `tactical-animal-operation-v3:<missionId>`. Before writing a different operation, an older single-slot save is preserved in its mission slot. Version 1 preparation/completion metadata uses the separate `tactical-animal-first-shift-v1` record. Browsing operations and changing loadouts never overwrite active states. Completion records do not gate either operation or create a campaign economy.

## Verification

`npm run check` includes original terrain/edge hashes and encounter, both legal Short Measure routes, both door orientations, all animal/primary combinations, objective/extraction gates, save round trips, legacy migration, independent save slots, application lifecycle handlers, minimap markers, and renderer disposal. Existing grenade, AP, chest, burst, and designer checks remain included. `npm run build` produces the static game.

Portrait browser QA uses the built game. Temporary, unshipped checkpoint controls load saves reached through the public simulation controller in `tests/operation-scenarios.mjs`; they never edit health, ammunition, AP, coordinates, doors, or quest flags to create checkpoints. Interaction and save/resume checks then run in the actual UI. Full simulation playthroughs independently cover both routes.
