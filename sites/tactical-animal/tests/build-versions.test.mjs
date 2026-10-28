import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {versionedModules,versionImports} from '../tools/module-versions.mjs';

// build.mjs itself, run on a five-file stand-in project: the real game would copy 540 MB.
test('build.mjs versions mission art and dynamic imports with the application, and leaves aft/ alone',()=>{
  const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'fc-build-')),source=path.join(workspace,'sites/tactical-animal/dist');
  const write=(file,text)=>{fs.mkdirSync(path.dirname(path.join(source,file)),{recursive:true});fs.writeFileSync(path.join(source,file),text);};
  write('app.js',"import {table} from './mission-art/kit/solids.js';import * as T from './aft/three.js';export const later=()=>import('./view.js');");
  write('view.js','export const view=1;');
  write('mission-art/kit/solids.js',"import * as T from '../../aft/three.js';import {m} from './manifest.js';export const table=[];");
  write('mission-art/kit/manifest.js','export const m=1;');
  write('aft/three.js','export const three=1;');
  try{
    execFileSync(process.execPath,[path.resolve('sites/tactical-animal/tools/build.mjs')],{cwd:workspace,stdio:'pipe'});
    const built=file=>fs.readFileSync(path.join(workspace,'dist',file),'utf8');
    const version=/solids\.js\?v=([0-9a-f]{12})'/.exec(built('app.js'))?.[1];
    assert.ok(version,'app.js imports the versioned solid table');
    assert.ok(built('app.js').includes(`import('./view.js?v=${version}')`)&&built('app.js').includes("from './aft/three.js'"));
    assert.ok(built('mission-art/kit/solids.js').includes(`from './manifest.js?v=${version}'`)&&built('mission-art/kit/solids.js').includes("from '../../aft/three.js'"));
  }finally{fs.rmSync(workspace,{recursive:true,force:true});}
});

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
