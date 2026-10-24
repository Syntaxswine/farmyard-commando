import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve('sites/tactical-animal/dist');
const own=['app.js','solo-game.js','field-view.js','mobile-controls.js','grenade-controls.js','original-art.js','world-dimensions.js'];
for(const file of own)execFileSync(process.execPath,['--check',path.join(root,file)]);
const visited=new Set();
function check(file){if(visited.has(file))return;visited.add(file);const source=fs.readFileSync(file,'utf8');for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)){const dependency=path.resolve(path.dirname(file),match[1]);if(!dependency.startsWith(root+path.sep)||!fs.existsSync(dependency))throw Error(`Missing import in ${file}: ${match[1]}`);if(dependency.endsWith('.js'))check(dependency);}}
for(const file of own)check(path.join(root,file));
for(const file of ['index.html','game.html','style.css','touch-controls.css','original-art.css','title-screen.css','icon.svg'])if(!fs.existsSync(path.join(root,file)))throw Error('Missing '+file);
const app=fs.readFileSync(path.join(root,'app.js'),'utf8'),game=fs.readFileSync(path.join(root,'game.html'),'utf8');
const ids=new Set([...game.matchAll(/\bid="([^"]+)"/g),...app.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
for(const match of app.matchAll(/\$\('([^']+)'\)/g))if(!ids.has(match[1]))throw Error('Game markup is missing application control: '+match[1]);
console.log(`${own.length} application modules pass syntax checks; ${visited.size} module imports resolve.`);
const designer=JSON.parse(fs.readFileSync(path.resolve('sites/tactical-animal/designer-provenance.json'),'utf8'));
const designerRoot=path.dirname(path.dirname(path.resolve(root,designer.entry)));
if(!designerRoot.startsWith(path.join(root,'designer')+path.sep))throw Error('Unsafe designer provenance root.');
for(const file of designer.files){
  const target=path.resolve(designerRoot,file.path);
  if(!target.startsWith(designerRoot+path.sep))throw Error('Unsafe designer dependency: '+file.path);
  const bytes=fs.readFileSync(target);
  if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Designer snapshot changed: '+file.path);
  if(target.endsWith('.js'))check(target);
}
for(const entry of ['index.html','game.html',designer.entry]){
  const file=path.join(root,entry),html=fs.readFileSync(file,'utf8');
  for(const match of html.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)){
    if(/^(?:https?:|data:|blob:)/.test(match[1]))continue;
    if(!fs.existsSync(path.resolve(path.dirname(file),match[1])))throw Error(`Missing page dependency in ${entry}: ${match[1]}`);
  }
}
console.log(`${designer.files.length} designer files match their recorded hashes; title, game, and designer entry points resolve.`);
