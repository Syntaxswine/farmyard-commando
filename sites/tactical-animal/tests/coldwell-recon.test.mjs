import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('Coldwell Recon legally inspects the clue, fights only as needed, recovers B5 records and extracts',()=>{
  // Full-source CPU collision/fog sweeps, not a simulated gameplay time limit.
  execFileSync(process.execPath,[fileURLToPath(new URL('../tools/check-coldwell-recon.mjs',import.meta.url))],{timeout:900000,maxBuffer:512*1024,stdio:['ignore','pipe','pipe']});
});
