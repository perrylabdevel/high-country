# Audit pass 06

**Grader model: `haiku`** (provider: claude, temperature 0)

Captures: 32 · Generated: 2026-08-16T00:13:34.206Z
Capture backend: `webgpu` · adapter: WebGPUBackend · antialias: true

## Scores

| Image | Criterion | Score | Note |
|---|---|---|---|
| badlands-golden.png | U1 | 1 | Ground is bare dirt throughout the near field with no visible grass cover; entire scene reads as untextured earth terrain. |
| badlands-golden.png | U2 | 3 | Ground texture exists but is subtle and diffuse; does not clearly read as human-scale detail against the terrain scale. |
| badlands-golden.png | U3 | 4 |  |
| badlands-golden.png | U4 | 4 |  |
| badlands-golden.png | U5 | 4 |  |
| badlands-golden.png | U6 | 4 |  |
| badlands-golden.png | D1 | 2 | No visible rock outcrops or clear striation; terrain reads as primarily eroded soil rather than exposed layered badlands rock formations. |
| badlands-golden.png | D2 | 2 | Slopes and undulation are present but rock does not clearly dominate; terrain appears soil-driven rather than exposing rock structure. |
| badlands-golden.png | D3 | 5 |  |
| badlands-golden.png | G1 | — | n/a |
| badlands-midday.png | U1 | 2 | Near field is bare brown dirt with no visible grass cover; entirely untextured earth tones dominate the foreground where grass should establish the biome. |
| badlands-midday.png | U2 | 4 |  |
| badlands-midday.png | U3 | 4 |  |
| badlands-midday.png | U4 | 5 |  |
| badlands-midday.png | U5 | 4 |  |
| badlands-midday.png | U6 | 4 |  |
| badlands-midday.png | D1 | 4 |  |
| badlands-midday.png | D2 | 4 |  |
| badlands-midday.png | D3 | 5 |  |
| badlands-midday.png | G1 | — | n/a |
| burn-golden.png | U1 | 1 | No grass visible; criterion requires grass cover, but bare textured ground is appropriate for a burn biome |
| burn-golden.png | U2 | 4 | Ground texture visible and appropriate in scale; no obvious repeating grid or smeared wash |
| burn-golden.png | U3 | 5 |  |
| burn-golden.png | U4 | 4 | Stumps and logs sit on ground; minor alignment questions on some distant small objects |
| burn-golden.png | U5 | 4 | Golden hour lighting with warm tones and visible directional shadows; shadows somewhat subtle |
| burn-golden.png | U6 | 5 | Distant stumps and mountain silhouettes read clearly and are not collapsed or smeared |
| burn-golden.png | B1 | 5 | Multiple charred standing trunks throughout, no canopy; ground visibly darkened to reddish-brown char |
| burn-golden.png | B2 | 4 | Hazy/smoky atmosphere visible in mid-distance; appears anchored to burned landscape |
| burn-golden.png | G1 | — | n/a |
| burn-midday.png | U1 | 3 | Near field shows burnt reddish earth (appropriate for burn), but unburnt areas show patchy bare ground texture rather than continuous grass cover before thinning with distance. |
| burn-midday.png | U2 | 4 |  |
| burn-midday.png | U3 | 3 | The burnt area boundary is somewhat too geometric and regular; transitions between burnt ground and unburnt areas appear cleaner than natural noise-broken irregularity. |
| burn-midday.png | U4 | 4 |  |
| burn-midday.png | U5 | 4 |  |
| burn-midday.png | U6 | 4 |  |
| burn-midday.png | B1 | 5 |  |
| burn-midday.png | B2 | 0 | No smoke plume visible anchored to any ground source. |
| burn-midday.png | G1 | — | n/a |
| cemetery-golden.png | U1 | 2 | Ground is mostly bare dirt with sparse scattered sage brush, not continuous grass cover. Biome reads as semi-arid scrubland, not grassed terrain. |
| cemetery-golden.png | U2 | 4 |  |
| cemetery-golden.png | U3 | 4 |  |
| cemetery-golden.png | U4 | 5 |  |
| cemetery-golden.png | U5 | 4 | Golden hour warmth and directional light present, but shadow length is moderate rather than exceptionally long for sunset angle. |
| cemetery-golden.png | U6 | 4 |  |
| cemetery-golden.png | C1 | 5 |  |
| cemetery-golden.png | G1 | — | n/a |
| cemetery-midday.png | U1 | 4 | Grass coverage is continuous in near and mid-field with good ground texture, though scattered grave markers create visual complexity rather than a clean grassed expanse. |
| cemetery-midday.png | U2 | 4 | Ground texture appears at appropriate human scale with no obvious smearing or visible repeating tile grid. |
| cemetery-midday.png | U3 | 4 | Material transitions between grass and soil appear irregular and noise-broken with no clean straight boundaries visible. |
| cemetery-midday.png | U4 | 4 | Fenced structure and grave markers appear properly grounded with no visible floating gaps or half-buried props. |
| cemetery-midday.png | U5 | 4 | Lighting is appropriate for midday with short, directional shadows; no blown highlights or crushed blacks, though sky is somewhat desaturated. |
| cemetery-midday.png | U6 | 4 | Distant trees and terrain features are identifiable by silhouette shape and are not collapsed into flat cards. |
| cemetery-midday.png | C1 | 5 | Headstones clearly vary in size, spacing, and rotation; scattered randomly rather than arranged in lines. |
| cemetery-midday.png | G1 | — | n/a |
| elPaso-golden.png | U1 | 2 | Ground reads as bare reddish-brown dirt with sparse texture variation, not continuous grass cover; appears desert-like with minimal vegetation. |
| elPaso-golden.png | U2 | 4 | Texture scale is reasonable and human-scale, subtle repetitive patterning visible at distance but not distracting. |
| elPaso-golden.png | U3 | 4 | Ground material is uniform; visible transitions are noise-broken with no clean straight boundaries. |
| elPaso-golden.png | U4 | 5 |  |
| elPaso-golden.png | U5 | 5 |  |
| elPaso-golden.png | U6 | 4 | Distant trees are identifiable by silhouette; slightly stylized but readable and not smeared. |
| elPaso-golden.png | E1 | 3 | Buildings vary in height and arrangement, creating partial settlement character, but structures are very geometric and box-like rather than organic. |
| elPaso-golden.png | G1 | — | n/a |
| elPaso-midday.png | U1 | 2 | Ground is predominantly bare brown dirt in near field; minimal grass coverage where continuous grass should be present. |
| elPaso-midday.png | U2 | 2 | Ground texture shows visible repeating ridge/crack pattern that reads smeared and tiled rather than natural human-scale variation. |
| elPaso-midday.png | U3 | 1 | Terrain shows clear, straight geometric boundaries and seams between material zones rather than noise-broken irregular transitions. |
| elPaso-midday.png | U4 | 4 |  |
| elPaso-midday.png | U5 | 4 |  |
| elPaso-midday.png | U6 | 4 |  |
| elPaso-midday.png | E1 | 4 |  |
| elPaso-midday.png | G1 | — | n/a |
| fortGrant-golden.png | U1 | 4 | Continuous ground cover with small rocks and varied brown tones throughout; texture is slightly sparse/minimal close to fort walls but not bare dirt. |
| fortGrant-golden.png | U2 | 4 | Texture scale is appropriate for 1.62m eye height; rock and detail sizes read correctly against the fort structure. |
| fortGrant-golden.png | U3 | 4 | Material transitions are irregular and noise-broken; no visible hard straight boundaries between ground types. |
| fortGrant-golden.png | U4 | 5 |  |
| fortGrant-golden.png | U5 | 5 |  |
| fortGrant-golden.png | U6 | 4 | Distant hills and scattered trees are identifiable by shape; minor softness from atmospheric perspective is appropriate and doesn't read as popping or cards. |
| fortGrant-golden.png | F1 | 5 |  |
| fortGrant-golden.png | F2 | 5 |  |
| fortGrant-golden.png | G1 | — | No distinct gravel road visible in this frame; only continuous ground texture. |
| fortGrant-midday.png | U1 | 1 | Ground is predominantly bare dirt and gravel throughout the near field with minimal grass; no continuous grass cover visible that thins with distance. |
| fortGrant-midday.png | U2 | 4 | Ground texture detail appears human-scale with scattered small rocks and pebbles; no obvious repeating grid or smeared wash. |
| fortGrant-midday.png | U3 | 4 | Material transitions between dirt patches appear irregular and noise-broken; no clean straight boundaries visible. |
| fortGrant-midday.png | U4 | 4 | Fort walls and interior structures all meet the ground with no visible gaps or floating objects. |
| fortGrant-midday.png | U5 | 4 | Shadows visible and directional from high sun position; exposure is appropriate for midday without blown highlights or crushed blacks. |
| fortGrant-midday.png | U6 | 4 | Distant scattered trees and terrain features on hills maintain readable silhouettes; no smearing or popping. |
| fortGrant-midday.png | F1 | 3 | Four walls enclose a courtyard, but no distinct centered gate structure is visible in the opening. |
| fortGrant-midday.png | F2 | 5 | Multiple interior structures present: tan rectangular building and red-roofed building inside the walls. |
| fortGrant-midday.png | G1 | — | n/a |
| huntingCabin-golden.png | U1 | 1 | Ground is predominantly bare tan/brown dirt with scattered sparse vegetation tufts; no continuous grass cover in the near field. |
| huntingCabin-golden.png | U2 | 4 |  |
| huntingCabin-golden.png | U3 | 2 | Road edge against the ground reads as a fairly clean, defined boundary rather than noise-broken and irregular. |
| huntingCabin-golden.png | U4 | 5 |  |
| huntingCabin-golden.png | U5 | 4 |  |
| huntingCabin-golden.png | U6 | 4 |  |
| huntingCabin-golden.png | H1 | 3 | Cabin shows one story, pitched roof, and door, but no visible chimney from this camera angle. |
| huntingCabin-golden.png | G1 | 3 | Road center is darker and smoother than margins, showing wheel-track wear, but the edges are too defined rather than ragged and noise-broken. |
| huntingCabin-midday.png | U1 | 3 | Significant bare dirt dominates the immediate near field around the cabin; grass coverage becomes prominent only in mid and far field rather than continuous from foreground. |
| huntingCabin-midday.png | U2 | 4 |  |
| huntingCabin-midday.png | U3 | 4 |  |
| huntingCabin-midday.png | U4 | 5 |  |
| huntingCabin-midday.png | U5 | 4 |  |
| huntingCabin-midday.png | U6 | 4 |  |
| huntingCabin-midday.png | H1 | 5 |  |
| huntingCabin-midday.png | G1 | 4 |  |
| ironValley-golden.png | U1 | 1 | Ground is predominantly bare dirt with no visible grass cover in the near field; entire foreground reads as untextured, unvegetated soil. |
| ironValley-golden.png | U2 | 2 | Ground texture appears as uniform low-frequency wash lacking human-scale detail variation. |
| ironValley-golden.png | U3 | 4 |  |
| ironValley-golden.png | U4 | 4 |  |
| ironValley-golden.png | U5 | 3 | Shadows are present and directional, but overall image is heavily desaturated and lacks the warmth and color intensity expected of golden-hour lighting. |
| ironValley-golden.png | U6 | 3 | Distant structures are visible as silhouettes but quite small and lack distinct readability; mid-distance details are somewhat obscured. |
| ironValley-golden.png | I1 | 2 | Red rectangular objects and distant structures are present but do not clearly read as identifiable headframe, stamp mill, or tailings in a coherent industrial arrangement. |
| ironValley-golden.png | I2 | 2 | Rust color is present on the red objects but material distinction between rust, iron, and timber is not clearly readable. |
| ironValley-golden.png | G1 | — | n/a |
| ironValley-midday.png | U1 | 1 | Near field shows bare brown dirt rather than continuous grass cover; far field is progressively greener, opposite of required gradient. |
| ironValley-midday.png | U2 | 4 |  |
| ironValley-midday.png | U3 | 2 | The road path has relatively clean, straight edges against the terrain rather than noise-broken irregular transitions. |
| ironValley-midday.png | U4 | 4 |  |
| ironValley-midday.png | U5 | 4 |  |
| ironValley-midday.png | U6 | 3 | Distant structures are readable by silhouette but extremely small and lack detail clarity at this distance. |
| ironValley-midday.png | I1 | 3 | White tailings cones and possible distant headframes are present but a clear stamp mill is not identifiable. |
| ironValley-midday.png | I2 | 3 | Brown structures show rusty coloring but material distinction between rust, iron, and timber is not clearly readable. |
| ironValley-midday.png | G1 | 2 | Road edges are relatively straight and clean rather than ragged noise-broken edges; wheel-track center is not visibly distinct. |
| lakeMercy-golden.png | U1 | 3 | Near field is predominantly water; insufficient ground/grass visibility in immediate zone |
| lakeMercy-golden.png | U2 | 4 |  |
| lakeMercy-golden.png | U3 | 3 | Island/water boundary is visible but appears smoother than noise-broken; material transitions underexaggerated |
| lakeMercy-golden.png | U4 | 5 |  |
| lakeMercy-golden.png | U5 | 2 | Sky is blown out with crushed highlights; overexposed for golden hour despite warm landscape tones |
| lakeMercy-golden.png | U6 | 4 |  |
| lakeMercy-golden.png | L1 | 0 | Water is almost entirely black/uniform with no visible depth-based color gradient from shore to center |
| lakeMercy-golden.png | L2 | 0 | Water surface appears uniformly dark with no visible wave patterns, ripples, or two-scale surface motion detail |
| lakeMercy-golden.png | L3 | 1 | No visible foam, spray, or texture where water meets the island shore |
| lakeMercy-golden.png | L4 | — | n/a |
| lakeMercy-golden.png | G1 | — | n/a |
| lakeMercy-midday.png | U1 | 2 | Visible ground in the distance is bare tan/beige earth, not grass-covered; no continuous grass cover visible in any accessible near-field areas. |
| lakeMercy-midday.png | U2 | 3 | Distant trees provide some scale reference, but most visible ground is far away and lacks close-range detail to fully assess texture believability. |
| lakeMercy-midday.png | U3 | 2 | Clean straight horizontal line where ground meets water with no noise-broken irregular transition. |
| lakeMercy-midday.png | U4 | 4 | Dock and rocks sit properly at the water plane with no visible floating or sinking. |
| lakeMercy-midday.png | U5 | 4 | Midday lighting is appropriate with directional shadows visible on dock structures; no blown highlights or crushed blacks. |
| lakeMercy-midday.png | U6 | 3 | Distant pine trees on horizon are small but readable by shape as individual trees; satisfactory at this distance but very minimal detail. |
| lakeMercy-midday.png | L1 | 1 | Water is uniformly very dark (nearly black) with no visible shift from pale at shore to saturated at depth. |
| lakeMercy-midday.png | L2 | 2 | Water surface appears mostly flat and uniform; only faint undulations visible, no clear two-scale surface motion detail. |
| lakeMercy-midday.png | L3 | 1 | No foam visible where water meets dock or shoreline. |
| lakeMercy-midday.png | L4 | 4 | Dock sits correctly at the water plane, neither floating nor submerged. |
| lakeMercy-midday.png | G1 | — | n/a |
| mission-golden.png | U1 | 1 | Ground is bare reddish-brown dirt with textured detail but no visible grass cover. |
| mission-golden.png | U2 | 4 |  |
| mission-golden.png | U3 | 4 |  |
| mission-golden.png | U4 | 5 |  |
| mission-golden.png | U5 | 4 |  |
| mission-golden.png | U6 | 3 | Distant features are identifiable by shape but quite small and hazy at this distance. |
| mission-golden.png | M1 | — | No timber visible in frame for comparison. |
| mission-golden.png | M2 | 4 |  |
| mission-golden.png | G1 | — | n/a |
| mission-midday.png | U1 | 2 | Ground is continuous dirt but entirely lacks grass cover; appears as pure desert/arid biome with no vegetation texture. |
| mission-midday.png | U2 | 4 |  |
| mission-midday.png | U3 | 4 |  |
| mission-midday.png | U4 | 5 |  |
| mission-midday.png | U5 | 4 | Shadows present and directional for high sun; sky is very washed out but consistent with midday brightness. |
| mission-midday.png | U6 | 4 |  |
| mission-midday.png | M1 | 3 | Adobe color reads distinctly from black roof, but lacks surface detail texture to strongly distinguish adobe as a material. |
| mission-midday.png | M2 | 1 | Bell tower is centered on the roof, not positioned on the facade as a mission church tower should be. |
| mission-midday.png | G1 | 2 | Wheel tracks visible but road edges are not clearly ragged and noise-broken; transition to grass/surrounding is too clean. |
| northernPines-golden.png | U1 | 2 | Ground is predominantly bare tan dirt in the near field with sparse scattered vegetation dots, not continuous grass cover. |
| northernPines-golden.png | U2 | 4 |  |
| northernPines-golden.png | U3 | 2 | Road-to-ground transition is a clean, relatively straight boundary rather than noise-broken and irregular. |
| northernPines-golden.png | U4 | 4 |  |
| northernPines-golden.png | U5 | 4 |  |
| northernPines-golden.png | U6 | 3 | Distant trees are identifiable by conical silhouette but somewhat merged and smeared together on the horizon. |
| northernPines-golden.png | P1 | 4 |  |
| northernPines-golden.png | P2 | 3 | Canopy foliage is partially transparent; sky and background are visible through the canopy in several places. |
| northernPines-golden.png | P3 | 4 |  |
| northernPines-golden.png | P4 | 3 | Trees read as scattered forest rather than dense stand; spacing is clearly visible between individuals. |
| northernPines-golden.png | P5 | 4 |  |
| northernPines-golden.png | G1 | 2 | Road edges are relatively clean and straight rather than ragged and noise-broken against the surrounding ground. |
| northernPines-midday.png | U1 | 5 | Continuous grass cover in near field thinning believably with distance; no bare dirt expanses. |
| northernPines-midday.png | U2 | 4 | Human-scale ground detail with visible individual grass clumps and rocks; no obvious repeating grid, though texture could be richer. |
| northernPines-midday.png | U3 | 4 | Grass-dirt transitions show noise-breaking but could be more irregular and ragged. |
| northernPines-midday.png | U4 | 5 | All trees and objects properly grounded; no gaps or misalignment. |
| northernPines-midday.png | U5 | 5 | Shadows present and directional for midday sun; natural brightness with no blown highlights or crushed blacks. |
| northernPines-midday.png | U6 | 5 | Distant trees identifiable by conical silhouettes; no smearing, popping, or flat-card collapse. |
| northernPines-midday.png | P1 | 4 | Conical shapes with tapered tops visible; tiered branch structure present but could be more pronounced in mid-ground trees. |
| northernPines-midday.png | P2 | 5 | Dense foliage fully occludes background; horizon not visible through canopies. |
| northernPines-midday.png | P3 | 4 | Bark texture and relief visible on trunks; could have more detailed surface variation. |
| northernPines-midday.png | P4 | 5 | Reads as a dense forest stand with proper tree spacing; not scattered saplings. |
| northernPines-midday.png | P5 | 5 | Tree heights believable against 1.62 m eye height and landscape scale. |
| northernPines-midday.png | G1 | 4 | Road edges show some irregularity and center track is slightly more defined than loose margins, but edges could be more ragged and noise-broken. |
| overlook-golden.png | U1 | 3 | Near field has scattered grass tufts creating a speckled appearance rather than continuous ground cover; coverage thins noticeably toward horizon but density in foreground is sparse. |
| overlook-golden.png | U2 | 4 |  |
| overlook-golden.png | U3 | 4 |  |
| overlook-golden.png | U4 | 5 |  |
| overlook-golden.png | U5 | 5 |  |
| overlook-golden.png | U6 | 4 |  |
| overlook-golden.png | O1 | 5 |  |
| overlook-golden.png | O2 | 4 |  |
| overlook-golden.png | G1 | 4 |  |
| overlook-midday.png | U1 | 4 |  |
| overlook-midday.png | U2 | 4 |  |
| overlook-midday.png | U3 | 3 | Brown disturbed ground area shows relatively defined material boundary rather than fully noise-broken irregular transitions. |
| overlook-midday.png | U4 | 5 |  |
| overlook-midday.png | U5 | 4 |  |
| overlook-midday.png | U6 | 4 |  |
| overlook-midday.png | O1 | 4 |  |
| overlook-midday.png | O2 | 4 |  |
| overlook-midday.png | G1 | — | n/a |
| ranch-golden.png | U1 | 2 | Ground is predominantly bare dirt with only sparse, scattered grass tufts; lacks continuous ground cover in the near field |
| ranch-golden.png | U2 | 4 |  |
| ranch-golden.png | U3 | 4 |  |
| ranch-golden.png | U4 | 5 |  |
| ranch-golden.png | U5 | 5 |  |
| ranch-golden.png | U6 | 4 |  |
| ranch-golden.png | R1 | 4 |  |
| ranch-golden.png | R2 | 4 |  |
| ranch-golden.png | R3 | — | Porch posts and attached roof not discernible from this distance; closer approach required |
| ranch-golden.png | R4 | — | Chimney structure not clear from this distance; closer approach required |
| ranch-golden.png | R5 | — | Door too distant to assess scale against eye height reference; closer approach required |
| ranch-golden.png | R6 | 2 | Barn is a simplified box with no visible gable orientation detail, and no windmill visible in frame |
| ranch-golden.png | G1 | 3 | Road edges are ragged but the wheel-track center smoothness texture difference is not clearly visible |
| ranch-midday.png | U1 | 2 | Wide expanses of bare dirt and gravel dominate the near field; grass is scattered in isolated patches rather than reading as continuous ground cover where it thins with distance. |
| ranch-midday.png | U2 | 4 |  |
| ranch-midday.png | U3 | 4 |  |
| ranch-midday.png | U4 | 5 |  |
| ranch-midday.png | U5 | 4 |  |
| ranch-midday.png | U6 | 4 |  |
| ranch-midday.png | R1 | 2 | The main house reads as a single rectangular block rather than a clear L-plan with a two-story main block and distinct lower kitchen ell. |
| ranch-midday.png | R2 | 4 |  |
| ranch-midday.png | R3 | 4 |  |
| ranch-midday.png | R4 | 4 |  |
| ranch-midday.png | R5 | — | Door not clearly visible at this distance and angle; closer view needed to assess scale against 1.62m eye height. |
| ranch-midday.png | R6 | 4 |  |
| ranch-midday.png | G1 | 4 |  |
| silverCreek-golden.png | U1 | 1 | Near field is predominantly bare reddish dirt with no visible grass cover; only distant background shows possible sparse tan vegetation. |
| silverCreek-golden.png | U2 | 4 |  |
| silverCreek-golden.png | U3 | 4 |  |
| silverCreek-golden.png | U4 | 4 |  |
| silverCreek-golden.png | U5 | 4 |  |
| silverCreek-golden.png | U6 | 4 |  |
| silverCreek-golden.png | S1 | 2 | Buildings are oriented at inconsistent angles rather than facing a shared street direction; arrangement reads scattered rather than aligned. |
| silverCreek-golden.png | S2 | 3 | Left building has visible roof above the main wall, breaking the false-front plane; central buildings show better false-front integration. |
| silverCreek-golden.png | S3 | — | Church steeple not clearly visible or identifiable from this camera position. |
| silverCreek-golden.png | S4 | 0 | No raised boardwalk visible; buildings sit directly on dirt ground. |
| silverCreek-golden.png | S5 | 4 |  |
| silverCreek-golden.png | G1 | 2 | Central road area shows darker/smoother center with lighter edges suggesting wear pattern, but edges are not visibly ragged or noise-broken. |
| silverCreek-midday.png | U1 | 1 | Near field is bare gravel with no grass cover. |
| silverCreek-midday.png | U2 | 4 |  |
| silverCreek-midday.png | U3 | 2 | Transitions between foreground gravel and background show relatively clean, straight boundaries rather than noise-broken irregular edges. |
| silverCreek-midday.png | U4 | 4 |  |
| silverCreek-midday.png | U5 | 4 |  |
| silverCreek-midday.png | U6 | 4 |  |
| silverCreek-midday.png | S1 | 2 | Buildings face different angles and appear scattered rather than aligned to form a legible street corridor. |
| silverCreek-midday.png | S2 | 1 | No visible false fronts on the buildings; they appear as simple solid boxes. |
| silverCreek-midday.png | S3 | — | No church visible in frame. |
| silverCreek-midday.png | S4 | 1 | No raised boardwalk visible; buildings sit directly on the same gravel ground. |
| silverCreek-midday.png | S5 | 4 |  |
| silverCreek-midday.png | G1 | 2 | Road edges appear relatively clean rather than ragged and noise-broken; no clear smoother center track. |
| timberCamp-golden.png | U1 | 2 | Near field is predominantly bare brown dirt with only sparse grass tufts; grass does not read as continuous cover in the foreground where it matters most. |
| timberCamp-golden.png | U2 | 4 | Ground texture scale is appropriate to eye height; no obvious tiling grid or excessive wash. |
| timberCamp-golden.png | U3 | 2 | Road edge against terrain reads as a clean, straight boundary rather than noise-broken and irregular. |
| timberCamp-golden.png | U4 | 4 | All objects contact the ground; no floating or sinking visible. |
| timberCamp-golden.png | U5 | 4 | Golden-hour warm tone is present with visible directional shadows; exposure is balanced without blown or crushed extremes. |
| timberCamp-golden.png | U6 | 4 | Distant trees are identifiable by their silhouettes as pines; no smearing or collapse into flat cards. |
| timberCamp-golden.png | T1 | 5 | Cut stumps, felled logs, and scattered lumber clearly read as an active timber site. |
| timberCamp-golden.png | T2 | 2 | Structures present but lack visible pitched roofs and doors; appear as simple boxes from this viewing angle. |
| timberCamp-golden.png | G1 | 2 | Road edges are clean and straight rather than ragged and noise-broken against surrounding terrain. |
| timberCamp-midday.png | U1 | 4 | Grass covers the near field with visible stones mixed in; cleared earth area in mid-field is textured, not untextured bare dirt. |
| timberCamp-midday.png | U2 | 4 | Ground detail is appropriately scaled against the logs and structures; no visible tiling grids or smeared wash. |
| timberCamp-midday.png | U3 | 3 | Boundary between grassy area and cleared bare earth is relatively clean and defined, not noise-broken and irregular as required. |
| timberCamp-midday.png | U4 | 5 | All objects—buildings, logs, tent, and props—sit properly on the ground with no gaps or floating/sinking. |
| timberCamp-midday.png | U5 | 4 | Shadows are present and directional beneath structures; lighting appears correct for high midday sun without blown highlights or crushed blacks. |
| timberCamp-midday.png | U6 | 4 | Distant trees are identifiable by conical silhouette; forest reads as forest and does not smear or collapse into flat cards. |
| timberCamp-midday.png | T1 | 3 | Felled logs are present and scattered, but cut stumps are not clearly visible; reads more as logistics area than active cutting site. |
| timberCamp-midday.png | T2 | 2 | Structures are simple box shapes without clearly visible pitched roofs or doors; read as generic storage boxes rather than buildings. |
| timberCamp-midday.png | G1 | — | n/a |
| tribal-golden.png | U1 | 2 | Ground shows reddish-brown bare soil with sparse scattered vegetation/rocks rather than continuous grass cover in the near field. |
| tribal-golden.png | U2 | 4 |  |
| tribal-golden.png | U3 | 4 |  |
| tribal-golden.png | U4 | 5 |  |
| tribal-golden.png | U5 | 5 |  |
| tribal-golden.png | U6 | 4 |  |
| tribal-golden.png | N1 | 4 |  |
| tribal-golden.png | N2 | 4 |  |
| tribal-golden.png | G1 | 4 |  |
| tribal-midday.png | U1 | 3 | Foreground grass is solid, but a large cleared dirt area disrupts continuity where the tipis sit; the biome should show more vegetation in the occupied zone. |
| tribal-midday.png | U2 | 4 |  |
| tribal-midday.png | U3 | 4 |  |
| tribal-midday.png | U4 | 5 |  |
| tribal-midday.png | U5 | 4 |  |
| tribal-midday.png | U6 | 4 |  |
| tribal-midday.png | N1 | 5 |  |
| tribal-midday.png | N2 | 4 |  |
| tribal-midday.png | G1 | 3 | Road/path visible through the scene but wheel-track detail—a visibly smoother, darker center—is not clearly discernible in this frame. |
| westernRange-golden.png | U1 | 2 | Ground is predominantly bare brown soil with sparse scattered vegetation; does not read as continuous grass cover in the near field. |
| westernRange-golden.png | U2 | 4 | Ground detail is appropriately scaled for human perspective; no obvious tiling or smeared wash. |
| westernRange-golden.png | U3 | 4 | Material transitions appear natural and irregular with no visible straight boundaries. |
| westernRange-golden.png | U4 | 4 | Objects meet the ground correctly with no visible floating or sinking. |
| westernRange-golden.png | U5 | 4 | Golden hour lighting evident with warm tones, visible sun near horizon, and directional shadows cast by trees. |
| westernRange-golden.png | U6 | 4 | Distant trees on horizon are clearly identifiable by silhouette and shape. |
| westernRange-golden.png | W1 | 1 | Ground reads as arid brown soil or scrubland, not grassland; lacks the continuous green grass cover expected for this criterion. |
| westernRange-golden.png | W2 | — | n/a |
| westernRange-golden.png | W3 | — | n/a |
| westernRange-golden.png | G1 | — | n/a |
| westernRange-midday.png | U1 | 1 | Ground is predominantly bare dirt with scattered small stones in the near field, not continuous grass cover. |
| westernRange-midday.png | U2 | 4 |  |
| westernRange-midday.png | U3 | 4 |  |
| westernRange-midday.png | U4 | 4 |  |
| westernRange-midday.png | U5 | 4 |  |
| westernRange-midday.png | U6 | 4 |  |
| westernRange-midday.png | W1 | 1 | Biome reads as arid scrubland with bare dirt as dominant ground, not grassland to the horizon. |
| westernRange-midday.png | W2 | — | n/a - no cattle visible in frame |
| westernRange-midday.png | W3 | — | n/a - no fences visible in frame |
| westernRange-midday.png | G1 | — | n/a - no road visible in frame |

## Regressions

- **lakeMercy-golden.png L2: 2 → 0** — Water surface appears uniformly dark with no visible wave patterns, ripples, or two-scale surface motion detail
- **burn-midday.png B2: 1 → 0** — No smoke plume visible anchored to any ground source.
- **lakeMercy-golden.png L1: 1 → 0** — Water is almost entirely black/uniform with no visible depth-based color gradient from shore to center
- **elPaso-midday.png U3: 4 → 1** — Terrain shows clear, straight geometric boundaries and seams between material zones rather than noise-broken irregular transitions.
- **huntingCabin-golden.png U1: 4 → 1** — Ground is predominantly bare tan/brown dirt with scattered sparse vegetation tufts; no continuous grass cover in the near field.
- **badlands-golden.png U1: 2 → 1** — Ground is bare dirt throughout the near field with no visible grass cover; entire scene reads as untextured earth terrain.
- **fortGrant-midday.png U1: 2 → 1** — Ground is predominantly bare dirt and gravel throughout the near field with minimal grass; no continuous grass cover visible that thins with distance.
- **ironValley-golden.png U1: 2 → 1** — Ground is predominantly bare dirt with no visible grass cover in the near field; entire foreground reads as untextured, unvegetated soil.
- **ironValley-midday.png U1: 2 → 1** — Near field shows bare brown dirt rather than continuous grass cover; far field is progressively greener, opposite of required gradient.
- **mission-midday.png M2: 2 → 1** — Bell tower is centered on the roof, not positioned on the facade as a mission church tower should be.
- **silverCreek-golden.png U1: 2 → 1** — Near field is predominantly bare reddish dirt with no visible grass cover; only distant background shows possible sparse tan vegetation.
- **westernRange-midday.png U1: 2 → 1** — Ground is predominantly bare dirt with scattered small stones in the near field, not continuous grass cover.
- **westernRange-midday.png W1: 2 → 1** — Biome reads as arid scrubland with bare dirt as dominant ground, not grassland to the horizon.
- **timberCamp-golden.png T2: 5 → 2** — Structures present but lack visible pitched roofs and doors; appear as simple boxes from this viewing angle.
- **timberCamp-midday.png T2: 5 → 2** — Structures are simple box shapes without clearly visible pitched roofs or doors; read as generic storage boxes rather than buildings.
- **badlands-golden.png D2: 4 → 2** — Slopes and undulation are present but rock does not clearly dominate; terrain appears soil-driven rather than exposing rock structure.
- **elPaso-midday.png U2: 4 → 2** — Ground texture shows visible repeating ridge/crack pattern that reads smeared and tiled rather than natural human-scale variation.
- **huntingCabin-golden.png U3: 4 → 2** — Road edge against the ground reads as a fairly clean, defined boundary rather than noise-broken and irregular.
- **northernPines-golden.png U3: 4 → 2** — Road-to-ground transition is a clean, relatively straight boundary rather than noise-broken and irregular.
- **ranch-golden.png R6: 4 → 2** — Barn is a simplified box with no visible gable orientation detail, and no windmill visible in frame
- **ranch-midday.png U1: 4 → 2** — Wide expanses of bare dirt and gravel dominate the near field; grass is scattered in isolated patches rather than reading as continuous ground cover where it thins with distance.
- **ranch-midday.png R1: 4 → 2** — The main house reads as a single rectangular block rather than a clear L-plan with a two-story main block and distinct lower kitchen ell.
- **timberCamp-golden.png U3: 4 → 2** — Road edge against terrain reads as a clean, straight boundary rather than noise-broken and irregular.
- **ironValley-golden.png U2: 3 → 2** — Ground texture appears as uniform low-frequency wash lacking human-scale detail variation.
- **tribal-golden.png U1: 3 → 2** — Ground shows reddish-brown bare soil with sparse scattered vegetation/rocks rather than continuous grass cover in the near field.
- **northernPines-golden.png P4: 5 → 3** — Trees read as scattered forest rather than dense stand; spacing is clearly visible between individuals.
- **timberCamp-midday.png T1: 5 → 3** — Felled logs are present and scattered, but cut stumps are not clearly visible; reads more as logistics area than active cutting site.
- **badlands-golden.png U2: 4 → 3** — Ground texture exists but is subtle and diffuse; does not clearly read as human-scale detail against the terrain scale.
- **burn-midday.png U1: 4 → 3** — Near field shows burnt reddish earth (appropriate for burn), but unburnt areas show patchy bare ground texture rather than continuous grass cover before thinning with distance.
- **burn-midday.png U3: 4 → 3** — The burnt area boundary is somewhat too geometric and regular; transitions between burnt ground and unburnt areas appear cleaner than natural noise-broken irregularity.
- **fortGrant-midday.png F1: 4 → 3** — Four walls enclose a courtyard, but no distinct centered gate structure is visible in the opening.
- **huntingCabin-golden.png G1: 4 → 3** — Road center is darker and smoother than margins, showing wheel-track wear, but the edges are too defined rather than ragged and noise-broken.
- **huntingCabin-midday.png U1: 4 → 3** — Significant bare dirt dominates the immediate near field around the cabin; grass coverage becomes prominent only in mid and far field rather than continuous from foreground.
- **ironValley-golden.png U6: 4 → 3** — Distant structures are visible as silhouettes but quite small and lack distinct readability; mid-distance details are somewhat obscured.
- **ironValley-midday.png U6: 4 → 3** — Distant structures are readable by silhouette but extremely small and lack detail clarity at this distance.
- **ironValley-midday.png I2: 4 → 3** — Brown structures show rusty coloring but material distinction between rust, iron, and timber is not clearly readable.
- **lakeMercy-golden.png U1: 4 → 3** — Near field is predominantly water; insufficient ground/grass visibility in immediate zone
- **mission-golden.png U6: 4 → 3** — Distant features are identifiable by shape but quite small and hazy at this distance.
- **mission-midday.png M1: 4 → 3** — Adobe color reads distinctly from black roof, but lacks surface detail texture to strongly distinguish adobe as a material.
- **northernPines-golden.png U6: 4 → 3** — Distant trees are identifiable by conical silhouette but somewhat merged and smeared together on the horizon.
- **ranch-golden.png G1: 4 → 3** — Road edges are ragged but the wheel-track center smoothness texture difference is not clearly visible
- **burn-golden.png U4: 5 → 4** — Stumps and logs sit on ground; minor alignment questions on some distant small objects
- **burn-golden.png B2: 5 → 4** — Hazy/smoky atmosphere visible in mid-distance; appears anchored to burned landscape
- **burn-midday.png U4: 5 → 4** — 
- **cemetery-golden.png U5: 5 → 4** — Golden hour warmth and directional light present, but shadow length is moderate rather than exceptionally long for sunset angle.
- **cemetery-midday.png U4: 5 → 4** — Fenced structure and grave markers appear properly grounded with no visible floating gaps or half-buried props.
- **elPaso-midday.png U4: 5 → 4** — 
- **huntingCabin-midday.png U5: 5 → 4** — 
- **huntingCabin-midday.png U6: 5 → 4** — 
- **northernPines-golden.png U4: 5 → 4** — 
- **northernPines-golden.png U5: 5 → 4** — 
- **ranch-midday.png U5: 5 → 4** — 
- **silverCreek-golden.png U5: 5 → 4** — 
- **timberCamp-golden.png U4: 5 → 4** — All objects contact the ground; no floating or sinking visible.
- **timberCamp-golden.png U5: 5 → 4** — Golden-hour warm tone is present with visible directional shadows; exposure is balanced without blown or crushed extremes.
- **timberCamp-golden.png U6: 5 → 4** — Distant trees are identifiable by their silhouettes as pines; no smearing or collapse into flat cards.
- **timberCamp-midday.png U5: 5 → 4** — Shadows are present and directional beneath structures; lighting appears correct for high midday sun without blown highlights or crushed blacks.
- **westernRange-midday.png U4: 5 → 4** — 
- **westernRange-midday.png U6: 5 → 4** — 

## Five worst criteria

1. **burn-midday.png B2 (0)** — No smoke plume visible anchored to any ground source.
1. **lakeMercy-golden.png L1 (0)** — Water is almost entirely black/uniform with no visible depth-based color gradient from shore to center
1. **lakeMercy-golden.png L2 (0)** — Water surface appears uniformly dark with no visible wave patterns, ripples, or two-scale surface motion detail
1. **silverCreek-golden.png S4 (0)** — No raised boardwalk visible; buildings sit directly on dirt ground.
1. **badlands-golden.png U1 (1)** — Ground is bare dirt throughout the near field with no visible grass cover; entire scene reads as untextured earth terrain.

## Could not assess

- badlands-golden.png G1 — n/a
- badlands-midday.png G1 — n/a
- burn-golden.png G1 — n/a
- burn-midday.png G1 — n/a
- cemetery-golden.png G1 — n/a
- cemetery-midday.png G1 — n/a
- elPaso-golden.png G1 — n/a
- elPaso-midday.png G1 — n/a
- fortGrant-golden.png G1 — No distinct gravel road visible in this frame; only continuous ground texture.
- fortGrant-midday.png G1 — n/a
- ironValley-golden.png G1 — n/a
- lakeMercy-golden.png L4 — n/a
- lakeMercy-golden.png G1 — n/a
- lakeMercy-midday.png G1 — n/a
- mission-golden.png M1 — No timber visible in frame for comparison.
- mission-golden.png G1 — n/a
- overlook-midday.png G1 — n/a
- ranch-golden.png R3 — Porch posts and attached roof not discernible from this distance; closer approach required
- ranch-golden.png R4 — Chimney structure not clear from this distance; closer approach required
- ranch-golden.png R5 — Door too distant to assess scale against eye height reference; closer approach required
- ranch-midday.png R5 — Door not clearly visible at this distance and angle; closer view needed to assess scale against 1.62m eye height.
- silverCreek-golden.png S3 — Church steeple not clearly visible or identifiable from this camera position.
- silverCreek-midday.png S3 — No church visible in frame.
- timberCamp-midday.png G1 — n/a
- westernRange-golden.png W2 — n/a
- westernRange-golden.png W3 — n/a
- westernRange-golden.png G1 — n/a
- westernRange-midday.png W2 — n/a - no cattle visible in frame
- westernRange-midday.png W3 — n/a - no fences visible in frame
- westernRange-midday.png G1 — n/a - no road visible in frame

## Verdict

- Rubric coverage: **97%** (minimum 80% — criteria the grader declined to judge count against this; genuine n/a does not)
- This pass clean (all scored ≥4, none ≤2, coverage met): **no**
- Previous pass clean: **no**

CONTINUE
