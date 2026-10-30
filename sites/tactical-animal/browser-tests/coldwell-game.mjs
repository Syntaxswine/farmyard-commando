import {expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const snapshot=page=>page.evaluate(()=>window.__coldwellGame.snapshot());
async function loaded(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect(page.locator('#loading')).toBeHidden({timeout:60000});await page.evaluate(()=>window.__coldwellGame.whenIdle());await expect.poll(async()=>(await snapshot(page)).pendingActors).toBe(0);expect((await snapshot(page)).failed).toEqual([]);}
async function clickWorld(page,point){const p=await page.evaluate(point=>window.__coldwellGame.project(point),point);expect(p.visible).toBe(true);await page.touchscreen.tap(p.x,p.y);}
async function seed(page,id,text){await page.addInitScript(({id,text})=>localStorage.setItem('tactical-animal-operation-v3:'+id,text),{id,text});}

// Real game UI, real shaders and public-command save checkpoints. No simulation
// state setter, renderer substitute or post-load position change is available.
export async function checkColdwellGame(context,{root,origin,output,report,observe,shot,scenario='all'}){
  report.gameViews=[];
  const fixtures=JSON.parse(await fs.readFile(path.join(root,'artifacts/window-browser/coldwell-checkpoints.json'),'utf8'));expect(fixtures.result.passed).toBe(true);expect(fixtures.fullyPlayed).toBe(true);expect(fixtures.sourceHead).toBe(report.testedSha);report.playedRoute=fixtures.result;
  if(scenario==='gatehouse'||scenario==='all'){
  const game=await context.newPage();observe(game,'actual-coldwell-game',report);
  await seed(game,'coldwell-traversal',fixtures.states['quiet-gatehouse']);await game.goto(origin+'/game.html?coldwellTest=traversal');await expect(game.locator('#resume')).toBeVisible();await game.locator('#resume').click();await loaded(game);
  expect((await snapshot(game)).hero.floorId).toBe('coldwell-datum-22');expect((await snapshot(game)).actors).toBeGreaterThan(0);await shot(game,'game-gatehouse');report.gameViews.push({id:'gatehouse',...await snapshot(game)});
  await clickWorld(game,{x:94.5,y:142,h:47.3});await expect(game.locator('#interaction-label')).toHaveText('Open');await game.locator('#interaction-hand').tap();await expect.poll(async()=>(await snapshot(game)).spatial.poses['surface-door:s:94:141'],{timeout:60000}).toBe(90);await shot(game,'game-door-open');
  const before=await snapshot(game);expect(before.hero.weapon).toBe('flamethrower');await game.locator('#grenade').click();await expect(game.locator('#flame-aim')).toBeVisible();await expect.poll(async()=>(await game.evaluate(()=>window.__windowNativeProbe.snapshot())).shaders.some(s=>s.nativeCone&&s.stage==='fragment')).toBe(true);await shot(game,'game-flame-cone');
  await game.locator('#grenade').click();await expect.poll(async()=>(await snapshot(game)).hero.ammo.flamethrower).toBe(before.hero.ammo.flamethrower-1);await expect.poll(async()=>(await game.evaluate(()=>window.__windowNativeProbe.snapshot())).shaders.some(s=>s.nativeFlame&&s.stage==='fragment'),{timeout:60000}).toBe(true);await shot(game,'game-flame-discharge');await expect.poll(async()=>(await snapshot(game)).effects.flame,{timeout:30000}).toBe(0);
  await game.locator('#grenade').press('ArrowDown');await game.locator('#control-choices').getByRole('button',{name:/^Grenade ·/}).click();await game.locator('#grenade').click();const stick=await game.locator('#joystick').boundingBox(),cx=stick.x+stick.width/2,cy=stick.y+stick.height/2;await game.mouse.move(cx,cy);await game.mouse.down();await game.mouse.move(cx,cy+60,{steps:6});await game.mouse.up();await expect(game.locator('#grenade')).toHaveAttribute('data-ready','true');await shot(game,'game-grenade-arc');await game.locator('#cancel-grenade').click();expect((await snapshot(game)).hero.ammo.grenade).toBe(before.hero.ammo.grenade);
  report.gameWeaponProbe=await game.evaluate(()=>window.__windowNativeProbe.snapshot());expect(report.gameWeaponProbe.shaders.filter(s=>!s.ok)).toEqual([]);expect(report.gameWeaponProbe.links.filter(s=>!s.ok)).toEqual([]);
  await game.locator('#menu').click();await game.getByRole('button',{name:'Choose operation, animal & loadout',exact:true}).click();await game.locator('#resume').click();await loaded(game);expect((await snapshot(game)).spatial.poses['surface-door:s:94:141']).toBe(90);
  await game.close();
  }

  if(scenario==='stairs'||scenario==='all'){
  const stairs=await context.newPage();observe(stairs,'actual-coldwell-stairs',report);await seed(stairs,'coldwell-traversal',fixtures.states['quiet-portal']);await stairs.goto(origin+'/game.html?coldwellTest=traversal');await stairs.locator('#resume').click();await loaded(stairs);
  await stairs.locator('[data-floor-id="coldwell-datum-21"]').click();await loaded(stairs);const inspection=await snapshot(stairs);expect(inspection.hero.floorId).toBe('coldwell-datum-22');expect(inspection.actors).toBe(0);report.floorInspection=inspection;await shot(stairs,'game-inspect-b1');await clickWorld(stairs,{x:72,y:114.1,h:44.52});
  await expect.poll(async()=>{const d=await snapshot(stairs);return d.hero.floorId==='coldwell-datum-21'&&Math.abs(d.hero.h-44.52)<.03&&d.queue.length===0;},{timeout:60000}).toBe(true);await loaded(stairs);await shot(stairs,'game-b1-arrival');report.gameViews.push({id:'b1',...await snapshot(stairs)});
  const stairProbe=await stairs.evaluate(()=>window.__windowNativeProbe.snapshot());expect(stairProbe.shaders.some(s=>s.heightFog&&s.standard&&s.stage==='fragment')).toBe(true);expect(stairProbe.shaders.filter(s=>!s.ok)).toEqual([]);expect(stairProbe.links.filter(s=>!s.ok)).toEqual([]);report.gameProbe=stairProbe;
  await stairs.setViewportSize({width:390,height:844});expect(await stairs.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await shot(stairs,'game-phone-b1');await stairs.close();
  }

  if(scenario==='records'||scenario==='all'){
  const loot=await context.newPage();observe(loot,'actual-coldwell-records',report);await loot.setViewportSize({width:390,height:844});await seed(loot,'coldwell-recon',fixtures.states['recon-records']);await loot.goto(origin+'/game.html?coldwellTest=recon');await loot.locator('#resume').click();await loaded(loot);
  for(let attempt=0;attempt<3;attempt++){
    const d=await snapshot(loot);if(d.phase==='enemy'||d.hero.ap<3){if(d.phase==='player')await loot.locator('#end-turn').tap();await expect.poll(async()=>(await snapshot(loot)).phase,{timeout:60000}).not.toBe('enemy');continue;}break;
  }
  await expect(loot.locator('#interaction-label')).toHaveText('Open');await loot.locator('#interaction-hand').tap();await expect(loot.getByRole('button',{name:/Take all/})).toBeVisible();await shot(loot,'game-phone-records-chest');await loot.getByRole('button',{name:/Take all/}).tap();await expect.poll(async()=>(await snapshot(loot)).objectives['coldwell-records']).toBe(true);report.gameViews.push({id:'records-taken',...await snapshot(loot)});
  await loot.getByRole('button',{name:'Return to operation',exact:true}).click();await loot.locator('#menu').click();await loot.getByRole('button',{name:'Choose operation, animal & loadout',exact:true}).click();await loot.locator('#resume').click();await loaded(loot);expect((await snapshot(loot)).objectives['coldwell-records']).toBe(true);await shot(loot,'game-phone-records-restored');await loot.close();
  }
  if(scenario==='navigation'||scenario==='all'){
    const page=await context.newPage();observe(page,'actual-coldwell-deep-navigation',report);
    await seed(page,'coldwell-traversal',fixtures.states['quiet-portal']);await page.goto(origin+'/game.html?coldwellTest=traversal');await page.locator('#resume').click();await loaded(page);
    for(let i=0;i<5;i++)await page.keyboard.press('PageDown');await loaded(page);expect((await snapshot(page)).floor).toBe('coldwell-datum-17');
    await page.evaluate(()=>{
      window.__navigationInput=[];let input;
      addEventListener('pointerdown',event=>{if(event.target.closest('#joystick'))input={before:window.__coldwellGame.snapshot().navigation,at:performance.now()};},true);
      addEventListener('pointerdown',event=>{if(event.target.closest('#joystick')&&input)window.__navigationInput.push({before:input.before,after:window.__coldwellGame.snapshot().navigation,handlerMs:performance.now()-input.at});});
    });
    const before=await snapshot(page),destination={x:72,y:114.1,h:36.04},stick=await page.locator('#joystick').boundingBox();
    await clickWorld(page,destination);await page.touchscreen.tap(stick.x+stick.width/2,stick.y+stick.height/2);
    await expect.poll(async()=>(await snapshot(page)).navigation.status).toBe('cancelled');
    const cancelled=await snapshot(page),inputs=await page.evaluate(()=>window.__navigationInput);expect(inputs.length).toBe(1);expect(inputs[0].before.pending).toBe(true);expect(inputs[0].after.pending).toBe(false);expect(inputs[0].handlerMs).toBeLessThan(250);expect(cancelled.navigation.worker).toBe(false);expect(cancelled.queue).toEqual([]);expect(cancelled.hero.x).toBe(before.hero.x);expect(cancelled.hero.y).toBe(before.hero.y);expect(cancelled.hero.h).toBe(before.hero.h);expect(cancelled.hero.ap).toBe(before.hero.ap);expect(cancelled.hero.ammo).toEqual(before.hero.ammo);
    report.navigationCancellation={inputs,before,cancelled};await loaded(page);await shot(page,'game-deep-route-cancelled');
    for(let i=0;i<5;i++)await page.keyboard.press('PageDown');await loaded(page);expect((await snapshot(page)).floor).toBe('coldwell-datum-17');
    await clickWorld(page,destination);await expect.poll(async()=>(await snapshot(page)).navigation.status,{timeout:60000}).toBe('complete');const planned=await snapshot(page);expect(planned.navigation.search.coarse).toBe(true);expect(planned.navigation.durationMs).toBeLessThan(30000);report.navigationPlanned=planned;await shot(page,'game-five-floor-route');
    await expect.poll(async()=>{const d=await snapshot(page);return d.hero.floorId==='coldwell-datum-17'&&Math.hypot(d.hero.x-72,d.hero.y-114.1,d.hero.h-36.04)<.03&&d.queue.length===0;},{timeout:240000}).toBe(true);
    report.navigationArrived=await snapshot(page);await shot(page,'game-five-floor-arrival');await page.locator('#menu').click();await page.getByRole('button',{name:'Choose operation, animal & loadout',exact:true}).click();expect((await snapshot(page)).navigation.worker).toBe(false);await page.close();
  }
  report.actualGameControlsPassed=true;
  for(const log of report.pages){expect(log.errors,JSON.stringify(log)).toEqual([]);expect(log.console.filter(m=>m.type==='error'),JSON.stringify(log)).toEqual([]);expect(log.requests.filter(r=>r.status||r.error!=='net::ERR_ABORTED'),JSON.stringify(log)).toEqual([]);}
}
