# Tactical Animal

A portrait mobile browser prototype of the single-character Animal Factory Tactics idea. Pick one of the six original quickplay animals, choose an independent primary weapon, sidearm and utility, and retrieve the wage ledger from a small factory compound.

Free exploration transitions to player and guard turns when contact begins. Movement uses continuous world coordinates: AP pays for the actual distance accepted by collision, including diagonals and wall slides. The animal can stop anywhere. Initial tuning is 2 AP/m walking, 1 AP/m running and 3 AP/m sneaking; kneeling doubles those costs and prone multiplies them by four. Running and sneaking also affect speed and stamina.

The portrait controls follow the supplied sketch: zoom arrows at upper left, an expandable map at upper right, a lower central thumbstick, movement and stance controls at lower left, and End Turn directly above Menu at lower right. Health/AP stays visible. The menu holds inventory, weapon swapping, reloads, treatment, mission details, recent events and detailed combat actions. Tap visible guards to open their aiming and firing options in the menu. Tap ground to travel there; during combat, confirm the route and its distance/AP estimate in the menu. WASD and arrow keys also move; Space ends the turn.

## Run and check

Node.js 22+ is sufficient. No package installation or build step is needed.

```sh
npm run serve
npm run check
npm run build
```

Open `http://127.0.0.1:4495`. The preview server retires after 30 minutes and also honors `artifacts/preview/STOP`.

The checks cover every animal/primary combination, fractional positions, distance/AP accounting, diagonal equivalence, collision and tunnelling, path smoothing, contact, finite ammunition, treatment, save/resume, turn ownership, and a complete legal mission through extraction.

## Source and scope

Application code is in `sites/tactical-animal/dist/`. Original Animal Factory Tactics assets and reusable modules are isolated in its `aft/` directory. `sites/tactical-animal/aft-provenance.json` records the original revision and SHA-256 of each imported file. `snapshot-aft.mjs` deliberately reads the original checkout without modifying it. Weapon numbers, character profiles, statistics, species sight lobes, meshes, paint and equipment rigs come from that snapshot. Three.js retains its embedded license.

The solo simulation, swept-disc collision, continuous navigation, mission rules, AI and touch controls are new. A raster accelerates scenery and fog; pathfinder waypoints are smoothed into continuous routes. Combat includes line of sight, directional cover, aiming costs, bursts, limited ammunition, explosives and a simple flame cone. Field dressings are a solo-specific adaptation: two uses, +35 HP, 3 AP in combat.

This first slice has one mission, three guards, local device saves, and provisional metre-based weapon ranges. Body-zone modifiers currently change accuracy/damage; detailed limb injuries, disarming, original campaign logistics, multi-level traversal, persistent fire and advanced original AI remain future work. This is a browser prototype; native mobile packaging and physical-device performance have not been verified.

Sites hosting is owner-private. `npm run build` copies the authored static application to the ignored root `dist/` directory required by the hosting packager. The root `.openai/hosting.json` points at that output. The local server is disposable and is stopped after verification; the deployed version does not need it.
