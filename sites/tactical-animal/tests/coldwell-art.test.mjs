import test from 'node:test';
import assert from 'node:assert/strict';
import {COLDWELL_METRICS,toCanonical,toThree,canonicalBounds,intersects,normalizeVisibleRegion,nearbyHeightBand} from '../dist/art/coldwell/contract.js';
test('Coldwell source frames convert once to canonical metres',()=>{
 assert.deepEqual(toCanonical('silo',[111,0,18]),{x:149.5,y:103.5,h:46.64});
 assert.deepEqual(toCanonical('site',[104,0,190]),{x:104.5,y:190.5,h:46.64});
 assert.deepEqual(toCanonical('canonical',{x:73.5,y:118,h:46.64}),{x:73.5,y:118,h:46.64});
 assert.equal(toCanonical('silo',[0,-46.64,0]).h,0);assert.deepEqual(toThree({x:73.5,y:118,h:46.64}),[73.5,46.64,118]);
 assert.equal(COLDWELL_METRICS.supportRoof,48.76);assert.throws(()=>toCanonical('unknown',[0,0,0]));
});
test('Coldwell residency uses whole bounds and canonical height bands',()=>{
 const b=canonicalBounds('silo',{min:[100,-10.6,10],max:[120,-8.48,30]}),v=normalizeVisibleRegion({rect:{x:140,y:100,w:24,h:24},heightBands:[{min:35,max:38}],cutaway:{roofs:false}});
 assert.equal(intersects(b,v.rect,v.heightBands),true);assert.equal(intersects(b,v.rect,[{min:1,max:2}]),false);assert.equal(v.cutaway.roofs,false);assert.equal(v.cutaway.canopies,true);
 assert.throws(()=>normalizeVisibleRegion({rect:v.rect,heightBands:[]}));assert.throws(()=>normalizeVisibleRegion({...v,cutaway:{plane:{normal:[0,0,0],constant:0}}}));
 assert.equal(nearbyHeightBand(36.04).length,1);assert.deepEqual(nearbyHeightBand(0,{below:0,above:0}),[{min:-.12,max:2.12}]);
});
