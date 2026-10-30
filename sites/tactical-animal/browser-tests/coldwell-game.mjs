import {expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const snapshot=page=>page.evaluate(()=>window.__coldwellGame.snapshot());
async function loaded(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect(page.locator('#loading')).toBeHidden({timeout:60000});await page.evaluate(()=>window.__coldwellGame.whenIdle());await expect.poll(async()=>(await snapshot(page)).pendingActors).toBe(0);expect((await snapshot(page)).failed).toEqual([]);}
async function clickWorld(page,point){const p=await page.evaluate(point=>window.__coldwellGame.project(point),point);expect(p.visible).toBe(true);await page.touchscreen.tap(p.x,p.y);}
async function seed(page,id,text){await page.addInitScript(({id,text})=>localStorage.setItem('tactical-animal-operation-v3:'+id,text),{id,text});}

// Real game UI, real shaders and public-command save checkpoints. No simulation
// state setter, renderer substitute or post-load position change is available.
export async function checkColdwellGame(context,{root,origin,output,report,observe,shot}){
  const fixtures=JSON.parse(await fs.readFile(path.join(root,'artifacts/window-browser/coldwell-checkpoints.json'),'utf8'));expect(fixtures.result.passed).toBe(true);expect(fixtures.fullyPlayed).toBe(true);expect(fixtures.sourceHead).toBe(report.testedSha);report.playedRoute=fixtures.result;
  const game=await context.newPage();observe(game,'actual-coldwell-game',report);report.gameViews=[];
  await seed(game,'coldwell-traversal',fixtures.states['quiet-gatehouse']);await game.goto(origin+'/game.html?coldwellTest=traversal');await expect(game.locator('#resume')).toBeVisible();await game.locator('#resume').click();await loaded(game);
  expect((await snapshot(game)).hero.floorId).toBe('coldwell-datum-22');expect((await snapshot(game)).actors).toBeGreaterThan(0);await shot(game,'game-gatehouse');report.gameViews.push({id:'gatehouse',...await snapshot(game)});
  await clickWorld(game,{x:94.5,y:142,h:47.3});await expect(game.locator('#interaction-label')).toHaveText('Open');await game.locator('#interaction-hand').tap();await expect.poll(async()=>(await snapshot(game)).spatial.poses['surface-door:s:94:141']).toBe(90);await shot(game,'game-door-open');
  await game.locator('#menu').click();await game.getByRole('button',{name:'Choose operation, animal & loadout',exact:true}).click();await game.locator('#resume').click();await loaded(game);expect((await snapshot(game)).spatial.poses['surface-door:s:94:141']).toBe(90);
  await game.close();

  const stairs=await context.newPage();observe(stairs,'actual-coldwell-stairs',report);await seed(stairs,'coldwell-traversal',fixtures.states['quiet-portal']);await stairs.goto(origin+'/game.html?coldwellTest=traversal');await stairs.locator('#resume').click();await loaded(stairs);
  await stairs.locator('[data-floor-id="coldwell-datum-21"]').click();await loaded(stairs);await clickWorld(stairs,{x:72,y:114.1,h:44.52});
  await expect.poll(async()=>{const d=await snapshot(stairs);return d.hero.floorId==='coldwell-datum-21'&&Math.abs(d.hero.h-44.52)<.03&&d.queue.length===0;},{timeout:60000}).toBe(true);await loaded(stairs);await shot(stairs,'game-b1-arrival');report.gameViews.push({id:'b1',...await snapshot(stairs)});
  const stairProbe=await stairs.evaluate(()=>window.__windowNativeProbe.snapshot());expect(stairProbe.shaders.some(s=>s.heightFog&&s.standard&&s.stage==='fragment')).toBe(true);expect(stairProbe.shaders.filter(s=>!s.ok)).toEqual([]);expect(stairProbe.links.filter(s=>!s.ok)).toEqual([]);report.gameProbe=stairProbe;
  await stairs.setViewportSize({width:390,height:844});expect(await stairs.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await shot(stairs,'game-phone-b1');await stairs.close();

  const loot=await context.newPage();observe(loot,'actual-coldwell-records',report);await loot.setViewportSize({width:390,height:844});await seed(loot,'coldwell-recon',fixtures.states['recon-records']);await loot.goto(origin+'/game.html?coldwellTest=recon');await loot.locator('#resume').click();await loaded(loot);
  for(let attempt=0;attempt<3;attempt++){
    const d=await snapshot(loot);if(d.phase==='enemy'||d.hero.ap<3){if(d.phase==='player')await loot.locator('#end-turn').tap();await expect.poll(async()=>(await snapshot(loot)).phase,{timeout:60000}).not.toBe('enemy');continue;}break;
  }
  await expect(loot.locator('#interaction-label')).toHaveText('Open');await loot.locator('#interaction-hand').tap();await expect(loot.getByRole('button',{name:/Take all/})).toBeVisible();await shot(loot,'game-phone-records-chest');await loot.getByRole('button',{name:/Take all/}).tap();await expect.poll(async()=>(await snapshot(loot)).objectives['coldwell-records']).toBe(true);report.gameViews.push({id:'records-taken',...await snapshot(loot)});
  await loot.getByRole('button',{name:'Return to operation',exact:true}).click();await loot.locator('#menu').click();await loot.getByRole('button',{name:'Choose operation, animal & loadout',exact:true}).click();await loot.locator('#resume').click();await loaded(loot);expect((await snapshot(loot)).objectives['coldwell-records']).toBe(true);await shot(loot,'game-phone-records-restored');report.actualGameControlsPassed=true;await loot.close();
  for(const log of report.pages){expect(log.errors,JSON.stringify(log)).toEqual([]);expect(log.console.filter(m=>m.type==='error'),JSON.stringify(log)).toEqual([]);expect(log.requests.filter(r=>r.status||r.error!=='net::ERR_ABORTED'),JSON.stringify(log)).toEqual([]);}
}
