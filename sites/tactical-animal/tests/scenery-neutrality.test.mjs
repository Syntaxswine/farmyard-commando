import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as game from '../dist/solo-game.js';
import {fuzzRun} from './neutral-fuzz.mjs';

// The Short Measure art changes its own props and nothing else. These runs were
// recorded from an unmodified origin/main checkout; seeds were picked where a
// guard fallback widened beyond props diverged within 44 commands. It samples
// play rather than proving neutrality: a global cover-radius change (0.9 -> 0.8 m)
// first shows at Night Ledger seed 8, command 188, so that run is 200 long.
test('away from the Short Measure props, seeded play matches the origin/main baseline after every command',()=>{
  const baseline=JSON.parse(fs.readFileSync(new URL('./scenery-neutrality-baseline.json',import.meta.url),'utf8'));
  assert.equal(baseline.rows.length,6);
  for(const row of baseline.rows)assert.equal(fuzzRun(game,row.missionId,row.seed,row.steps),row.hash,`${row.missionId} seed ${row.seed}`);
});
