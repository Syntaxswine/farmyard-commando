import {test,expect,chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {root} from './playwright.config.mjs';
import {installNativeProbe,inspectWebGL} from './native-probe.mjs';
import {checkColdwellGame} from './coldwell-game.mjs';
const origin='http://127.0.0.1:4178',output=path.join(root,'artifacts/window-browser/coldwell');
const flags=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const preview=page=>page.evaluate(()=>window.__coldwellPreview.snapshot());
async function ready(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect(page.locator('#loading')).toHaveText('Preview ready',{timeout:60000});await page.evaluate(()=>window.__coldwellPreview.whenIdle());}
function observe(page,name,report){const log={name,errors:[],console:[],requests:[]};report.pages.push(log);page.on('pageerror',e=>log.errors.push(String(e.stack||e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))log.console.push({type:m.type(),text:m.text()});});page.on('requestfailed',r=>log.requests.push({url:r.url(),error:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)log.requests.push({url:r.url(),status:r.status()});});}
async function shot(page,name){await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});}
const portReleased=port=>new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port});socket.setTimeout(1000);socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',error=>{socket.destroy();resolve(error.code==='ECONNREFUSED');});socket.once('timeout',()=>{socket.destroy();resolve(false);});});
test('Coldwell compiles native standard/depth/distance shaders in all proving views and bounded FieldView',async({},testInfo)=>{
  await fs.mkdir(output,{recursive:true});
  const report={testedSha:process.env.TESTED_SHA||'local',node:process.version,flags,stage:'Coldwell integration candidate',gameplayAdmission:'Feature branch candidate; architect owns release review',realDevicePerformanceVerified:false,pages:[],views:[],fieldViews:[]};
  const started=new Date(),server=await chromium.launchServer({headless:true,args:flags}),processHandle=server.process();let browser,context,art,field;
  let creationTicks=null;try{creationTicks=(await fs.readFile('/proc/'+processHandle.pid+'/stat','utf8')).split(') ').at(-1).split(' ')[19];}catch{}
  report.helper={pid:processHandle.pid,creationTicks,createdAt:started.toISOString(),executable:processHandle.spawnfile,owner:'Coldwell native acceptance',project:root,purpose:'Isolated Chromium for actual shaders and controls',port:Number(new URL(server.wsEndpoint()).port),expiresAt:new Date(started.getTime()+360000).toISOString(),stop:'Owned BrowserServer.close() in finally; six-minute automatic retirement',restart:{source:'sites/tactical-animal/browser-tests/coldwell.spec.mjs',runtime:'Node 24 and locked Playwright Chromium',inputs:'exact TESTED_SHA dist build',outputs:'artifacts/window-browser/coldwell',flags}};
  report.browserStderr='';processHandle.stderr?.on('data',chunk=>{report.browserStderr=(report.browserStderr+chunk.toString()).slice(-16000);});processHandle.on('exit',(code,signal)=>{report.helper.exitCode=code;report.helper.exitSignal=signal;});
  const retire=setTimeout(()=>server.close().catch(()=>{}),360000);retire.unref();
  try{
    browser=await chromium.connect(server.wsEndpoint());report.browser=browser.version();
    context=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true,recordVideo:{dir:path.join(output,'video'),size:{width:1280,height:900}}});
    await context.tracing.start({screenshots:true,snapshots:true,sources:true});await context.addInitScript(installNativeProbe);
    await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort('blockedbyclient');});
    art=await context.newPage();observe(art,'artist-proving',report);await art.goto(origin+'/art/coldwell/review.html?revision='+report.testedSha);
    await expect(art.locator('body')).toHaveAttribute('data-ready','native-ready',{timeout:60000});report.artWebGL=await art.evaluate(inspectWebGL,'canvas');expect(report.artWebGL.available).toBe(true);
    for(const id of ['approach','interior','portal','b5','stairs','closed','half','open']){
      await art.locator(`[data-view="${id}"]`).click();await expect(art.locator(`[data-view="${id}"]`)).toHaveAttribute('aria-current','true');await expect(art.locator('#render-status')).toContainText('Native WebGL ·');
      const d=JSON.parse(await art.locator('#diagnostics').textContent());expect(d.residentEntries).toBeGreaterThan(0);expect(d.renderer.triangles).toBeGreaterThan(0);expect(d.residentEntries).toBeLessThan(250);report.views.push({id,...d});await shot(art,'art-'+id);
    }
    await art.setViewportSize({width:390,height:844});
    for(const id of ['approach','portal','b5']){await art.locator(`[data-view="${id}"]`).tap();await expect(art.locator(`[data-view="${id}"]`)).toHaveAttribute('aria-current','true');expect(await art.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await shot(art,'art-phone-'+id);}
    await art.setViewportSize({width:1440,height:1000});
    await art.locator('[data-view="b5"]').click();await expect(art.locator('[data-view="b5"]')).toHaveAttribute('aria-current','true');
    await art.locator('#doors').focus();await art.keyboard.press('Home');for(let i=0;i<45;i++)await art.keyboard.press('ArrowRight');expect(JSON.parse(await art.locator('#diagnostics').textContent()).poses['blast-door-west']).toBe(45);await shot(art,'art-doors-45');
    await art.locator('#unload').click();await expect.poll(async()=>JSON.parse(await art.locator('#diagnostics').textContent()).residentEntries).toBe(0);
    await art.locator('#restore').click();await expect.poll(async()=>JSON.parse(await art.locator('#diagnostics').textContent()).residentEntries).toBeGreaterThan(0);
    report.artProbe=await art.evaluate(()=>window.__windowNativeProbe.snapshot());await art.locator('#dispose').click();await expect(art.locator('#render-status')).toContainText('Art disposed');report.artDisposed=JSON.parse(await art.locator('#diagnostics').textContent());expect(report.artDisposed.residentEntries).toBe(0);
    field=await context.newPage();observe(field,'actual-fieldview',report);await field.goto(origin+'/coldwell-preview.html');await ready(field);report.fieldWebGL=await field.evaluate(inspectWebGL,'#viewport canvas');expect(report.fieldWebGL.available).toBe(true);
    for(const id of ['approach','gatehouse','portal','b1','b5','shaft']){
      await field.locator('#'+id).click();await ready(field);await expect.poll(async()=>(await preview(field)).art.pendingRequests).toBe(0);
      const d=await preview(field);expect(d.errors).toEqual([]);expect(d.renderer.calls).toBeGreaterThan(0);expect(d.art.residentEntries).toBeLessThan(250);report.fieldViews.push({id,...d});await shot(field,'field-'+id);
    }
    await field.locator('#point-shadow').check();await expect.poll(async()=>(await field.evaluate(()=>window.__windowNativeProbe.snapshot())).shaders.filter(s=>s.coldwell&&s.distance&&s.stage==='fragment').length).toBeGreaterThan(0);await shot(field,'field-distance-shadow');await field.locator('#point-shadow').uncheck();
    for(let i=0;i<3;i++){await field.locator('#unload').click();await ready(field);}report.afterRepeatedDisposal=await preview(field);
    expect(report.afterRepeatedDisposal.renderer.geometries).toBeLessThan(report.fieldViews[0].renderer.geometries+8);
    await field.setViewportSize({width:390,height:844});await field.locator('#portal').tap();await ready(field);expect(await field.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await shot(field,'field-phone-portal');
    await field.locator('#b1').tap();await ready(field);expect((await preview(field)).floor).toBe('coldwell-datum-21');await shot(field,'field-phone-b1');
    await field.locator('#portal').tap();await ready(field);await field.locator('#viewport').scrollIntoViewIfNeeded();const picked=await field.evaluate(()=>window.__coldwellPreview.project({x:73.5,y:118.6,h:46.64}));expect(picked.visible).toBe(true);await field.touchscreen.tap(picked.x,picked.y);await expect(field.locator('#picked')).toContainText('coldwell-datum-22');report.phonePick=JSON.parse(await field.locator('#picked').textContent());expect(Math.abs(report.phonePick.h-46.64)).toBeLessThan(.001);
    report.fieldProbe=await field.evaluate(()=>window.__windowNativeProbe.snapshot());
    const shaders=[...report.artProbe.shaders,...report.fieldProbe.shaders];for(const kind of ['standard','depth','distance'])expect(shaders.some(s=>s.coldwell&&s[kind]&&s.stage==='fragment'),kind+' must compile from actual Coldwell rendering').toBe(true);
    for(const p of [report.artProbe,report.fieldProbe]){expect(p.shaders.filter(s=>!s.ok)).toEqual([]);expect(p.links.filter(s=>!s.ok)).toEqual([]);}
    for(const log of report.pages){expect(log.errors,JSON.stringify(log)).toEqual([]);expect(log.console.filter(m=>m.type==='error'),JSON.stringify(log)).toEqual([]);expect(log.requests.filter(r=>r.status||r.error!=='net::ERR_ABORTED'),JSON.stringify(log)).toEqual([]);}
    await field.evaluate(()=>window.__coldwellPreview.dispose());const disposed=await preview(field);expect(disposed.retiredArt.disposed).toBe(true);expect(disposed.retiredArt.residentEntries).toBe(0);expect(disposed.retiredArt.counters.createdGeometries).toBe(disposed.retiredArt.counters.disposedGeometries);expect(disposed.retiredArt.counters.createdTextures).toBe(disposed.retiredArt.counters.disposedTextures);await checkColdwellGame(context,{root,origin,output,report,observe,shot});report.passed=true;
  }catch(error){report.failure=String(error.stack||error);for(const [name,page]of [['art-failure',art],['field-failure',field],...(context?.pages()||[]).filter(p=>p.url().includes('/game.html')).map((page,i)=>['game-failure-'+i,page])])if(page&&!page.isClosed())await shot(page,name).catch(()=>{});throw error;
  }finally{
    try{if(field&&!field.isClosed())report.finalState=await preview(field).catch(()=>null);await context?.tracing.stop({path:path.join(output,'native-trace.zip')}).catch(error=>{report.traceError=String(error);});}
    finally{try{await context?.close();report.contextClosed=true;}finally{try{await browser?.close();}finally{await server.close();clearTimeout(retire);report.browserDisconnected=!browser?.isConnected();report.helper.exited=processHandle.exitCode!==null||processHandle.signalCode!==null;report.helper.portReleased=await portReleased(report.helper.port);const file=path.join(output,'native-report.json');await fs.writeFile(file,JSON.stringify(report,null,2));await testInfo.attach('coldwell-native-report',{path:file,contentType:'application/json'});}}}
  }
});
