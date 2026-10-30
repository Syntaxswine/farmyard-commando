# Guard follow-ups

These changes are stacked on Coldwell runtime `783f45b` (PR #28). The source
pack, artwork and frozen AFT/editor copies are unchanged.

## Selected shot location

Firearm previews call the same `confirmedImpact` query used by accepted rounds.
The displayed percentage is a chance to hit the selected target: a solid or
intervening body yields 0% and disables that shot. Partial cover still permits
perception. An intact pane is a legal deliberate breach with 0% first-round
target chance and an explicit warning; the normal aim roll still determines
whether the round hits the pane, and later burst rounds query the new opening.
Area weapons and deliberate point/window shots keep their own policies.

Guards prefer exposed torso, head, legs, then weapon. This small policy is adapted
from `enemyTurn`/`fleeTurn` in the original Animal Factory Tactics 3D
`game/dist/tactics/core/engine.js`; source SHA-256:
`6c05dd9a65999e0914650d6b8ffdd7edacb9fa4712f6f7ad8d05fe9e5dff8584`.
No donor engine is imported or modified. Glass is a fallback after exposed zones.
Shot receipts include the chosen zone. The census firing-node oracle now checks
physical first impact at those zones instead of a perception-only ray.

Focused regression command (repository root):

```
node --test sites/tactical-animal/tests/shot-exposure.test.mjs sites/tactical-animal/tests/targeting-monitor.test.mjs sites/tactical-animal/tests/guard-approach.test.mjs sites/tactical-animal/tests/window-integration.test.mjs
```

The fixture uses the unchanged shipping-manifest desk and the reported 0.92 m
crate. For each blocked standing torso, 200 rejected attempts spend no ammo, AP
or RNG; all four zones are compared with actual impact for standing and kneeling
shooters. A seed-0 guard chooses the exposed head (its low-probability misses are
normal); seed 2048 proves an accepted head roll reaches the body. Existing window
tests prove direct frame targeting and pane-break/burst behavior. The approach
suite runs seed 3, 40 blocked approaches on each of three missions.

Intentional replay changes: guards may now shoot a different exposed zone, with
that zone's accuracy and damage, or reposition when no body zone is exposed.
Blocked player shots no longer spend AP/ammo/RNG. Historical census totals from
earlier revisions have not been rerun and are not claimed here.

## Player narrow passages

Flat player navigation shares `searchStarts` with guards. If no grid node is a
straight walk away, its bounded 32-bearing scan supplies costed escape points.
Reconstruction retains the selected escape via before legal smoothing and the
exact clicked endpoint. Live bodies and ordinary movement/AP/save rules still
apply. Normal starts keep their existing route and tie order. Regression command:
`node --test sites/tactical-animal/tests/player-strip.test.mjs`.

## Friendly blockers

An alert guard with no route can ask one later, higher-ID ally to yield. At most
four candidate allies and 48 standing points each are considered; each hypothetical
search expands at most 1024 flat nodes (128 native nodes), and a hypothetical
route must become legal with that ally standing at the yield point. Source
geometry is shared, live bodies are checked anew. A trapped actor with no legal
10 cm start among 32 bearings makes no remote request. The low-ID priority avoids
reciprocal requests. Each guard requests at most once per round.

The blocker yields in its own turn through ordinary `travel`, paying actual AP
and stamina, for at most one second. The waiter gets one retry with its remaining
AP after that turn. Failed or expired requests clear at round end. Pending point,
elapsed time, ownership and retry state are saved and validated. No body is
teleported or omitted from actual movement. The Road Checkpoint doorway, two-way
contention, pending-save replay and five-guard sealed ring are covered by
`node --test sites/tactical-animal/tests/guard-coordination.test.mjs`.

## Alert, search and return

The same AFT source named above supplies the small state-machine policy:
`GUARD_STATES`, `settleRound`, `searchCells`, `searchGoal`, and
`stepInvestigation`/`settle`. This adaptation keeps rest, alert, searching and
standdown, without importing social, campaign or personality machinery.

Three unseen rounds start a search of the last observed point and up to four
reachable local report cells. Exploration counts one unseen interval per three
seconds, so an alert outside combat also progresses. Searches sweep briefly at
each point and stop after at most 18 active seconds. Return to the authored post
uses a bounded route and restores its heading; three failed attempts or 12 active
seconds settle safely where the guard stands. Direct sight interrupts either
state. Hidden live hero coordinates are never a navigation fallback.

Investigation paths expand at most 128 nodes; exploration admits at most two new
plans per tick. Movement uses normal collision, stance, stamina and (during
combat) AP. Search cells, elapsed times, sweep, retry waits, route and authored
post survive saves. Existing pursuit-position tests now stop after two unseen
rounds; the third intentionally begins investigation. Dedicated transition,
exploration, blocked-return, hidden-hero and mid-search replay coverage:
`node --test sites/tactical-animal/tests/guard-awareness.test.mjs`.

## Contact reports and sound

The AFT `shout`/last-known report policy is adapted to the solo simulation.
Each firsthand sighting records its point, target, original observer, simulation
time and round. A friendly discharge relays a usable hostile snapshot, retaining
those original fields and recording only its forwarding guard. A listener keeps
newer information, and its equally fresh firsthand observation wins. Forwarding
does not create a sighting or reset its age. Reports expire after three unseen
rounds or nine simulation seconds; old report records remain historical data.

Player/unknown shots and friendly shots without a usable hostile fix supply only
the audible shooter's point. Listeners without stronger contact information enter
the AFT suspicious state and investigate that sound before returning. Hearing is
not permission to fire through cover. Firearm, directional flame and grenade
hooks share this policy and retain their previous hearing radii. A guard never
overwrites its own hostile fix with its own gun's location.

Tests cover real combat hooks, relay chains, stale reports, newer firsthand fixes,
audible radii, save validation, and native floor/height preservation. The native
provider also checks every selected body zone against actual partial-height
chest/capsule impact. Commands:

```
node --test sites/tactical-animal/tests/guard-reports.test.mjs sites/tactical-animal/tests/guard-awareness.test.mjs sites/tactical-animal/tests/flame-aim.test.mjs sites/tactical-animal/tests/shot-exposure.test.mjs
node --test sites/tactical-animal/tests/coldwell-gameplay.test.mjs
```

These passed 22 focused checks (including all 54 flame gameplay comparisons) and
15 full-provider gameplay checks. Friendly report metadata and guard state/post
fields intentionally change serialized replay hashes from the first command;
later decision changes follow the explicit policies above, rather than a scenery
or source-art change.
