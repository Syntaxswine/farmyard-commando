// Exports house parts as 24 x 24 Nautilus blocks for the workshop's Blocks
// library. In the workshop: Import the block file, Save it, switch to a map,
// choose it under Saved designs and Place block into any of the 10 x 10 slots.
// Parts wider or deeper than 24 m do not fit a block (index.json `block`).
//
//   node tools/maps/house-parts/export-block.mjs <id> [<id> ...] [--out <dir>]
//   node tools/maps/house-parts/export-block.mjs --all [--out <dir>]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {root, PARTS_DIR, toBlock, blockFits, sha256} from './house-parts.mjs';

export function readPart(id, base = root) {
  const bytes = fs.readFileSync(path.join(base, PARTS_DIR, id + '.json'));
  return {part: JSON.parse(bytes), sha: sha256(bytes)};
}

// Blocks for every committed part that fits, in index order.
export function allBlocks(base = root) {
  const index = JSON.parse(fs.readFileSync(path.join(base, PARTS_DIR, 'index.json'), 'utf8'));
  return index.parts.filter(p => p.block).map(p => { const {part, sha} = readPart(p.id, base); return {id: p.id, part, block: toBlock(part, sha)}; });
}

export const blockText = block => JSON.stringify(block) + '\n';
// One digest over every exported block, so a receipt names exactly what it checked.
export const blocksSha256 = blocks => sha256(blocks.map(b => b.id + '\n' + blockText(b.block)).join(''));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--out');
  const out = at >= 0 ? path.resolve(args[at + 1]) : path.join(root, 'artifacts/house-parts/blocks');
  const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
  const blocks = args.includes('--all') ? allBlocks() : ids.map(id => {
    const {part, sha} = readPart(id);
    if (!blockFits(part)) throw Error(`${id} is ${part.size.join(' x ')} m with ${part.storeys.count} storeys; a block holds at most 24 x 24 m and 5 storeys`);
    return {id, part, block: toBlock(part, sha)};
  });
  if (!blocks.length) throw Error('Name one or more part ids, or pass --all.');
  fs.mkdirSync(out, {recursive: true});
  for (const {id, block} of blocks) fs.writeFileSync(path.join(out, id + '.block.json'), blockText(block));
  console.log(`Wrote ${blocks.length} block${blocks.length === 1 ? '' : 's'} to ${out}`);
}
