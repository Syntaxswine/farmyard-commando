# Coldwell Silo provenance

Coldwell is original Nautilus architectural artwork informed by the publicly accessible Titan II Missile Museum National Historic Landmark nomination. The source's text and credited Figure 3 were inspected to understand architectural massing, room roles and circulation. The game adaptation rounds horizontal dimensions and uses a 2.12 m vertical grid. It is not an as-built reconstruction. Source measurements, original choices, URLs and hashes are in `references.json`.

The reference PDF contains work with differing authorship, including credited drawings and a postcard. Its availability does not imply a blanket license. Neither its pages nor their pixels are included in this collection or its delivery archive. The original research cache remains local and ignored by Git. The floor drawings in `plans/` are newly generated from Coldwell's own floor polygons.

The geometry, original procedural source meshes, game meshes, props and painterly atlas were authored for this project. The atlas was generated with the built-in image tool and copied unchanged; `material-prompt.json` records the exact prompt and selected output hash. No source-plan pixels were incorporated into the atlas. Prior original Nautilus geometry patterns are identified by immutable commits and file hashes in `references.json`; no donor checkout or vendor snapshot was modified.

The renderer accepts the host's Three namespace and borrows its texture. Review and tests use the existing pinned Three r180 copy with its existing MIT notice. Independent audit tools are development-only, installed in ignored `artifacts/`: Three 0.180.0 (MIT), and Khronos glTF Validator 2.0.0-dev.3.10 (Apache-2.0). Their registry integrity values and the immutable world-schema audit closure are recorded in `docs/reviews/silo/export-audit.json`. They are not new runtime dependencies or redistributed vendor imports.

This notice preserves provenance and adds no blanket license grant to upstream or generated work. See the repository's `NOTICE.md` for existing source notices.
