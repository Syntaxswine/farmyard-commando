import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {validateLandmarkArt,referencesForSector,requireCatalogueBindings} from '../../../maps/mount-dora/art/index.js';
const base=new URL('../../../maps/mount-dora/art/',import.meta.url),read=n=>JSON.parse(fs.readFileSync(new URL(n,base),'utf8'));
const manifest=read('manifest.json'),geography=read('geography.json'),assets=read('source/selected-assets.json'),provenance=read('source/provenance.json');
test('Mount Dora seven landmark recipes use exact reviewed assets and distinct source identities',()=>{
 assert.deepEqual(validateLandmarkArt(manifest,geography,assets),[]);assert.equal(manifest.landmarks.length,7);assert.equal(geography.features.length,68);
 assert.equal(manifest.engineRevision,'2502646482218524fd5129641da769bb82462e4d');assert.deepEqual(manifest.world.extent,[1440,1680]);assert.equal(manifest.world.sectorMetres,240);
 const raw=fs.readFileSync(new URL('source/nautilus/packages/assets/catalogue.js',base),'utf8'),catalogue=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));for(const a of assets.assets)assert.deepEqual(a,catalogue.find(c=>c.id===a.id));
 const wrong=structuredClone(manifest);wrong.landmarks[0].catalogueAssetIds.push('objects:invented-pavilion');assert.match(validateLandmarkArt(wrong,geography,assets).join(' '),/Unsupported catalogue/);assert.throws(()=>requireCatalogueBindings(manifest.landmarks[0],[]),/explicit bindings/);
});
test('Mount Dora town anchors preserve metres and never receive another half-tile shift',()=>{
 const light=manifest.landmarks.find(l=>l.id==='md:grantham-lighthouse');assert.deepEqual(light.geographicAnchor.townPoint,[500.2877,1169.7989]);assert.equal(light.geographicAnchor.sourceFeatureId,'osm:node/2704687214');
 const park=geography.features.find(f=>f.id==='osm:way/468920884');assert.deepEqual(park.townPoints[0],[450.0193,524.4105]);assert.deepEqual(park.townBounds,[440.3058,443.9572,519.8018,524.4105]);
 const inn=manifest.landmarks.find(l=>l.id==='md:lakeside-inn');assert.equal(inn.sourceFeatureIds.length,8);assert.match(inn.limitations.join(' '),/not the complete hotel/);assert.equal(new Set(inn.sourceFeatureIds).size,8);
 const boardwalk=geography.features.find(f=>f.id==='osm:way/688219167');assert.equal(boardwalk.kind,'polyline');assert.deepEqual(boardwalk.townPoints[0],[615.5621,1325.8834]);assert.deepEqual(boardwalk.townPoints.at(-1),[348.575,1544.733]);
});
test('Mount Dora cross-sector references retain one global identity without adding seam walls',()=>{
 const park='osm:way/468920884';for(const [c,r]of [[1,1],[2,1],[1,2],[2,2]]){const refs=referencesForSector(manifest,geography,c,r);assert.ok(refs.some(x=>x.globalSourceIds.includes(park)));assert.equal(refs.filter(x=>x.globalSourceIds.includes(park)).length,1);assert.match(refs.find(x=>x.globalSourceIds.includes(park)).geometryPolicy,/no seam caps/);}
 assert.throws(()=>referencesForSector(manifest,geography,6,0));assert.throws(()=>referencesForSector(manifest,geography,0,7));
 const before=JSON.stringify([manifest,geography]);referencesForSector(manifest,geography,2,4);assert.equal(JSON.stringify([manifest,geography]),before);
});
test('Mount Dora reference renderer and painted source bytes match immutable provenance',()=>{
 for(const file of provenance.files.filter(f=>f.local)){const bytes=fs.readFileSync(new URL(file.local,base));assert.equal(bytes.length,file.bytes,file.path);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);}
 assert.equal(provenance.geodataInputs['osm-downtown-snapshot.json'].bytes,3385887);assert.equal(geography.attribution,'© OpenStreetMap contributors, ODbL 1.0');
});
