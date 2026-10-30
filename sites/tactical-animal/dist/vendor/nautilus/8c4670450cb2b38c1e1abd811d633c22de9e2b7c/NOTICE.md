# Sources and notices

Nautilus Engine includes selected, unchanged source and assets from the user's Animal Factory Tactics 3D and Farmyard Commando projects. `upstream.json` records exact commits; each `vendor/<donor>/<commit>/provenance.json` records original paths, SHA-256 values and byte counts. Original notices, including Three.js's embedded MIT notice, remain with their files.

The imported projects contain artwork and code with differing or unspecified per-file licensing. This record preserves provenance; it does not assert a new blanket license or grant redistribution rights. No new blanket license is applied to imported material. The source repository is public at the user's request; the review deployment uses owner sign-in.

The golden contour contribution additionally preserves the reviewed Farmyard renderer, tests and porting guide under its own `upstream.json` pin. These files are reference evidence; the separately maintained `packages/render-effects` extraction reuses the existing AFT-pinned Three.js instance and MIT notice. Source and dependency hashes, including comparison-only CRLF/LF evidence, are recorded in its provenance manifest.

Nautilus-authored files, original upstream files and generated deployment adaptations have separate paths or recorded build hashes. The donor games, their saves and their deployment/account settings are not imported as Nautilus defaults.

The `aft-assets` snapshot supplements the existing reviewed AFT commit with its original lathe v1, mill v1 and press v2 paint atlases. Its separate provenance manifest records all three source paths, byte counts and SHA-256 hashes; the original AFT snapshot is unchanged.

# Gross catalogue building collection

The separate `vendor/tinderbox-prefabs/6693bfa3fea2edec77649d830de5ac68ba4c1a50/` snapshot preserves selected original Tinderbox house assemblies, plans, painted materials, source plates and artist evidence. `upstream.json` identifies the repository and reviewed commit; its `provenance.json` records every original file hash. Embedded source notices and attribution remain unchanged, including the nested Farmyard native geometry dependency. The artist's source records identify the S. E. Gross catalogue plates and their public-domain source status. That historical source status does not itself license all newly authored code or paintings. This provenance notice adds no license grant.

Nautilus's building registry, source-aware editor library, placement contract and seeded lot generator are separate adapters; they do not modify the imported bytes or incorporate a Tinderbox game runtime.

## Tinderbox consumer conformance evidence

The test-only tests/fixtures/consumers/tinderbox/8a8405681614662a92f9b98fb9b9600bd06d3ad1 snapshot preserves the original compiler/simulation dependency closure and contract evidence from the user's Tinderbox project. Its provenance.json records exact Git blobs, byte counts and SHA-256 hashes. Embedded source notices remain unchanged; no new license grant is asserted. These source fixtures are excluded from distributable packages and are never a game runtime dependency. The engine-owned bounded adapter is separate from this evidence.

## Farmyard stat-v2 conformance evidence

The test-only Farmyard rules fixtures at commit `279d2d34786b3e6e5c5baeeac6898e60030afdbe` retain three original module byte streams, including their original mixed line endings and comments. `upstream.json` and `docs/reviews/2026-10-29-farmyard-rules.sources.json` identify the full source commit, Git blobs, byte counts and hashes. The pinned root has no blanket license; this provenance adds no license grant. Fixtures are excluded from all distributions. The engine-owned pure calculation adapter uses only the existing public rules boundary, without a Farmyard runtime or production pin change.
