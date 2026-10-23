import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve('sites/tactical-animal/dist');
const own=['app.js','solo-game.js','field-view.js','mobile-controls.js'];
for(const file of own)execFileSync(process.execPath,['--check',path.join(root,file)]);
const visited=new Set();
function check(file){if(visited.has(file))return;visited.add(file);const source=fs.readFileSync(file,'utf8');for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)){const dependency=path.resolve(path.dirname(file),match[1]);if(!dependency.startsWith(root+path.sep)||!fs.existsSync(dependency))throw Error(`Missing import in ${file}: ${match[1]}`);if(dependency.endsWith('.js'))check(dependency);}}
for(const file of own)check(path.join(root,file));
for(const file of ['index.html','style.css','touch-controls.css','icon.svg'])if(!fs.existsSync(path.join(root,file)))throw Error('Missing '+file);
console.log(`${own.length} application modules pass syntax checks; ${visited.size} module imports resolve.`);
