import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {versionedModules,versionImports} from '../tools/module-versions.mjs';

// A returning phone must never pair new rules with a cached solid table or kit,
// and every importer must keep sharing one three.js instance.
test('mission art shares the application version; the pinned aft/ and designer/ trees keep exact URLs',()=>{
  const versioned=versionedModules(path.resolve('sites/tactical-animal/dist')),set=new Set(versioned);
  for(const file of ['solo-game.js','mission-scenery.js','mission-art-view.js','mission-art/short-measure/solids.js','mission-art/short-measure/kit.js','mission-art/short-measure/manifest.js'])assert.ok(set.has(file),file);
  assert.deepEqual(versioned.filter(file=>/^(aft|designer)\//.test(file)),[]);
  assert.equal(versionImports("import {S} from './mission-art/short-measure/solids.js';import * as T from './aft/tactics/vendor/three.module.js';",'mission-scenery.js',set,'V'),
    "import {S} from './mission-art/short-measure/solids.js?v=V';import * as T from './aft/tactics/vendor/three.module.js';");
  assert.equal(versionImports("import {P} from './manifest.js';import * as T from '../../aft/tactics/vendor/three.module.js';",'mission-art/short-measure/kit.js',set,'V'),
    "import {P} from './manifest.js?v=V';import * as T from '../../aft/tactics/vendor/three.module.js';");
  assert.equal(versionImports("return import('./mission-art-view.js')",'field-view.js',set,'V'),"return import('./mission-art-view.js?v=V')");
  assert.equal(versionImports("import x from './not-a-module.js'",'field-view.js',set,'V'),"import x from './not-a-module.js'");
});
