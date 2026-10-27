import {test} from 'node:test';
import assert from 'node:assert/strict';
import {app} from './app-harness.mjs';

function contact(a) {
  a.s.engaged=true;
  a.s.phase='player';
  a.advance(3);
  assert.equal(a.s.phase,'player');
}

test('End Turn lights on contact, stays lit while guards act, and goes dark when combat breaks',()=>{
  const a=app(),button=a.el('end-turn');
  assert.equal(a.s.phase,'explore');
  assert.equal(button.dataset.lit,'false');
  assert.equal(button.disabled,true);
  contact(a);
  assert.equal(button.dataset.lit,'true');
  assert.equal(button.disabled,false);
  button.click();a.advance(3);
  assert.equal(a.s.phase,'enemy');
  assert.equal(button.dataset.lit,'true');
  assert.equal(button.disabled,true);
  assert.equal(button['aria-label'],'Guards are acting');
  a.s.phase='explore';a.s.engaged=false;
  for(const unit of a.s.units)if(unit.team==='guard')unit.alert=false;
  a.advance(3);
  assert.equal(a.s.phase,'explore');
  assert.equal(button.dataset.lit,'false');
  assert.equal(button.disabled,true);
});

test('the combat lamp stays on while grenade aiming disables End Turn and when AP is exhausted',()=>{
  const a=app(),button=a.el('end-turn');contact(a);
  a.el('grenade').click();
  assert.equal(a.view.aiming,true);
  assert.equal(button.disabled,true);
  assert.equal(button.dataset.lit,'true');
  a.el('cancel-grenade').click();a.u.ap=0;a.advance(3);
  assert.equal(a.s.phase,'player');
  assert.equal(button.dataset.lit,'true');
  assert.equal(button.disabled,false);
});

test('the skinned Zoom controls retain their direction and spend no action points',()=>{
  const a=app(),before={x:a.u.x,y:a.u.y,ap:a.u.ap,phase:a.s.phase};
  a.el('zoom-in').click();assert.equal(a.view.zoomFactor,.83);
  a.el('zoom-out').click();assert.equal(a.view.zoomFactor,.83*1.2);
  assert.deepEqual({x:a.u.x,y:a.u.y,ap:a.u.ap,phase:a.s.phase},before);
});
