// A pin on maps/mount-dora/features.json for tools that read its geometry and
// tags. build-mount-dora.py writes each building's `nativeProxy` (storeys,
// material, evidence) from these tools' outputs, so pinning the whole file would
// make every regeneration invalidate them. The digest leaves `nativeProxy` out
// and covers everything else: any geometry, tag or sector change still shows.
import {createHash} from 'node:crypto';

export function featuresDigest(bytes) {
  const doc = JSON.parse(bytes);
  for (const feature of doc.features) delete feature.nativeProxy;
  return createHash('sha256').update(JSON.stringify(doc)).digest('hex');
}

export const featuresPin = bytes => ({file: 'maps/mount-dora/features.json', sha256OmittingNativeProxy: featuresDigest(bytes)});
