import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {root} from './playwright.config.mjs';
import {installNativeProbe} from './native-probe.mjs';
const flags=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
export function observe(page,name,report){const log={name,errors:[],console:[],requests:[]};report.pages.push(log);page.on('pageerror',e=>log.errors.push(String(e.stack||e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))log.console.push({type:m.type(),text:m.text()});});page.on('requestfailed',r=>log.requests.push({url:r.url(),error:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)log.requests.push({url:r.url(),status:r.status()});});}
const portReleased=port=>new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port});socket.setTimeout(1000);socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',error=>{socket.destroy();resolve(error.code==='ECONNREFUSED');});socket.once('timeout',()=>{socket.destroy();resolve(false);});});
async function bounded(promise,ms=10000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native cleanup deadline exceeded.')),ms);})]);}finally{clearTimeout(timer);}}

// One owned browser per bounded scenario, with progress retained before cleanup.
export async function withColdwellNative(testInfo,{output,report,run}){
  await fs.mkdir(output,{recursive:true});Object.assign(report,{testedSha:process.env.TESTED_SHA||execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),node:process.version,flags,realDevicePerformanceVerified:false,pages:[]});
  const started=new Date(),server=await chromium.launchServer({headless:true,args:flags}),child=server.process();let browser,context,failure;
  let creationTicks=null;try{creationTicks=(await fs.readFile('/proc/'+child.pid+'/stat','utf8')).split(') ').at(-1).split(' ')[19];}catch{}
  report.helper={pid:child.pid,creationTicks,createdAt:started.toISOString(),executable:child.spawnfile,owner:'Coldwell native acceptance: '+report.stage,project:root,purpose:'Isolated real Chromium shaders and controls',port:Number(new URL(server.wsEndpoint()).port),expiresAt:new Date(started.getTime()+420000).toISOString(),stop:'Owned BrowserServer.close in finally; seven-minute automatic retirement',restart:{source:'sites/tactical-animal/browser-tests/coldwell.spec.mjs',runtime:'Node 24 and locked Playwright Chromium',inputs:'exact TESTED_SHA build and played checkpoints',outputs:output,flags}};
  report.browserStderr='';child.stderr?.on('data',chunk=>{report.browserStderr=(report.browserStderr+chunk.toString()).slice(-16000);});child.on('exit',(code,signal)=>{report.helper.exitCode=code;report.helper.exitSignal=signal;});
  const retire=setTimeout(()=>{report.helper.expired=true;void server.close().catch(()=>{});},Math.max(1,Date.parse(report.helper.expiresAt)-Date.now()));retire.unref();
  const file=path.join(output,'native-report.json'),checkpoint=()=>fs.writeFile(file,JSON.stringify(report,null,2));await checkpoint();
  try{
    browser=await chromium.connect(server.wsEndpoint());report.browser=browser.version();context=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true,recordVideo:{dir:path.join(output,'video'),size:{width:1280,height:900}}});
    await context.tracing.start({screenshots:true,snapshots:true,sources:true});await context.addInitScript(installNativeProbe);
    await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort('blockedbyclient');});
    await run(context,checkpoint);report.controlsAndShadersPassed=true;
  }catch(error){failure=error;report.failure=String(error.stack||error);await checkpoint();for(const [i,page]of (context?.pages()||[]).entries())if(!page.isClosed())await page.screenshot({path:path.join(output,'failure-'+i+'.png'),fullPage:true,timeout:10000}).catch(()=>{});
  }finally{
    report.cleanupErrors=[];
    for(const [name,close]of [['trace',()=>context?.tracing.stop({path:path.join(output,'native-trace.zip')})],['context',()=>context?.close()],['browser',()=>browser?.close()],['server',()=>server.close()]])try{await bounded(Promise.resolve().then(close));report[name+'Closed']=true;}catch(error){report.cleanupErrors.push({name,error:String(error)});}
    report.browserDisconnected=!browser?.isConnected();report.helper.exited=child.exitCode!==null||child.signalCode!==null;if(report.helper.exited)clearTimeout(retire);report.helper.portReleased=await portReleased(report.helper.port);report.passed=!failure&&!report.cleanupErrors.length&&report.helper.exited&&report.helper.portReleased;
    await checkpoint();await testInfo.attach('coldwell-native-'+report.stage,{path:file,contentType:'application/json'});
  }
  if(failure)throw failure;if(!report.passed)throw Error('Native helper cleanup did not pass; inspect native-report.json.');
}
