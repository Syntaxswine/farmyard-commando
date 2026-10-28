import fs from 'node:fs';
import path from 'node:path';

// The modules that share the application version: the root modules and the
// mission art the simulation reads (its solid tables) or the field draws. The
// hash-pinned aft/ and designer/ trees keep their exact URLs, so every importer
// shares one three.js instance.
export function versionedModules(source){
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
  const roots=fs.readdirSync(source).filter(file=>file.endsWith('.js')).sort();
  const art=fs.existsSync(path.join(source,'mission-art'))?walk(path.join(source,'mission-art')).filter(file=>file.endsWith('.js')).map(file=>path.relative(source,file).split(path.sep).join('/')).sort():[];
  return [...roots,...art];
}

// Appends ?v=<version> to each relative import, static or dynamic, that `file`
// (a path relative to the source root) makes of a versioned module.
export function versionImports(code,file,versioned,version){
  const folder=path.posix.dirname(file),set=versioned instanceof Set?versioned:new Set(versioned);
  return code.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.\.?\/[^'"]+\.js)\2/g,(match,prefix,quote,specifier)=>set.has(path.posix.normalize(path.posix.join(folder,specifier)))?`${prefix}${quote}${specifier}?v=${version}${quote}`:match);
}
