import test from 'node:test';
import assert from 'node:assert/strict';
import {FieldView} from '../dist/field-view.js';
import {Raycaster,Vector3,Mesh,BoxGeometry,MeshBasicMaterial} from '../dist/aft/tactics/vendor/three.module.js';

test('a lower-floor object cannot steal a ground tap, while an object above that support remains selectable',()=>{
  const mesh=new Mesh(new BoxGeometry(1,1,1),new MeshBasicMaterial());mesh.userData.interactionId='native-door';
  const picks=[],view={state:{spatial:{}},actors:new Map(),art:{picks:[mesh]},ray:new Raycaster(new Vector3(0,5,0),new Vector3(0,-1,0)),floorController:{state:{selectedId:'coldwell-datum-17'}},ground:()=>new Vector3(0,0,0),onPick:p=>picks.push(p)};
  const tap=()=>{view.pointers=new Map([[1,{}]]);view.gesture={moved:false};FieldView.prototype.up.call(view,{pointerId:1,type:'pointerup'});};
  try{
    mesh.position.y=-2;mesh.updateMatrixWorld(true);tap();assert.deepEqual(picks.pop(),{x:0,y:0,h:0,floorId:'coldwell-datum-17'});
    mesh.position.y=1;mesh.updateMatrixWorld(true);tap();assert.deepEqual(picks.pop(),{interactionId:'native-door'});
  }finally{mesh.geometry.dispose();mesh.material.dispose();}
});
