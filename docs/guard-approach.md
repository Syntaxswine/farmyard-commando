# Guard approach

How an alert guard closes on an animal it cannot yet fire on, on every mission. The rule is `approachPath` and `enemyStep` in `sites/tactical-animal/dist/solo-game.js`. Its tests are in `sites/tactical-animal/tests/guard-approach.test.mjs`, and [`tools/guard-census.mjs`](../sites/tactical-animal/tools/guard-census.mjs) reproduces every census number below.

## The rule

A guard that cannot fire walks toward where it last saw or heard the animal, and stops 0.75 m short of it. It plans again every tick:

1. **Straight walk.** If it can walk straight to the spot 0.75 m short on its own line, and that spot sees the animal past the walls, it walks straight there. This is main's move, unchanged.
2. **Search.** Otherwise one A* search takes it to the nearest grid node, by walking distance, that stands within `QUARRY_REACH` (2 m) of the animal and sees it. From that node the straight walk usually opens.
3. **Sight with a margin.** A goal's line to the animal must clear every wall grown by 8 cm. That is `ARRIVED`, the distance at which a guard counts as arrived, so the view holds wherever the guard actually stops.
4. **Sealed pockets.** After 256 expansions without reaching a goal, the search floods back from the goals. If that flood runs dry within 128 nodes without meeting the guard's search, the animal is shut away and the search stops. This changes no outcome, only the cost.
5. **A route opening at the guard's feet.** When a route's first waypoint lies within 8 cm of the guard, it walks on to the next one instead of ending its turn there.

Nothing about the approach is held between ticks, so a resumed save plans exactly the same route.

**Why one goal set.** The goals depend on the animal alone, not on where the guard stands. A first version kept main's route to the 0.75 m spot whenever that spot saw the animal, and searched only otherwise. Beside the ration scale the spot sits on the edge of the scale's clearance, so it flipped between free and solid with each 18 cm step. The two plans ran east and west, and the guard walked back and forth on the spot.

**Why the margin.** In Short Measure, node (34, 12) sees an animal past a wall end by a hair. A guard stopping 6 cm off that node could not, and froze there.

## What main did

Main's guard aimed at the 0.75 m spot and ended its turn whenever no route reached it:
- the spot was inside a crate, a prop, a wall or a door leaf;
- the spot was boxed into a strip no route ends in, or cut off;
- the route opened within 8 cm of the guard.

It also walked to a spot on the far side of a wall from the animal and stood there blind. In every case its alert lapsed after three rounds. PR #21 patched props alone with three spots held per guard; walls and crates kept main's freeze on every mission.

## Censuses

One alert guard plays four rounds; every other guard is down. The animal stands 0.24–0.74 m from a random walk-blocking box (wall, crate, prop, chest or open leaf). The guard starts 2–9 m away at any bearing and heading, and doors are open in 70% of cases. Positions are checked against the doors as the case sets them, because an open leaf is solid.

- **Frozen:** the guard never fires, and its alert lapses.
- **Stalled:** a turn ends with AP left, no shot, no step and no sight of the animal.
- **Reachable:** the grid graph has a walk from the guard to a node with a wall-clear line to the animal within weapon range.

"Spot solid" keeps only the cases whose 0.75 m spot is solid; "any spot" keeps them all. Before is the PR #21 tip (13a9013). Each row is 300 approaches.

| Mission, cases | Seed | Engaged | Frozen | Stalled with a firing node reachable |
| --- | --- | --- | --- | --- |
| Night Ledger, spot solid | 1 / 2 | 49 → 229 / 57 → 243 | 251 → 71 / 243 → 57 | 251 → 0 / 243 → 0 |
| Night Ledger, any spot | 1 / 2 | 179 → 254 / 168 → 256 | 121 → 46 / 132 → 44 | 117 → 0 / 122 → 0 |
| Road Checkpoint, spot solid | 1 / 2 | 75 → 192 / 88 → 188 | 225 → 108 / 212 → 112 | 212 → 0 / 202 → 0 |
| Road Checkpoint, any spot | 1 / 2 | 194 → 244 / 200 → 246 | 106 → 56 / 100 → 54 | 95 → 0 / 92 → 0 |
| Short Measure, spot solid | 1 / 2 | 60 → 229 / 57 → 222 | 240 → 71 / 243 → 78 | 184 → 0 / 177 → 0 |
| Short Measure, any spot | 1 / 2 | 169 → 248 / 170 → 248 | 131 → 52 / 130 → 52 | 84 → 0 / 82 → 0 |

The guards that still freeze fall into two groups:
- **The animal is shut away,** behind closed doors or in a pocket no route reaches. The guard stalls, correctly.
- **The route is longer than the alert lasts.** These are door detours: the guard walks its full 3.5 m every round and its alert lapses on the way. In 8 of the 3,600 approaches a firing node lay within a 10 m walk. The guard heads for the animal, not for the nearest spot it could shoot from.

No guard turned back on its own steps more than three times in any approach.

Where both versions engage, they engage alike. Shots fired match within one in every census (675 against 674 in Night Ledger, any spot, seed 1), and only one approach in 3,600 engaged before and not now. In that Night Ledger case both guards walk the same route; the new one stops 0.2 m further on, where a wall corner hides the animal, a round before it would fire.

**Beside the Short Measure props,** PR #21's own censuses count the approaches where the pre-prop main (fb386a5) engaged and the props version does not. That figure is now 1 of 1,000 on the tuning seed (PR #21: 2) and 2 of 800 on the held-out seed (PR #21: 9). [Short Measure in play](short-measure-runtime.md#environment-art-in-play) explains the three.

## How play changes

- **Straight approaches are unchanged:** the same move to the same spot.
- **Routed approaches change.** A routed approach now heads for the nearest node that sees the animal, where main headed for its 0.75 m spot; from there it walks straight to that spot. The guard ends in the same place by a different route, or reaches the animal where main froze.
- **Seeded random play diverges** from the PR #21 tip, always at the end of a turn. A lockstep fuzz of 8 seeds × 300 commands diverged in 7 of 8 Night Ledger runs (between commands 8 and 106), 3 of 8 Road Checkpoint runs and 4 of 8 Short Measure runs. `tests/scenery-neutrality-baseline.json` is re-recorded from this change.

## Cost

Guards plan every tick, so consecutive searches ask the same questions about the same nodes. Scenery alone decides whether a grid node is clear and whether a straight walk to a neighbouring node is. Those answers live in one table per geometry (`sceneryGrid`: a byte per node and per direction, 0.5 MB on the 240 × 240 sector). A door changing rebuilds the geometry and so starts a fresh table. Units are checked on every call. The table changes no result (lockstep fuzz, 3 missions × 8 seeds × 300 commands).

Wall clock, desktop, each version in its own process, census "any spot", seed 1:

| Census | PR #21 tip p99 / p999 / max (ms) | Now |
| --- | --- | --- |
| Night Ledger | 0.58 / 1.41 / 2.9 | 0.58 / 1.13 / 5.9 |
| Road Checkpoint | 0.24 / 3.75 / 65.4 | 2.60 / 4.50 / 8.4 |
| Short Measure | 0.34 / 3.33 / 4.8 | 0.33 / 1.11 / 2.8 |
| PR #21's prop census, 1,000 approaches | 0.88 / 13.02 / 18.5 | 0.28 / 1.07 / 2.5 |

On Road Checkpoint the p99 stays higher because far more guards now walk: 4,857 ticks with a step, against 577. A step costs about what main's did (p99 4.2 ms, against 4.6–5.3). What is left per tick is mostly the A*'s own bookkeeping (string keys, maps, the heap) and route smoothing; those are the next costs to take if phones stutter.

## Re-running

From the repository root, with another checkout to compare against:

```text
node sites/tactical-animal/tools/guard-census.mjs night-ledger near 1 300 before=../other-checkout after=.
node sites/tactical-animal/tools/guard-census.mjs short-measure props 77 250 after=. main=../pre-prop-checkout
```

Modes are `blocked` (the spot solid), `near` (any spot) and `props` (PR #21's census beside the Short Measure props). The first checkout named places the cases and runs the reachability check. `ROWS=1` prints every frozen case.
