# Audit pass 09

**Grader model: `haiku`** (provider: claude, temperature 0)

Captures: 32 · Generated: 2026-08-16T02:14:17.186Z
Capture backend: `webgpu` · adapter: GN · antialias: true

## Scores

| Image | Criterion | Score | Note |
|---|---|---|---|
| badlands-golden.png | U1 | 2 | Ground is predominantly bare reddish-brown badlands terrain; no grass cover visible in the near field. |
| badlands-golden.png | U2 | 4 | Ground texture shows reasonable detail without obvious tiling or low-frequency smearing. |
| badlands-golden.png | U3 | 4 | Material transitions appear irregular and noise-broken rather than clean lines. |
| badlands-golden.png | U4 | 4 | Scattered vegetation and objects appear grounded; no obvious floating or sinking. |
| badlands-golden.png | U5 | 4 | Golden hour lighting evident with warm tones, visible sun, and directional shadows; no blown highlights or crushed blacks. |
| badlands-golden.png | U6 | 4 | Distant ridges and scattered vegetation are readable as distinct silhouettes. |
| badlands-golden.png | D1 | 2 | Rock formations lack visible layering or stratification; terrain appears relatively uniform in color and texture. |
| badlands-golden.png | D2 | 2 | Material distribution appears uniform across slopes rather than showing slope-driven rock concentration. |
| badlands-golden.png | D3 | 5 | Vegetation is appropriately sparse, consistent with arid badlands terrain. |
| badlands-golden.png | G1 | — | n/a |
| badlands-midday.png | U1 | 2 | Near field is predominantly bare earth without visible grass cover |
| badlands-midday.png | U2 | 4 |  |
| badlands-midday.png | U3 | 4 |  |
| badlands-midday.png | U4 | 5 |  |
| badlands-midday.png | U5 | 4 |  |
| badlands-midday.png | U6 | 4 |  |
| badlands-midday.png | D1 | 5 |  |
| badlands-midday.png | D2 | 5 |  |
| badlands-midday.png | D3 | 5 |  |
| badlands-midday.png | G1 | — | n/a |
| burn-golden.png | U1 | 2 | Near field ground is predominantly bare, darkened burned earth with minimal grass cover; criterion requires continuous grass in near field, thinning with distance. |
| burn-golden.png | U2 | 4 | Ground texture has believable detail variation appropriate to ash and burned soil; no obvious smearing or tiling. |
| burn-golden.png | U3 | 4 | Material transitions between burned and grassy areas show natural noise and irregularity; no clean straight boundaries visible. |
| burn-golden.png | U4 | 4 | Charred stumps and wooden structures all contact ground; no gaps or half-buried objects. |
| burn-golden.png | U5 | 4 | Golden hour lighting with warm tone, directional shadows from tree stumps, no blown highlights or crushed blacks; full visual warmth appropriate to sunset angle. |
| burn-golden.png | U6 | 4 | Distant tree stumps read as distinct silhouettes against horizon; individual shapes are identifiable rather than smeared or collapsed. |
| burn-golden.png | B1 | 5 | Clear burn read: numerous charred standing trunks with no canopy throughout scene; ground visibly darkened as burned earth. |
| burn-golden.png | B2 | 2 | Dark shapes visible in upper sky but they do not appear clearly anchored to ground sources or read as distinct smoke plume. |
| burn-golden.png | G1 | — | n/a - no gravel road visible in this frame. |
| burn-midday.png | U1 | 2 | Near field is entirely bare charred earth; grass only appears beyond the burn area in the far distance, not in the near field as required. |
| burn-midday.png | U2 | 3 | Ground texture is relatively flat and lacks human-scale detail variation; appears simplified rather than believably detailed. |
| burn-midday.png | U3 | 2 | Transition between darker burned center and lighter surrounding area shows relatively clean, straight boundaries rather than noise-broken irregular edges. |
| burn-midday.png | U4 | 4 |  |
| burn-midday.png | U5 | 4 |  |
| burn-midday.png | U6 | 4 |  |
| burn-midday.png | B1 | 5 |  |
| burn-midday.png | B2 | 5 |  |
| burn-midday.png | G1 | — | n/a |
| cemetery-golden.png | U1 | 2 | Ground is scattered bushes and bare reddish dirt in the near field, not continuous grass cover. |
| cemetery-golden.png | U2 | 4 |  |
| cemetery-golden.png | U3 | 4 |  |
| cemetery-golden.png | U4 | 5 |  |
| cemetery-golden.png | U5 | 4 |  |
| cemetery-golden.png | U6 | 4 |  |
| cemetery-golden.png | C1 | 4 |  |
| cemetery-golden.png | G1 | — | n/a |
| cemetery-midday.png | U1 | 3 | Near field shows significant interspersed bare tan earth; grass cover is not continuous but scattered in patches. |
| cemetery-midday.png | U2 | 4 | Ground texture reads at believable human scale with good detail; no obvious repeating grid patterns detected. |
| cemetery-midday.png | U3 | 4 | Transitions between grass and bare earth are mostly irregular; some areas could show more noise-broken variation. |
| cemetery-midday.png | U4 | 5 |  |
| cemetery-midday.png | U5 | 4 | Midday lighting with visible directional shadows; warm tone is appropriate, though shadows could be more pronounced at this sun angle. |
| cemetery-midday.png | U6 | 5 |  |
| cemetery-midday.png | C1 | 5 |  |
| cemetery-midday.png | G1 | — | n/a |
| elPaso-golden.png | U1 | — | n/a - El Paso is desert where grass cover should not be present |
| elPaso-golden.png | U2 | 4 |  |
| elPaso-golden.png | U3 | 4 |  |
| elPaso-golden.png | U4 | 5 |  |
| elPaso-golden.png | U5 | 4 |  |
| elPaso-golden.png | U6 | 4 |  |
| elPaso-golden.png | E1 | 5 |  |
| elPaso-golden.png | G1 | — | n/a - No distinct road with identifiable edges visible in frame |
| elPaso-midday.png | U1 | 1 | Ground is bare textured earth with no visible grass or vegetation in the near field; the biome should show ground cover |
| elPaso-midday.png | U2 | 4 |  |
| elPaso-midday.png | U3 | 4 |  |
| elPaso-midday.png | U4 | 5 |  |
| elPaso-midday.png | U5 | 5 |  |
| elPaso-midday.png | U6 | 4 |  |
| elPaso-midday.png | E1 | 4 |  |
| elPaso-midday.png | G1 | — | n/a - no distinct gravel road visible in frame |
| fortGrant-golden.png | U1 | 2 | Near field ground is sparse shrubs on brown soil, not continuous grass cover. |
| fortGrant-golden.png | U2 | 4 |  |
| fortGrant-golden.png | U3 | 4 |  |
| fortGrant-golden.png | U4 | 4 |  |
| fortGrant-golden.png | U5 | 4 |  |
| fortGrant-golden.png | U6 | 4 |  |
| fortGrant-golden.png | F1 | 4 |  |
| fortGrant-golden.png | F2 | 5 |  |
| fortGrant-golden.png | G1 | — | n/a |
| fortGrant-midday.png | U1 | 2 | Ground coverage is sparse and patchy; exposed brown soil dominates the near field with scattered vegetation tufts rather than reading as continuous grass cover. |
| fortGrant-midday.png | U2 | 4 | Texture detail is appropriately scaled; individual grass tufts and pebbles are visible without obvious tiling artifacts or low-frequency wash. |
| fortGrant-midday.png | U3 | 2 | A fairly straight horizontal transition line is visible between the darker foreground soil and lighter background, particularly prominent on the left side of the frame. |
| fortGrant-midday.png | U4 | 4 | Fort structures and interior buildings sit properly on the ground with no visible floating or gaps at the base. |
| fortGrant-midday.png | U5 | 4 | Midday lighting is appropriate with short shadows; exposure is neutral without blown highlights or crushed blacks. |
| fortGrant-midday.png | U6 | 4 | Distant elements are readable by shape—crosses and structures visible in mid-distance—though with reduced clarity appropriate to distance. |
| fortGrant-midday.png | F1 | 3 | Rectangular enclosure with walls is evident, but from this angle cannot verify four complete walls and centered gate placement. |
| fortGrant-midday.png | F2 | 5 | Interior clearly populated with distinct structures: cream building, reddish-roofed structure, and other interior elements visible. |
| fortGrant-midday.png | G1 | — | n/a |
| huntingCabin-golden.png | U1 | 2 | Grass appears as scattered tufts on bare reddish-brown earth rather than continuous cover; large expanses of bare soil dominate the near field. |
| huntingCabin-golden.png | U2 | 4 |  |
| huntingCabin-golden.png | U3 | 2 | Road edges are relatively straight and clean boundaries against grass, not ragged or noise-broken as required. |
| huntingCabin-golden.png | U4 | 4 |  |
| huntingCabin-golden.png | U5 | 4 |  |
| huntingCabin-golden.png | U6 | 4 |  |
| huntingCabin-golden.png | H1 | 3 | One-story pitched-roof form is correct, but door and chimney are not clearly visible from this camera angle. |
| huntingCabin-golden.png | G1 | 2 | Road edges are too clean and straight; they lack the ragged, noise-broken appearance required and read as distinct material boundaries. |
| huntingCabin-midday.png | U1 | 4 | Grass cover is continuous in near and mid field with reasonable density and thinning at distance; no large bare dirt expanses. |
| huntingCabin-midday.png | U2 | 2 | Grass sprites are arranged in a visible repeating grid pattern across the ground, evident as regularly-spaced dark and light dots. |
| huntingCabin-midday.png | U3 | 1 | Road edges form clean, geometrically straight lines against grass; transitions lack noise-breaking and irregularity. |
| huntingCabin-midday.png | U4 | 4 | Cabin and props sit properly on ground; no visible gaps or half-buried elements. |
| huntingCabin-midday.png | U5 | 4 | Shadows are present and short/directional for midday sun; no blown highlights or crushed blacks; lighting reads correctly. |
| huntingCabin-midday.png | U6 | 4 | Distant trees read as distinct silhouettes with identifiable shapes; no smearing or pop-in artifacts. |
| huntingCabin-midday.png | H1 | 2 | Structure has a chimney and one story but lacks a visible pitched roof (reads as flat-topped box) and door entrance is not apparent. |
| huntingCabin-midday.png | G1 | 1 | Road edges are clean, straight geometric boundaries with no ragged or noise-broken transitions; wheel-track depth not visually distinct. |
| ironValley-golden.png | U1 | 1 | Ground is predominantly bare, untextured dark dirt with sparse crosses and objects; lacks continuous grass cover. |
| ironValley-golden.png | U2 | 2 | Ground texture is subtle and undifferentiated; does not read as human-scale detail at 1.62 m eye height. |
| ironValley-golden.png | U3 | 4 |  |
| ironValley-golden.png | U4 | 4 |  |
| ironValley-golden.png | U5 | 4 |  |
| ironValley-golden.png | U6 | 4 |  |
| ironValley-golden.png | I1 | 1 | Industrial silhouette not identifiable; brown boxes and white cones do not read as headframe, stamp mill, or tailings complex. |
| ironValley-golden.png | I2 | 2 | Color contrast between brown and white elements present but does not clearly read as rust/iron versus timber differentiation. |
| ironValley-golden.png | G1 | — | n/a |
| ironValley-midday.png | U1 | 1 | Near and middle field are dominated by bare brown ground and rocks; grass only visible in far distance, not continuous in near field. |
| ironValley-midday.png | U2 | 4 |  |
| ironValley-midday.png | U3 | 4 |  |
| ironValley-midday.png | U4 | 4 |  |
| ironValley-midday.png | U5 | 4 |  |
| ironValley-midday.png | U6 | 4 |  |
| ironValley-midday.png | I1 | 2 | Shapes present (brown rectangles, white cones) lack clear industrial identity; headframe, stamp mill, and tailings silhouettes are not distinctly recognizable. |
| ironValley-midday.png | I2 | 2 | Materials do not read distinctly; rust and iron do not visually separate from other materials, all reading as generic colored geometry. |
| ironValley-midday.png | G1 | 4 |  |
| lakeMercy-golden.png | U1 | 2 | Distant shore shows sparse, discontinuous vegetation and exposed ground rather than continuous grass cover in the landscape. |
| lakeMercy-golden.png | U2 | 3 | Water ripple pattern shows very uniform, repetitive frequency that suggests procedural tiling rather than natural wave variation. |
| lakeMercy-golden.png | U3 | 4 | Water-to-shore transition appears natural; distant material boundaries are not sharp straight lines. |
| lakeMercy-golden.png | U4 | 5 |  |
| lakeMercy-golden.png | U5 | 4 | Golden hour warmth is present with appropriate directional lighting; directional ripples confirm light direction. |
| lakeMercy-golden.png | U6 | 4 | Distant trees read as distinct silhouettes against sky, not collapsed into flat cards. |
| lakeMercy-golden.png | L1 | 5 |  |
| lakeMercy-golden.png | L2 | 2 | Surface shows only one dominant ripple scale; no visible secondary wave detail superimposed on the primary ripples. |
| lakeMercy-golden.png | L3 | 1 | No visible foam or white water where the water surface meets the shoreline. |
| lakeMercy-golden.png | L4 | 5 |  |
| lakeMercy-golden.png | G1 | — | n/a |
| lakeMercy-midday.png | U1 | 2 | Background terrain reads as bare tan/brown, not continuous grass cover. |
| lakeMercy-midday.png | U2 | — | Ground texture too distant to assess human-scale detail; would need closer camera position. |
| lakeMercy-midday.png | U3 | 2 | Shoreline between water and sand is a clean, straight line, not noise-broken or irregular. |
| lakeMercy-midday.png | U4 | 4 |  |
| lakeMercy-midday.png | U5 | 4 |  |
| lakeMercy-midday.png | U6 | 4 |  |
| lakeMercy-midday.png | L1 | 5 |  |
| lakeMercy-midday.png | L2 | 4 |  |
| lakeMercy-midday.png | L3 | 1 | No visible foam or white water disturbance where water meets the bank. |
| lakeMercy-midday.png | L4 | 4 |  |
| lakeMercy-midday.png | G1 | — | n/a |
| mission-golden.png | U1 | 1 | Ground is predominantly bare reddish-brown dirt with minimal grass cover; wide expanses of untextured soil where biome should be grassed. |
| mission-golden.png | U2 | 4 |  |
| mission-golden.png | U3 | 3 | Material transitions visible but not adequately noise-broken; edges between ground patches lack irregular jagged boundaries. |
| mission-golden.png | U4 | 5 |  |
| mission-golden.png | U5 | 4 | Golden hour warmth and tone present, but shadows are subdued rather than prominent for the lighting angle. |
| mission-golden.png | U6 | 4 |  |
| mission-golden.png | M1 | 5 |  |
| mission-golden.png | M2 | 4 |  |
| mission-golden.png | G1 | — | n/a - no road visible in frame |
| mission-midday.png | U1 | 1 | No grass cover visible; ground is entirely bare dirt. |
| mission-midday.png | U2 | 4 |  |
| mission-midday.png | U3 | 4 |  |
| mission-midday.png | U4 | 5 |  |
| mission-midday.png | U5 | 4 |  |
| mission-midday.png | U6 | 4 |  |
| mission-midday.png | M1 | 4 |  |
| mission-midday.png | M2 | 5 |  |
| mission-midday.png | G1 | — | n/a |
| northernPines-golden.png | U1 | 3 | Grass appears as scattered tufts rather than continuous cover in the near field; significant bare dirt/gravel visible, especially around the road. |
| northernPines-golden.png | U2 | 4 |  |
| northernPines-golden.png | U3 | 4 |  |
| northernPines-golden.png | U4 | 5 |  |
| northernPines-golden.png | U5 | 4 |  |
| northernPines-golden.png | U6 | 4 |  |
| northernPines-golden.png | P1 | 4 |  |
| northernPines-golden.png | P2 | 4 |  |
| northernPines-golden.png | P3 | 4 |  |
| northernPines-golden.png | P4 | 4 |  |
| northernPines-golden.png | P5 | 4 |  |
| northernPines-golden.png | G1 | 4 |  |
| northernPines-midday.png | U1 | 4 | Grass cover is continuous and appropriate, though the sprite-based vegetation creates visible dotted patterns in the near field. |
| northernPines-midday.png | U2 | 4 |  |
| northernPines-midday.png | U3 | 4 |  |
| northernPines-midday.png | U4 | 5 |  |
| northernPines-midday.png | U5 | 4 |  |
| northernPines-midday.png | U6 | 4 |  |
| northernPines-midday.png | P1 | 4 |  |
| northernPines-midday.png | P2 | 4 |  |
| northernPines-midday.png | P3 | 4 |  |
| northernPines-midday.png | P4 | 3 | Trees are distributed at roughly uniform spacing across the landscape rather than organic forest clustering. |
| northernPines-midday.png | P5 | 4 |  |
| northernPines-midday.png | G1 | 4 |  |
| overlook-golden.png | U1 | 4 | Grass cover is dense in the near field and thins appropriately with distance. Coverage is nearly continuous without wide bare expanses, though some areas show sparser distribution. |
| overlook-golden.png | U2 | 4 | Grass tufts appear human-scaled with natural variation; no obvious repeating tiling grid is visible. |
| overlook-golden.png | U3 | 4 | Road edges and grass-to-dirt transitions show irregularity and noise-breaking from vegetation scatter rather than clean straight lines. |
| overlook-golden.png | U4 | 4 | The wagon and all vegetation appear properly grounded with no visible floating or sinking. |
| overlook-golden.png | U5 | 5 | Golden hour lighting is well-realized: warm sky tone, long directional shadows visible on terrain, no blown highlights or crushed blacks. |
| overlook-golden.png | U6 | 4 | Distant trees and structures are identifiable by silhouette and shape; good definition maintained at distance. |
| overlook-golden.png | O1 | 5 | Strong vista composition with clear foreground framing, readable middle distance, and depth to the far horizon. |
| overlook-golden.png | O2 | 4 | Atmospheric haze increases clearly toward horizon with visible color shift and reduced detail in distant terrain. |
| overlook-golden.png | G1 | 4 | Road edges are irregular and noise-broken; the track center is visibly darker and smoother than the loose margins. |
| overlook-midday.png | U1 | 3 | Significant expanses of bare brown/tan ground visible in foreground and midground; grass cover is scattered shrubs rather than continuous. |
| overlook-midday.png | U2 | 4 | Vegetation scatter shows somewhat regular/repetitive placement pattern, minor concern about hand-placed bush distribution. |
| overlook-midday.png | U3 | 2 | Road edges are clean and relatively straight boundaries, especially visible where the brown path meets surrounding terrain; seams are distinct rather than noise-broken. |
| overlook-midday.png | U4 | 5 |  |
| overlook-midday.png | U5 | 3 | Shadows are too long and pronounced for midday sun; sky appears blown out to washed tan; lighting doesn't read as sun high overhead. |
| overlook-midday.png | U6 | 4 | Distant trees remain identifiable by shape but are somewhat softened by haze; no obvious popping or cards. |
| overlook-midday.png | O1 | 5 |  |
| overlook-midday.png | O2 | 4 | Aerial perspective present and readable; horizon is hazier than foreground, could be slightly more pronounced. |
| overlook-midday.png | G1 | 2 | Road edges are too clean and straight; lack the ragged, noise-broken character where path meets grass; edges read as hard boundaries rather than natural transitions. |
| ranch-golden.png | U1 | 3 | Grass cover is spotty; large reddish-brown bare ground patches dominate near field |
| ranch-golden.png | U2 | 4 |  |
| ranch-golden.png | U3 | 3 | Visible clean straight boundaries between grass and dirt areas rather than noise-broken transitions |
| ranch-golden.png | U4 | 5 |  |
| ranch-golden.png | U5 | 5 |  |
| ranch-golden.png | U6 | 4 |  |
| ranch-golden.png | R1 | 2 | Main structure reads as rectangular; L-plan massing with distinct lower kitchen ell not evident |
| ranch-golden.png | R2 | 4 |  |
| ranch-golden.png | R3 | 4 |  |
| ranch-golden.png | R4 | 4 |  |
| ranch-golden.png | R5 | 4 |  |
| ranch-golden.png | R6 | 4 |  |
| ranch-golden.png | G1 | 3 | Road edges present but not fully noise-broken; wheel tracks not distinctly darker or smoother than margins |
| ranch-midday.png | U1 | 2 | Near field shows sparse scattered grass tufts on bare brown soil rather than continuous ground cover |
| ranch-midday.png | U2 | 4 |  |
| ranch-midday.png | U3 | 3 | Road edges show some clean straight boundaries rather than consistently ragged noise-broken transitions |
| ranch-midday.png | U4 | 4 |  |
| ranch-midday.png | U5 | 4 |  |
| ranch-midday.png | U6 | 4 |  |
| ranch-midday.png | R1 | 4 |  |
| ranch-midday.png | R2 | 4 |  |
| ranch-midday.png | R3 | 4 |  |
| ranch-midday.png | R4 | 4 |  |
| ranch-midday.png | R5 | — | Camera distance too far to assess door scale accurately |
| ranch-midday.png | R6 | 3 | Barn gable orientation not clearly discernible from this camera angle |
| ranch-midday.png | G1 | 3 | Road edges are partially ragged but include some relatively clean straight boundaries in places |
| silverCreek-golden.png | U1 | 1 | Foreground and immediate near field are entirely bare dirt/gravel with no grass cover. Vegetation only appears in distant background beyond buildings. |
| silverCreek-golden.png | U2 | 4 |  |
| silverCreek-golden.png | U3 | 3 | Transitions between dirt and distant vegetation are soft but lack crisp noise-broken irregularity in the immediate ground plane. |
| silverCreek-golden.png | U4 | 4 |  |
| silverCreek-golden.png | U5 | 4 |  |
| silverCreek-golden.png | U6 | 3 | Distant buildings show LOD simplification with flattened silhouettes, though shapes remain identifiable. |
| silverCreek-golden.png | S1 | 4 |  |
| silverCreek-golden.png | S2 | 4 |  |
| silverCreek-golden.png | S3 | — | No church steeple visible in frame; camera angle does not show this feature. |
| silverCreek-golden.png | S4 | 1 | No raised boardwalk visible; buildings open directly onto dirt road surface. |
| silverCreek-golden.png | S5 | 4 |  |
| silverCreek-golden.png | G1 | 2 | Road surface visible but wheel-track center and loose margin distinction not clearly defined; edges lack visible texture differentiation. |
| silverCreek-midday.png | U1 | 1 | Bare dirt and gravel dominate the near field; grass only appears in middle distance and beyond, opposite of the specified coverage pattern. |
| silverCreek-midday.png | U2 | 4 | Texture scale is appropriate with no visible tiling or smearing, though some loss of detail in far distance is natural. |
| silverCreek-midday.png | U3 | 2 | Clean, straight material boundary visible in mid-distance where gravel transitions to grass, running horizontally across center of frame. |
| silverCreek-midday.png | U4 | 5 |  |
| silverCreek-midday.png | U5 | 5 |  |
| silverCreek-midday.png | U6 | 4 |  |
| silverCreek-midday.png | S1 | 2 | Buildings are scattered without aligned facing; they do not form a legible street corridor, with yellow building on left and dark buildings positioned at different angles. |
| silverCreek-midday.png | S2 | 1 | Pitched roofs are clearly visible on all buildings; no false fronts present to hide the roofs behind facade planes. |
| silverCreek-midday.png | S3 | — | No church with steeple visible in this frame; would need camera repositioned to assess this criterion. |
| silverCreek-midday.png | S4 | 0 | No raised boardwalk visible; buildings sit directly on ground level. |
| silverCreek-midday.png | S5 | 4 |  |
| silverCreek-midday.png | G1 | 2 | Road edges are relatively clean and straight against grass; center is not visibly smoother or darker than margins, and edges lack ragged noise. |
| timberCamp-golden.png | U1 | 3 | The working area is mostly bare dirt and gravel with scattered grass tufts; grass coverage is insufficient in the immediate foreground where the biome should be grassed. |
| timberCamp-golden.png | U2 | 4 | Ground texture is human-scale and appropriately detailed without obvious tiling, with only minor variations in consistency. |
| timberCamp-golden.png | U3 | 4 | Transitions between materials are noise-broken and irregular; minor imperfections but no clean straight boundaries. |
| timberCamp-golden.png | U4 | 5 |  |
| timberCamp-golden.png | U5 | 4 | Warm golden-hour tone with visible directional shadows; lighting is correct but could be slightly more dramatic. |
| timberCamp-golden.png | U6 | 4 | Distant vegetation maintains readable silhouettes as small crosses without smearing or popping. |
| timberCamp-golden.png | T1 | 5 |  |
| timberCamp-golden.png | T2 | 3 | Roofs are clearly pitched, but doors are not visibly distinguishable on the structures from this camera angle. |
| timberCamp-golden.png | G1 | 3 | Road is visible with a darker center strip, but edges are relatively clean rather than ragged and noise-broken as specified. |
| timberCamp-midday.png | U1 | 3 | Grass cover not continuous in near field; dominated by bare brown worked earth throughout mid-ground despite being textured. |
| timberCamp-midday.png | U2 | 4 |  |
| timberCamp-midday.png | U3 | 3 | Grass-dirt transitions have some irregularity but also fairly straight sections, particularly along upper edges of cleared area. |
| timberCamp-midday.png | U4 | 4 |  |
| timberCamp-midday.png | U5 | 4 |  |
| timberCamp-midday.png | U6 | 4 |  |
| timberCamp-midday.png | T1 | 4 |  |
| timberCamp-midday.png | T2 | 4 |  |
| timberCamp-midday.png | G1 | — | n/a |
| tribal-golden.png | U1 | 2 | Grass appears as scattered sparse tufts on exposed dirt throughout, not reading as continuous cover in the near field. |
| tribal-golden.png | U2 | 4 | Texture scale appears human-scale appropriate to eye height with minor regularity in tuft placement. |
| tribal-golden.png | U3 | 2 | Visible straight dark stripes and linear boundaries running through the terrain appear as distinct material seams rather than noise-broken transitions. |
| tribal-golden.png | U4 | 5 |  |
| tribal-golden.png | U5 | 5 |  |
| tribal-golden.png | U6 | 4 | Distant trees and hills are identifiable by silhouette with minimal artifacting, though could be slightly sharper. |
| tribal-golden.png | N1 | 4 | Tipis show good variation in rotation and scale with various sizes and orientations, though limited count makes variation assessment constrained. |
| tribal-golden.png | N2 | 4 |  |
| tribal-golden.png | G1 | 3 | Dark linear features are visible but edges read as too distinct and organized rather than ragged and noise-broken transitions to grass. |
| tribal-midday.png | U1 | 4 | Grass coverage is well-distributed and continuous in the near field, thinning appropriately toward horizon, but brown earth patches and compacted areas are visible throughout the mid-field. |
| tribal-midday.png | U2 | 4 | Ground detail appears human-scale appropriate to eye height, with no obvious low-frequency wash or visible repeating grid, though texture is consistent enough that minor variations could help. |
| tribal-midday.png | U3 | 3 | Material transitions between grass and brown earth show a somewhat distinct boundary line that reads as material-specific rather than fully noise-broken; the brown depression has recognizable edges. |
| tribal-midday.png | U4 | 4 | All tipis appear grounded with visible shadows beneath; no obvious floating, sinking, or gaps. |
| tribal-midday.png | U5 | 4 | Midday lighting with appropriately short shadows for high sun angle; no blown highlights or crushed blacks; tonal range reads naturally lit. |
| tribal-midday.png | U6 | 4 | Distant trees and tipis in background remain identifiable by silhouette shape; no obvious popping or complete card-flattening artifacts. |
| tribal-midday.png | N1 | 4 | Tipis show clear rotation variation and modest scale differences; variation is present but could be more dramatic. |
| tribal-midday.png | N2 | 4 | Tipi arrangement appears organic and non-gridded, positioned naturally around the terrain depression. |
| tribal-midday.png | G1 | 4 | The path/depression feature has ragged, noise-broken edges against grass, with a visibly darker and smoother center track compared to looser margins; edges are not clean straight lines. |
| westernRange-golden.png | U1 | 2 | Ground is sparse scattered plants on extensive bare dirt; does not read as continuous cover in near field. |
| westernRange-golden.png | U2 | 4 |  |
| westernRange-golden.png | U3 | 4 |  |
| westernRange-golden.png | U4 | 5 |  |
| westernRange-golden.png | U5 | 4 |  |
| westernRange-golden.png | U6 | 4 |  |
| westernRange-golden.png | W1 | 2 | Vegetation is too sparse and discontinuous; reads as semi-arid scrubland with exposed ground rather than grassland. |
| westernRange-golden.png | W2 | — | n/a |
| westernRange-golden.png | W3 | — | n/a |
| westernRange-golden.png | G1 | — | n/a |
| westernRange-midday.png | U1 | 4 | Grass cover is continuous in near field and thins appropriately with distance; scattered brown dirt patches visible but not wide expanses |
| westernRange-midday.png | U2 | 4 | Individual grass instances are visible as small dots but distributed naturally at human scale with no tiling grid or smearing |
| westernRange-midday.png | U3 | 4 | Grass-to-dirt transitions are organic and noise-broken; no clean straight boundaries |
| westernRange-midday.png | U4 | 5 |  |
| westernRange-midday.png | U5 | 5 | Shadows are short and directional as expected for high midday sun; lighting is unclipped |
| westernRange-midday.png | U6 | 5 | Distant tree and landscape features read clearly by silhouette; no popping or flattening |
| westernRange-midday.png | W1 | 5 |  |
| westernRange-midday.png | W2 | — | n/a - no cattle visible in frame |
| westernRange-midday.png | W3 | — | Only single fence post visible; cannot assess whether fence lines follow terrain undulations |
| westernRange-midday.png | G1 | — | n/a - no road visible in frame |

## Regressions

- **silverCreek-midday.png S4: 3 → 0** — No raised boardwalk visible; buildings sit directly on ground level.
- **huntingCabin-midday.png U3: 4 → 1** — Road edges form clean, geometrically straight lines against grass; transitions lack noise-breaking and irregularity.
- **huntingCabin-midday.png G1: 4 → 1** — Road edges are clean, straight geometric boundaries with no ragged or noise-broken transitions; wheel-track depth not visually distinct.
- **lakeMercy-midday.png L3: 4 → 1** — No visible foam or white water disturbance where water meets the bank.
- **ironValley-golden.png I1: 2 → 1** — Industrial silhouette not identifiable; brown boxes and white cones do not read as headframe, stamp mill, or tailings complex.
- **mission-midday.png U1: 2 → 1** — No grass cover visible; ground is entirely bare dirt.
- **silverCreek-midday.png U1: 2 → 1** — Bare dirt and gravel dominate the near field; grass only appears in middle distance and beyond, opposite of the specified coverage pattern.
- **silverCreek-midday.png S2: 2 → 1** — Pitched roofs are clearly visible on all buildings; no false fronts present to hide the roofs behind facade planes.
- **huntingCabin-midday.png H1: 5 → 2** — Structure has a chimney and one story but lacks a visible pitched roof (reads as flat-topped box) and door entrance is not apparent.
- **westernRange-golden.png W1: 5 → 2** — Vegetation is too sparse and discontinuous; reads as semi-arid scrubland with exposed ground rather than grassland.
- **fortGrant-midday.png U3: 4 → 2** — A fairly straight horizontal transition line is visible between the darker foreground soil and lighter background, particularly prominent on the left side of the frame.
- **lakeMercy-midday.png U1: 4 → 2** — Background terrain reads as bare tan/brown, not continuous grass cover.
- **ranch-golden.png R1: 4 → 2** — Main structure reads as rectangular; L-plan massing with distinct lower kitchen ell not evident
- **ranch-midday.png U1: 4 → 2** — Near field shows sparse scattered grass tufts on bare brown soil rather than continuous ground cover
- **westernRange-golden.png U1: 4 → 2** — Ground is sparse scattered plants on extensive bare dirt; does not read as continuous cover in near field.
- **ironValley-midday.png I2: 3 → 2** — Materials do not read distinctly; rust and iron do not visually separate from other materials, all reading as generic colored geometry.
- **silverCreek-golden.png G1: 3 → 2** — Road surface visible but wheel-track center and loose margin distinction not clearly defined; edges lack visible texture differentiation.
- **silverCreek-midday.png S1: 3 → 2** — Buildings are scattered without aligned facing; they do not form a legible street corridor, with yellow building on left and dark buildings positioned at different angles.
- **silverCreek-midday.png G1: 3 → 2** — Road edges are relatively clean and straight against grass; center is not visibly smoother or darker than margins, and edges lack ragged noise.
- **cemetery-midday.png U1: 5 → 3** — Near field shows significant interspersed bare tan earth; grass cover is not continuous but scattered in patches.
- **huntingCabin-golden.png H1: 5 → 3** — One-story pitched-roof form is correct, but door and chimney are not clearly visible from this camera angle.
- **northernPines-midday.png P4: 5 → 3** — Trees are distributed at roughly uniform spacing across the landscape rather than organic forest clustering.
- **burn-midday.png U2: 4 → 3** — Ground texture is relatively flat and lacks human-scale detail variation; appears simplified rather than believably detailed.
- **fortGrant-midday.png F1: 4 → 3** — Rectangular enclosure with walls is evident, but from this angle cannot verify four complete walls and centered gate placement.
- **mission-golden.png U3: 4 → 3** — Material transitions visible but not adequately noise-broken; edges between ground patches lack irregular jagged boundaries.
- **overlook-midday.png U1: 4 → 3** — Significant expanses of bare brown/tan ground visible in foreground and midground; grass cover is scattered shrubs rather than continuous.
- **overlook-midday.png U5: 4 → 3** — Shadows are too long and pronounced for midday sun; sky appears blown out to washed tan; lighting doesn't read as sun high overhead.
- **ranch-golden.png U1: 4 → 3** — Grass cover is spotty; large reddish-brown bare ground patches dominate near field
- **ranch-midday.png G1: 4 → 3** — Road edges are partially ragged but include some relatively clean straight boundaries in places
- **timberCamp-golden.png G1: 4 → 3** — Road is visible with a darker center strip, but edges are relatively clean rather than ragged and noise-broken as specified.
- **timberCamp-midday.png U3: 4 → 3** — Grass-dirt transitions have some irregularity but also fairly straight sections, particularly along upper edges of cleared area.
- **badlands-golden.png U4: 5 → 4** — Scattered vegetation and objects appear grounded; no obvious floating or sinking.
- **burn-golden.png U4: 5 → 4** — Charred stumps and wooden structures all contact ground; no gaps or half-buried objects.
- **burn-golden.png U5: 5 → 4** — Golden hour lighting with warm tone, directional shadows from tree stumps, no blown highlights or crushed blacks; full visual warmth appropriate to sunset angle.
- **cemetery-midday.png U5: 5 → 4** — Midday lighting with visible directional shadows; warm tone is appropriate, though shadows could be more pronounced at this sun angle.
- **fortGrant-midday.png U4: 5 → 4** — Fort structures and interior buildings sit properly on the ground with no visible floating or gaps at the base.
- **huntingCabin-midday.png U4: 5 → 4** — Cabin and props sit properly on ground; no visible gaps or half-buried elements.
- **overlook-midday.png O2: 5 → 4** — Aerial perspective present and readable; horizon is hazier than foreground, could be slightly more pronounced.
- **timberCamp-golden.png U5: 5 → 4** — Warm golden-hour tone with visible directional shadows; lighting is correct but could be slightly more dramatic.
- **westernRange-golden.png U5: 5 → 4** — 

## Five worst criteria

1. **silverCreek-midday.png S4 (0)** — No raised boardwalk visible; buildings sit directly on ground level.
1. **elPaso-midday.png U1 (1)** — Ground is bare textured earth with no visible grass or vegetation in the near field; the biome should show ground cover
1. **huntingCabin-midday.png U3 (1)** — Road edges form clean, geometrically straight lines against grass; transitions lack noise-breaking and irregularity.
1. **huntingCabin-midday.png G1 (1)** — Road edges are clean, straight geometric boundaries with no ragged or noise-broken transitions; wheel-track depth not visually distinct.
1. **ironValley-golden.png U1 (1)** — Ground is predominantly bare, untextured dark dirt with sparse crosses and objects; lacks continuous grass cover.

## Could not assess

- badlands-golden.png G1 — n/a
- badlands-midday.png G1 — n/a
- burn-golden.png G1 — n/a - no gravel road visible in this frame.
- burn-midday.png G1 — n/a
- cemetery-golden.png G1 — n/a
- cemetery-midday.png G1 — n/a
- elPaso-golden.png U1 — n/a - El Paso is desert where grass cover should not be present
- elPaso-golden.png G1 — n/a - No distinct road with identifiable edges visible in frame
- elPaso-midday.png G1 — n/a - no distinct gravel road visible in frame
- fortGrant-golden.png G1 — n/a
- fortGrant-midday.png G1 — n/a
- ironValley-golden.png G1 — n/a
- lakeMercy-golden.png G1 — n/a
- lakeMercy-midday.png U2 — Ground texture too distant to assess human-scale detail; would need closer camera position.
- lakeMercy-midday.png G1 — n/a
- mission-golden.png G1 — n/a - no road visible in frame
- mission-midday.png G1 — n/a
- ranch-midday.png R5 — Camera distance too far to assess door scale accurately
- silverCreek-golden.png S3 — No church steeple visible in frame; camera angle does not show this feature.
- silverCreek-midday.png S3 — No church with steeple visible in this frame; would need camera repositioned to assess this criterion.
- timberCamp-midday.png G1 — n/a
- westernRange-golden.png W2 — n/a
- westernRange-golden.png W3 — n/a
- westernRange-golden.png G1 — n/a
- westernRange-midday.png W2 — n/a - no cattle visible in frame
- westernRange-midday.png W3 — Only single fence post visible; cannot assess whether fence lines follow terrain undulations
- westernRange-midday.png G1 — n/a - no road visible in frame

## Verdict

- Rubric coverage: **98%** (minimum 80% — criteria the grader declined to judge count against this; genuine n/a does not)
- This pass clean (all scored ≥4, none ≤2, coverage met): **no**
- Previous pass clean: **no**

CONTINUE
