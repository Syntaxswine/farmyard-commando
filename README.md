# Farmyard Commando

**[Play Farmyard Commando](https://syntaxswine.github.io/farmyard-commando/)** in your browser. No installation or sign-in required. Designed for portrait mobile play; desktop controls are included.

A portrait mobile browser prototype of the single-character Animal Factory Tactics idea. Pick one of the six original quickplay animals, choose an independent primary weapon, sidearm and utility, and retrieve the wage ledger from a small factory compound.

The title screen offers **Play Game** and **Map Designer**. Play opens the existing animal/loadout screen; the battlefield Options menu can save the operation and return to the title screen. The map designer is the standalone Animal Factory Tactics 3D editor, with its original tools, floor controls, undo/redo, named browser saves, reusable blocks, sector presets, JSON import/export, and editor playtesting. Its Farmyard Commando link returns to the title screen, with the original unsaved-edit prompt still active.

Designer maps retain the original AFT format and use the imported AFT playtest runtime. They do not replace the solo game's fixed mission. Browser design saves, playtest saves, settings, overmap sketches, and map-folder handles use separate Farmyard storage names. Export JSON to transfer designs between games, devices, or website origins. The original editor's desktop layout is retained.

Free exploration transitions to player and guard turns when contact begins. Movement uses continuous world coordinates: AP pays for the actual distance accepted by collision, including diagonals and wall slides. The animal can stop anywhere. Initial tuning is 2 AP/m walking, 1 AP/m running and 3 AP/m sneaking; kneeling doubles those costs and prone multiplies them by four. Standing movement is 3.6 m/s walking, 7.2 m/s running and 1.8 m/s sneaking; kneeling halves those speeds and prone quarters them. Running and sneaking also affect stamina.

The portrait controls follow the supplied sketch: zoom arrows at upper left, an expandable map at upper right, a lower central thumbstick, square controls at lower left, and three square buttons at lower right: End Turn, Grenade, Options. One stance button bounces standing → kneeling → prone → kneeling → standing. One movement button bounces run ↔ off / walk ↔ sneak. Both switches are free, including at zero AP. Hold either button for an expanded horizontal menu with large direct choices; keyboard users can press the down arrow on the focused button. Movement still costs AP by distance and posture.

Choose frag grenades in the loadout to carry three. Tap Grenade (keyboard: G) to give the joystick to aiming and stop the animal. Stick direction aims the throw; displacement sets its distance, up to 10 m at full displacement in every direction. The preview shows the flight arc, landing point, and 5 m blast radius. The filled footprint shows exposed explored ground; the outline is the maximum radius, and walls protect areas outside the fill. Camera framing follows the preview without rotating or changing fog of war. Release the stick to hold the last aim, then tap Throw; Cancel or Escape exits without spending resources. W A S D or arrows adjust keyboard aim gradually, release holds it, and Enter throws. Ground taps, movement switches, and End Turn cannot accidentally move the animal or spend AP while aiming.

Grenades cost 5 AP, reduced to exactly 2.5 AP while a pistol or SMG is equipped. Carrying a stowed pistol does not reduce the cost. A confirmed throw uses one grenade, keeps the current weapon equipped and consumes none of its ammunition; there is no extra weapon-swap charge. The arc can clear low walls and crates, but throws that hit an obstacle or land inside one are invalid. Invalid or unexplored landing points disable Throw. The preview warns when the animal is exposed to its own blast. The camera holds the throw briefly before returning to the animal and restoring the prior zoom.

The eye above movement displays the number of currently visible living opponents. Each tap centers and follows the next opponent, starting with nearby clear contacts, with sight acuity and cover informing the order. After the final, farthest or hardest-to-see contact, the next tap recenters on the animal; another tap starts again at the first opponent. There is no separate Recenter button. With no visible opponents, the eye still recenters after panning. Camera inspection costs no AP and does not turn, target or attack with the animal. Pan or move to leave inspection; losing sight of a focused opponent returns the camera to the animal.

Health/AP stays visible. The lower-right menu holds inventory, weapon swapping, reloads, treatment, mission details, recent events and detailed combat actions. Tap visible guards to open their aiming and firing options in the menu. Tap ground to travel there; during combat, confirm the route and its distance/AP estimate in the menu. WASD and arrow keys also move; Space ends the turn.

## Run and check

Node.js 22+ is sufficient. No package installation or build step is needed.

```sh
npm run serve
npm run check
npm run build
```

Open `http://127.0.0.1:4495`. The preview server retires after 30 minutes and also honors `artifacts/preview/STOP`.

The checks cover every animal/primary combination, fractional positions, distance/AP accounting, diagonal equivalence, collision and tunnelling, path smoothing, contact, finite ammunition, treatment, save/resume, free stance switching, back-and-forth cycles, opponent visibility/order, grenade joystick range/dead zone/held aim, keyboard aiming, camera framing, AP discounts and stock, flight obstructions, blast damage and wall protection, turn ownership, and a complete legal mission through extraction.

## Source and scope

Application code is in `sites/tactical-animal/dist/`. Original Animal Factory Tactics assets and reusable modules are isolated in its `aft/` directory. `sites/tactical-animal/aft-provenance.json` records the original revision and SHA-256 of each imported file. `snapshot-aft.mjs` deliberately reads the original checkout without modifying it. Weapon numbers, character profiles, statistics, species sight lobes, meshes, paint and equipment rigs come from that snapshot. Three.js retains its embedded license.

The separate 3D designer is in the versioned `designer/` directory. `sites/tactical-animal/designer-provenance.json` records its entry point, original revision, source hashes, installed hashes, and small navigation/storage adaptations. `snapshot-designer.mjs <original-dist-directory>` rebuilds that import without modifying the original checkout; `--dry-run` reports the dependency closure without writing. Only the editor, overmap/library, playtest dependencies, runtime assets, and bundled map presets are included. `npm run check` verifies every imported file and its module links, and exercises original map/block editing and export compatibility.

The solo simulation, swept-disc collision, continuous navigation, mission rules, AI and touch controls are new. A raster accelerates scenery and fog; pathfinder waypoints are smoothed into continuous routes. Combat includes line of sight, directional cover, aiming costs, bursts, limited ammunition, explosives and a simple flame cone. Field dressings are a solo-specific adaptation: two uses, +35 HP, 3 AP in combat.

This first slice has one mission, three guards, local device saves, and provisional metre-based weapon ranges. Body-zone modifiers currently change accuracy/damage; detailed limb injuries, disarming, original campaign logistics, multi-level traversal, persistent fire and advanced original AI remain future work. This is a browser prototype; native mobile packaging and physical-device performance have not been verified.

## Publishing

The public repository is [Syntaxswine/farmyard-commando](https://github.com/Syntaxswine/farmyard-commando). Pushes to `main` run the game checks, build the static output and deploy to GitHub Pages through [.github/workflows/pages.yml](.github/workflows/pages.yml). The workflow uses GitHub's built-in deployment token; no personal token is stored in the repository. It can also be run manually from the Actions tab.

`npm run build` copies the authored static application to the ignored root `dist/` directory. Asset and module URLs are relative, so the game works under the `/farmyard-commando/` Pages path. The existing owner-private Sites preview retains its `.openai/hosting.json` configuration and points at the same build output. Local preview servers are disposable and stop after verification; the published game does not need them.
