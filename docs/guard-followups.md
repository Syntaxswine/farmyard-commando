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
