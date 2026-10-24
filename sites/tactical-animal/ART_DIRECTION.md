# Farmyard Commando: inherited visual direction

Farmyard Commando is the single-player phone version of **Animal Factory Tactics 3D**. The parent game supplies the visual identity and the original art. New graphics should extend that work consistently.

## Source library

The source is `AnimalFactory3D/game/dist`, recorded at revision `a20b343a0234b5d8b365a4e1668961ca1bf37653`. `aft-provenance.json` records each borrowed file's SHA-256, byte count and relative path. The `dist/aft/` snapshot holds 1,181 files: 949 art assets and their manifests plus the associated model data, rendering modules and original styles. The original checkout is read only during import. Source-control metadata is excluded so the imported bytes remain stable across Git checkouts.

| Category | Original assets | Includes |
| --- | ---: | --- |
| Characters | 704 | Painted portraits, species models, clothing, pose art, references and texture atlases |
| Environment | 173 | Ground, brick, metal, timber, cargo, furniture, foliage, factory equipment and vehicles |
| Equipment | 25 | Painted weapon inventory images and equipment surfaces |
| Effects | 22 | Painted fire, blast, blood and related visual atlases |
| Machines | 17 | Factory machine paintings and visual elements |
| Interface | 8 | Original interface artwork |

The accompanying modules preserve the parent game's cargo and furniture builders, scenery and biome libraries, character animation, lighting, equipment and effects. The phone adaptation keeps its existing solo mission and controls. Catalog availability does not add an object or its gameplay to that mission.

Run `node sites/tactical-animal/tools/snapshot-aft.mjs <original-dist-directory>` from the repository root to deliberately refresh the snapshot. Review changes and run `npm run check` afterward. The `.gitattributes` entry preserves the imported bytes on Windows as well as other platforms; edit mobile adapters rather than borrowed files.

## Art already connected to the mobile game

- Character selection uses the original worker portraits. The battlefield uses the existing original species models, paint, equipment and movement rigs.
- Loadout buttons and the grenade control use the original painted weapon images and their original crop frames. Stance controls use the parent game's silhouette symbols.
- `original-art.js` renders the mission with the original brick, concrete, gravel and grass textures, the original two-metre wall height and the parent game's painted cargo renderer. Walls and cargo use instancing for repeated pieces.
- The original daylight rig supplies the morning light and shadows. Its mobile shadow map is 1024 pixels.
- The preparation screen follows the parent's cream paper, oxide red, ink-black lettering and diagonal poster composition. Battle controls follow its olive panels, cream labels and muted gold selection treatment. System fonts keep the phone version independent of external font downloads.

The full art bank stays on disk. The browser requests only the images and modules used by the current screens and mission.

## Phone adaptation rules

Keep the original painted silhouettes, material scale, weathering and species identity. Preserve transparent margins and use the recorded weapon crop frames rather than stretching weapon images. Retain readable touch targets, portrait framing and safe-area spacing.

The solo simulation owns collision, movement, AP, targeting and knowledge of the map. A scenery placement needs a matching gameplay footprint before becoming a solid visible object. Respect unexplored ground and hidden opponents; foreground walls may fade for camera readability without changing line of sight. The existing mission receives a material and model replacement; its layout and rules stay intact.

New missions can use the rest of the inherited catalog as their gameplay and placements are authored. Furniture, factories, vehicles and biome scenery are available without making the first phone mission load the entire library.
