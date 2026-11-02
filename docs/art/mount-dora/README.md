# Mount Dora landmark art

This authoring sidecar targets Nautilus workshop **2502646482218524fd5129641da769bb82462e4d**. It is separate from Coldwell and guard work, uses released Farmyard **251bf8094b5f9ebe44208443084c1a6d6658512a**, and changes no game/engine pin. The architect owns projection, terrain, footprints, shoreline, sectors, integration and promotion.

## Early manifest contract

[maps/mount-dora/art/manifest.json](../../../maps/mount-dora/art/manifest.json) defines seven treatment groups. [geography.json](../../../maps/mount-dora/art/geography.json) preserves 68 original OSM feature identities and projected points. `source/selected-assets.json` contains 24 actual public catalogue entries copied from the fixed source, not invented preset IDs.

Town coordinates are east/south metres, tangent origin Donnelly Park at 28.8010291, -81.6442229 plus `(480,480)`. North is up. The 1440 × 1680 m extent contains 6 × 7 sectors of 240 m. A town anchor already has the common shift: **do not add .5 m**. Only legacy integer tile centres convert with sector origin + local integer + .5.

Each landmark keeps a geographic source anchor separate from its visual treatment. Catalogue buildings demonstrate typology; their dimensions, footprints, heights and rooms do not become surveyed Mount Dora buildings. Source geography wins. Do not stretch a prefab, move a road/shoreline, replace the entire hotel with its one named small building, or cap a building at a sector cut. `referencesForSector` returns conservative source references only; the architect owns actual clipped pieces and town topology.

| Group | Treatment | Explicit uncertainty |
|---|---|---|
| Donnelly Park | Existing civic porch, shade trees, native court surfaces and fence/lights | Preserve five mapped court polygons as mapped. They are not proof of today's complete court count. Stage/deck and court paint are studies. |
| Lakeside Inn | Yellow clapboard, ivory trim, green roofing, deep veranda; existing depot/cottage/inn typologies | Eight associated OSM structures keep their own identities; named small way 560095897 is not the whole hotel. No surveyed interiors/heights. |
| Elizabeth Evans Park | Timber/green roof lakefront pavilion theme | Source label is Evans Park. Bowling shelters are not relabelled as the lakefront pavilion. Precise pavilion point remains unresolved. |
| Grantham Point | Red/ivory static lighthouse study | Exact supplied anchor `(500.2877,1169.7989)`; no registered lighthouse preset, interior or functioning beacon is claimed. |
| Gilbert Park | Original mapped open shelters, picnic furniture and large shade trees | Roof/post studies retain two pavilion identities separately from restrooms. |
| Palm Island | Original wooden route, wetland foliage and railing theme | Bridge layer is not surveyed elevation. No public cabbage-palm or automatic boardwalk-rail preset exists in this catalogue. |
| Donnelly / Fifth shopfronts | Existing corner shop/store/market typologies and awnings | Individual businesses retain source footprints; catalogue room plans are illustrative. |

`validateLandmarkArt` rejects unknown assets and missing identities. `requireCatalogueBindings` rejects missing host bindings. Unsupported art stays explicit in the sidecar and handoff; nothing is silently dropped into a partial portable map.

## Evidence and reproduction

The architect supplied a complete public OSM API snapshot and tangent-plane vectors. Their exact input hashes are in `source/provenance.json`; the derived subset retains OSM attribution and excludes contributor/account data. [OpenStreetMap attribution and licence](https://www.openstreetmap.org/copyright).

Official references establish visual/site identity: [City park inventory](https://mountdora.gov/1031/Parks-and-Playgrounds), [Grantham Point](https://www.mountdora.gov/facilities/facility/details/Grantham-Point-%208), [Palm Island city photo gallery](https://www.mountdora.gov/SlideShow.aspx?AID=12&AN=Palm+Island+Park), and [Lakeside Inn description](https://lakeside-inn.com/about-us/). The hotel confirms a yellow/white building group and veranda; city sources confirm the park facilities and wooden boardwalk. Photos are reference only; no photograph or map screenshot is embedded as a material/terrain texture. Precise site claims rely on the architect's geodata rather than unrelated web geocodes.

`tools/prepare.py PINNED_NAUTILUS_REPO VERIFIED_GEODATA_DIR` reads immutable Git objects, preserves notices/bytes, and reproduces the subset. No donor scripts or dirty worker modules are run. Native renderer examples, resource checks and a concrete workshop shortcomings report follow in the same draft PR. Art ownership is `maps/mount-dora/art/**`, this directory and the focused art test only.
