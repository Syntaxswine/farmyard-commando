# Coldwell Silo map — Farmyard Commando intake

The artist handoff contains a complete original surface compound and its required underground silo companion. Start with `maps/coldwell-site/map.bundle.json` and `docs/coldwell-map.md`. Do not treat `surface.map.json` as the full silo.

- Engine target: **Nautilus v0.8.0**, `8c4670450cb2b38c1e1abd811d633c22de9e2b7c`, [released source](https://github.com/Syntaxswine/nautilus-engine/tree/v0.8.0).
- Silo collection: `3b9d4004a7e51e5d345cded068fc46eab2f320a2`; the complete unchanged `coldwell-silo-v1.zip` is supplied beside the manifest.
- Surface: 240 × 240 native metre tiles, dirt approach, open fence gate, 78 trees, three support buildings and the silo's existing entrance kiosk. No enemies or objectives are imposed.
- Coordinates: legacy Three preview places silo root at `[38,0,85]`. World binding uses `{x:38.5,y:85.5,h:46.64}`. Apply the common half-metre horizontal offset and 46.64 m height offset once to all surface, model and anchor coordinates; native scale stays one.

The observed Farmyard importer at `3a557bf743e5c5bb9728a3bee835ce85765c721a` rejects the surface's dirt, void reservations, trees, chain-link barriers and roof layers, and has no adopted full silo companion contract. Its exact audit and hashes are in `docs/reviews/coldwell-map/compatibility.json`. This is a candidate awaiting the Farmyard owner's import-seam confirmation and adoption, not an installed or playable game operation.

The receiving owner should preserve the source pair, verify every manifest hash, adopt the visible surface features, then bind the required curved support/clearance, extended heights, stair traversal and moving-part state before enabling the full map. The `artist-coldwell-*` capabilities express those intake requirements; advertising them requires actual implementation. Keep unsupported loading an explicit refusal, with the full source retained. A deliberately selected surface-only preview must remain labelled as such.

The original silo archive retains its detailed and reduced meshes, glTF models, painterly atlas, prompt, source notices and review evidence. Unpack it into a dedicated art intake directory; do not overwrite an existing game or engine `package.json`. Use its optional artist modules with the receiving host's existing Three instance. The new composition module expects the pinned Nautilus source dependencies; no donor runtime is bundled or automatically launched. Neither game pins nor the Farmyard checkout have been modified.
