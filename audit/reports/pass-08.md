# Audit pass 08

**Grader model: `haiku`** (provider: claude, temperature 0)

Captures: 32 · Generated: 2026-08-16T02:03:04.093Z
Capture backend: `webgpu` · adapter: GN · antialias: true

## Scores

| Image | Criterion | Score | Note |
|---|---|---|---|
| badlands-golden.png | U1 | 2 | Ground reads as bare reddish earth throughout; no visible grass cover in the near field. |
| badlands-golden.png | U2 | 4 | Texture detail is believable at human scale with natural undulation and color variation; no obvious smearing or tiling grid. |
| badlands-golden.png | U3 | 4 | Transitions between terrain areas are noise-broken; no clean straight material boundaries visible. |
| badlands-golden.png | U4 | 5 | All objects properly grounded; no floating or sinking visible. |
| badlands-golden.png | U5 | 4 | Golden hour lighting is evident with warm reddish tones, directional shadows from vegetation, and no blown highlights or crushed blacks. |
| badlands-golden.png | U6 | 4 | Distant terrain and scattered vegetation are clearly identifiable by shape; no smearing or flat-card collapse. |
| badlands-golden.png | D1 | 2 | No obvious layered or striated rock patterns visible; terrain reads as rolling earth rather than exposed strata. |
| badlands-golden.png | D2 | 2 | Terrain coloring is fairly uniform regardless of slope; no clear slope-driven rock dominance. |
| badlands-golden.png | D3 | 4 | Vegetation is appropriately sparse with scattered shrubs in distance and minimal coverage in near field; consistent with arid environment. |
| badlands-golden.png | G1 | — | n/a |
| badlands-midday.png | U1 | 1 | Near field is predominantly bare dirt and gravel with virtually no grass cover; ground reads as exposed earth rather than grassed. |
| badlands-midday.png | U2 | 4 | Ground texture shows appropriate variation and scale without obvious smearing or tiling artifacts. |
| badlands-midday.png | U3 | 4 | Material transitions appear organic without obvious clean straight boundaries. |
| badlands-midday.png | U4 | 5 |  |
| badlands-midday.png | U5 | 4 | Directional shadows from crosses and appropriate midday sun angle; lighting consistent with stated high-sun position. |
| badlands-midday.png | U6 | 2 | Distant badlands formations read as a blurred, undefined horizon rather than identifiable striated shapes. |
| badlands-midday.png | D1 | 1 | Badlands formations show no visible horizontal layering or stratification, reading as uniform color blocks. |
| badlands-midday.png | D2 | 2 | Rock material does not show slope-driven variation; formations appear uniformly colored regardless of slope angle. |
| badlands-midday.png | D3 | 5 |  |
| badlands-midday.png | G1 | — | n/a - no road visible in frame |
| burn-golden.png | U1 | 1 | Near field is bare scorched earth with no grass cover; wide expanses of untextured burnt ground where biome should be grassed. |
| burn-golden.png | U2 | 4 | Ground texture is human-scale with visible variation in burnt material, though detail could be slightly finer. |
| burn-golden.png | U3 | 2 | Transition between burnt area and grassed distance reads as a clean, relatively straight boundary along the horizon rather than noise-broken. |
| burn-golden.png | U4 | 5 |  |
| burn-golden.png | U5 | 5 |  |
| burn-golden.png | U6 | 4 | Distant burnt tree silhouettes are readable as individual shapes, though very distant trees are small. |
| burn-golden.png | B1 | 5 |  |
| burn-golden.png | B2 | 2 | Smoke plume shapes visible in upper sky but without clear anchoring to ground-level fire sources. |
| burn-golden.png | G1 | — | No distinct road visible in frame; cannot assess edge characteristics. |
| burn-midday.png | U1 | 2 | Near field is predominantly bare charred dirt, not continuous grass cover as criterion requires. |
| burn-midday.png | U2 | 4 |  |
| burn-midday.png | U3 | 2 | Visible straight linear boundary between the dark charred ground and lighter grass areas rather than noise-broken irregular transitions. |
| burn-midday.png | U4 | 4 |  |
| burn-midday.png | U5 | 4 |  |
| burn-midday.png | U6 | 4 |  |
| burn-midday.png | B1 | 5 |  |
| burn-midday.png | B2 | 4 |  |
| burn-midday.png | G1 | — | n/a |
| cemetery-golden.png | U1 | 2 | Ground is predominantly bare dirt with scattered green texture patches; does not read as continuous grass cover in the near field. |
| cemetery-golden.png | U2 | 2 | Green vegetation elements form a visible repeating rectangular quad pattern, not organic variation. |
| cemetery-golden.png | U3 | 4 |  |
| cemetery-golden.png | U4 | 4 |  |
| cemetery-golden.png | U5 | 4 |  |
| cemetery-golden.png | U6 | 4 |  |
| cemetery-golden.png | C1 | 4 |  |
| cemetery-golden.png | G1 | — | n/a |
| cemetery-midday.png | U1 | 5 | Continuous grass cover throughout with natural density thinning to distance. |
| cemetery-midday.png | U2 | 4 | Human-scale grass tufts against 1.62m eye height, though placement shows some regularity suggesting atlas-limited variation. |
| cemetery-midday.png | U3 | 4 | Transitions are noise-broken and irregular; grass distribution is organic without clean seams. |
| cemetery-midday.png | U4 | 5 | All objects—fence, headstones, distant poles—meet the ground with no gaps or floating elements. |
| cemetery-midday.png | U5 | 5 | Midday lighting with short directional shadows, neutral sky tone, no blown highlights or crushed blacks. |
| cemetery-midday.png | U6 | 5 | Distant crosses, trees, and landscape features remain identifiable by shape and silhouette. |
| cemetery-midday.png | C1 | 5 | Grave markers vary clearly in size, spacing, and rotation across the field in natural distribution. |
| cemetery-midday.png | G1 | — | n/a |
| elPaso-golden.png | U1 | 1 | No visible grass cover; ground is bare reddish-brown earth throughout the near field. |
| elPaso-golden.png | U2 | 3 | Texture detail is visible but appears repetitive and somewhat uniform rather than organic human-scale variation. |
| elPaso-golden.png | U3 | 3 | Ground lacks distinct material transitions to assess; no obvious clean seams but also minimal variation between materials. |
| elPaso-golden.png | U4 | 5 |  |
| elPaso-golden.png | U5 | 4 | Golden hour lighting with directional shadows and warm color palette present; shadows could be slightly longer and more dramatic. |
| elPaso-golden.png | U6 | 4 |  |
| elPaso-golden.png | E1 | 4 |  |
| elPaso-golden.png | G1 | — | n/a |
| elPaso-midday.png | U1 | 1 | Ground is bare dirt/earth throughout the entire frame with no visible grass cover, despite what should be grassland biome for a settlement. |
| elPaso-midday.png | U2 | 4 |  |
| elPaso-midday.png | U3 | 3 | Visible linear seams and straight-edged patterns in the ground texture, particularly in middle-distance terrain. |
| elPaso-midday.png | U4 | 5 |  |
| elPaso-midday.png | U5 | 4 |  |
| elPaso-midday.png | U6 | 4 |  |
| elPaso-midday.png | E1 | 2 | Adobe buildings are nearly uniform in height; cluster reads as repeated boxes rather than organically varied settlement. |
| elPaso-midday.png | G1 | — | n/a |
| fortGrant-golden.png | U1 | 2 | Wide expanses of bare brown dirt visible in the near field foreground and left side; grass does not read as continuous ground cover. |
| fortGrant-golden.png | U2 | 4 |  |
| fortGrant-golden.png | U3 | 3 | Transitions between dirt and vegetation are partially irregular but show some boundaries that lack sufficient noise-breaking. |
| fortGrant-golden.png | U4 | 4 |  |
| fortGrant-golden.png | U5 | 4 |  |
| fortGrant-golden.png | U6 | 4 |  |
| fortGrant-golden.png | F1 | 4 |  |
| fortGrant-golden.png | F2 | 5 |  |
| fortGrant-golden.png | G1 | — | n/a |
| fortGrant-midday.png | U1 | 2 | Near field shows sparse scattered vegetation (dark dots) on exposed brown soil, not continuous grass cover; denser tree coverage visible only in mid-distance. |
| fortGrant-midday.png | U2 | 4 |  |
| fortGrant-midday.png | U3 | 4 |  |
| fortGrant-midday.png | U4 | 5 |  |
| fortGrant-midday.png | U5 | 4 |  |
| fortGrant-midday.png | U6 | 4 |  |
| fortGrant-midday.png | F1 | 4 |  |
| fortGrant-midday.png | F2 | 5 |  |
| fortGrant-midday.png | G1 | — | n/a |
| huntingCabin-golden.png | U1 | 1 | Near field shows sparse scattered grass tufts on reddish-brown bare dirt with wide ungrassed expanses, not continuous coverage |
| huntingCabin-golden.png | U2 | 4 |  |
| huntingCabin-golden.png | U3 | 2 | Road and material transitions are relatively clean and straight rather than noise-broken and irregular |
| huntingCabin-golden.png | U4 | 4 |  |
| huntingCabin-golden.png | U5 | 4 |  |
| huntingCabin-golden.png | U6 | 4 |  |
| huntingCabin-golden.png | H1 | 5 |  |
| huntingCabin-golden.png | G1 | 2 | Road edges are relatively straight and clean against grass; no visible wheel-track pattern with smoother center |
| huntingCabin-midday.png | U1 | 4 | Grass and shrub cover is continuous in the near field and thins with distance; the dirt road is intentional infrastructure, not untextured wasteland. |
| huntingCabin-midday.png | U2 | 2 | Individual vegetation models are distinctly visible as oversized objects arranged in a regular pattern; lack of continuous ground-level texture detail at 1.62m eye height. |
| huntingCabin-midday.png | U3 | 4 | Road edges against grass are ragged and noise-broken; material transitions are irregular without clean straight boundaries. |
| huntingCabin-midday.png | U4 | 5 |  |
| huntingCabin-midday.png | U5 | 4 | Midday lighting is appropriately bright with directional shadows; no blown highlights or crushed blacks, though shadow contrast is somewhat flat. |
| huntingCabin-midday.png | U6 | 3 | Distant mountains, poles, and trees are recognizable by silhouette but read as flat geometric shapes and cards rather than volumetric forms. |
| huntingCabin-midday.png | H1 | 5 |  |
| huntingCabin-midday.png | G1 | 4 | Road edges are ragged against grass; wheel track center is visibly darker and smoother than loose margins. |
| ironValley-golden.png | U1 | 1 | Ground is predominantly bare reddish-brown earth with minimal grass coverage |
| ironValley-golden.png | U2 | 2 | Ground texture appears smeared and lacks human-scale detail; pattern is monotonous |
| ironValley-golden.png | U3 | — | Insufficient material variation visible; need closer view of grass-to-dirt or rock-to-gravel boundaries to assess noise-breaking |
| ironValley-golden.png | U4 | 4 | Objects sit cleanly on ground plane; no visible gaps or half-burial |
| ironValley-golden.png | U5 | 2 | Lighting is warm but shadows are not visibly directional or prominent despite golden-hour setting with sun near horizon |
| ironValley-golden.png | U6 | 4 | Distant hills and silhouettes maintain readable shape; no popping or collapsing into cards |
| ironValley-golden.png | I1 | 2 | Brown rectangles and white cones are present but their forms don't clearly read as identifiable mining headframes, mill, or tailings structures |
| ironValley-golden.png | I2 | 1 | Brown rectangular shapes do not distinctly read as rust/iron versus timber; materials are undifferentiated |
| ironValley-golden.png | G1 | — | n/a |
| ironValley-midday.png | U1 | 1 | Entire foreground and mid-ground is bare brown earth and rust-colored tailings with zero grass cover; wide expanse of untextured dirt violates the continuous ground cover requirement. |
| ironValley-midday.png | U2 | 4 |  |
| ironValley-midday.png | U3 | 3 | The central road/path boundary on the left is relatively clean and straight rather than ragged and noise-broken against the surrounding tailings. |
| ironValley-midday.png | U4 | 4 |  |
| ironValley-midday.png | U5 | 4 |  |
| ironValley-midday.png | U6 | 4 |  |
| ironValley-midday.png | I1 | 2 | Tailings piles and debris are present but classic industrial mining silhouettes—headframe, stamp mill structure—are not identifiable. |
| ironValley-midday.png | I2 | 3 | Brown and white materials show minimal distinction; rust character and timber/iron contrast are not clearly readable. |
| ironValley-midday.png | G1 | 3 | Road center is darker and defined with a visible track, but edges are not sufficiently ragged and noise-broken; boundary reads too clean and linear. |
| lakeMercy-golden.png | U1 | 2 | Visible ground is sparse brown distant terrain with minimal vegetation cover, not continuous grass in the near field. |
| lakeMercy-golden.png | U2 | 1 | Water surface displays a highly regular, visible repeating tiling grid pattern rather than believable human-scale texture variation. |
| lakeMercy-golden.png | U3 | 2 | Water-to-shore and shore-to-terrain boundaries are relatively straight and clean-edged, not noise-broken or irregular. |
| lakeMercy-golden.png | U4 | 4 | Boat sits correctly at the water plane; all visible objects meet the ground properly. |
| lakeMercy-golden.png | U5 | 4 | Golden hour lighting evident with warm sky, directional wave patterns on water, no blown highlights or crushed blacks. |
| lakeMercy-golden.png | U6 | 4 | Distant terrain and vegetation silhouettes are identifiable by shape; distant church structure reads as a distinct object. |
| lakeMercy-golden.png | L1 | 2 | Water color is mostly uniform dark throughout; lacks the required pale-to-saturated depth gradient. |
| lakeMercy-golden.png | L2 | 1 | Water surface shows a single highly regular repeating normal pattern, not two distinct scales of surface motion. |
| lakeMercy-golden.png | L3 | 1 | No foam or whitecaps visible where water meets the shoreline. |
| lakeMercy-golden.png | L4 | — | n/a - no dock structure visible in frame |
| lakeMercy-golden.png | G1 | — | n/a - no gravel road visible in frame |
| lakeMercy-midday.png | U1 | 4 | Grass cover is continuous and readable on the distant shore, thinning with distance as expected. |
| lakeMercy-midday.png | U2 | 2 | Water surface shows a visible, repeating tiling grid pattern across the entire surface. |
| lakeMercy-midday.png | U3 | 1 | Shore-to-water boundary is a clean, straight line with no noise-broken irregular transition. |
| lakeMercy-midday.png | U4 | 4 | Boat sits correctly at the water plane. |
| lakeMercy-midday.png | U5 | 4 | Midday lighting is correct with appropriate sun angle and directional shadows; water specular highlights are present. |
| lakeMercy-midday.png | U6 | 4 | Distant trees and landscape markers are identifiable by shape, not collapsed into flat cards. |
| lakeMercy-midday.png | L1 | 4 | Water shows depth gradient from pale sandy tone at shore to saturated blue at distance. |
| lakeMercy-midday.png | L2 | 2 | Water surface shows one uniform scale of repeating ripple texture, not two distinct scales of normal detail. |
| lakeMercy-midday.png | L3 | 4 | Foam line is visible where water meets the shore. |
| lakeMercy-midday.png | L4 | 4 | Boat sits correctly at the water plane. |
| lakeMercy-midday.png | G1 | — | n/a |
| mission-golden.png | U1 | 1 | Ground is bare reddish-brown dirt throughout; no grass cover visible in near field where biome should be grassed. |
| mission-golden.png | U2 | 4 | Ground texture shows believable human-scale detail with variation in color and tone; no obvious repeating tile grid or smearing. |
| mission-golden.png | U3 | 4 | Ground appears as single material type; no visible seams or straight boundaries between different materials. |
| mission-golden.png | U4 | 4 | Building base sits on ground; no visible gaps, floating, or sinking. |
| mission-golden.png | U5 | 4 | Golden-hour lighting is present with warm sky and visible shadow variation on terrain and building; no blown highlights or crushed blacks. |
| mission-golden.png | U6 | 4 | Distant cross at horizon reads as distinct shape; terrain silhouette is readable. |
| mission-golden.png | M1 | 5 | Adobe facade reads distinctly from dark dirt ground and dark roof element. |
| mission-golden.png | M2 | 4 | Bell tower (tan rectangle above main structure) positioned on facade rather than roof-centered; geometry is readable but simplified. |
| mission-golden.png | G1 | — | n/a - no distinct road visible in frame. |
| mission-midday.png | U1 | 2 | Near field shows no grass coverage; ground is predominantly exposed textured dirt |
| mission-midday.png | U2 | 4 |  |
| mission-midday.png | U3 | 2 | Visible straight horizontal band in middle ground reads as a distinct material seam |
| mission-midday.png | U4 | 4 |  |
| mission-midday.png | U5 | 4 |  |
| mission-midday.png | U6 | 3 | Distant crosses appear simplified and flat rather than reading as clear silhouettes |
| mission-midday.png | M1 | 4 |  |
| mission-midday.png | M2 | 4 |  |
| mission-midday.png | G1 | — | n/a |
| northernPines-golden.png | U1 | 2 | Grass is sparse and patchy with significant bare ground visible even in the near field, not continuous cover. |
| northernPines-golden.png | U2 | 4 |  |
| northernPines-golden.png | U3 | 2 | Material boundaries between road and grass are clean straight lines rather than ragged and noise-broken. |
| northernPines-golden.png | U4 | 4 |  |
| northernPines-golden.png | U5 | 4 |  |
| northernPines-golden.png | U6 | 2 | Distant trees are too small to read as distinct conical silhouettes; many appear as unclear small shapes. |
| northernPines-golden.png | P1 | 4 |  |
| northernPines-golden.png | P2 | 4 |  |
| northernPines-golden.png | P3 | 4 |  |
| northernPines-golden.png | P4 | 4 |  |
| northernPines-golden.png | P5 | 4 |  |
| northernPines-golden.png | G1 | 2 | Road edges are clean and straight rather than ragged and noise-broken; wheel-track center/loose margin differentiation is not clearly visible. |
| northernPines-midday.png | U1 | 4 | Grass cover is continuous in the field and thins with distance, but a straight road cuts through dividing it into sections. |
| northernPines-midday.png | U2 | 1 | Grass is rendered as a visible repeating grid of small green rectangular instances, creating obvious tiling rather than continuous texture scale. |
| northernPines-midday.png | U3 | 1 | Road edges are clean, straight lines with sharp boundaries against grass; transitions are not noise-broken or irregular at all. |
| northernPines-midday.png | U4 | 4 | Objects appear properly grounded with no obvious gaps or floating; fence posts and trees meet the ground correctly. |
| northernPines-midday.png | U5 | 4 | Midday lighting is correct with appropriately short shadows and no blown highlights or crushed blacks. |
| northernPines-midday.png | U6 | 4 | Distant trees are identifiable by conical silhouette; some very far objects are small but readable by shape. |
| northernPines-midday.png | P1 | 4 | Tree canopies show conical shapes with tiering and are wider at the base than the top. |
| northernPines-midday.png | P2 | 4 | Foliage density occludes background appropriately; canopies do not show see-through gaps to the horizon. |
| northernPines-midday.png | P3 | 4 | Tree trunks show bark relief and texture, not flat untextured poles. |
| northernPines-midday.png | P4 | 5 | Landscape reads clearly as a dense forest, not scattered saplings. |
| northernPines-midday.png | P5 | 4 | Tree heights appear believable relative to fence posts and the player viewing position. |
| northernPines-midday.png | G1 | 1 | Road edges are clean and linear, not ragged or noise-broken; wheel-track center is darker but edge definition is too sharp and regular. |
| overlook-golden.png | U1 | 2 | Grass coverage is sparse and scattered—vegetation appears as isolated bushes with large expanses of bare reddish-brown ground visible, not continuous cover. |
| overlook-golden.png | U2 | 2 | Vegetation appears as distinct, regularly-spaced geometric shapes rather than natural cover, making the scale feel artificial and grid-like. |
| overlook-golden.png | U3 | 3 | Transitions are soft rather than sharp seams, but vegetation pattern is too regular and gridded to feel naturally noise-broken. |
| overlook-golden.png | U4 | 4 | Objects appear properly grounded with no obvious floating or sinking. |
| overlook-golden.png | U5 | 5 | Golden hour lighting is clear: warm sky tones, long directional shadows, no blown highlights or crushed blacks. |
| overlook-golden.png | U6 | 4 | Distant objects are identifiable by shape; silhouettes read well without collapsing into flat cards. |
| overlook-golden.png | O1 | 5 | Strong vista composition with clear foreground framing (ravine), readable middle distance (vehicle and landscape), and layered depth. |
| overlook-golden.png | O2 | 4 | Atmospheric haze increases toward horizon; distant hills are lighter and less saturated than foreground. |
| overlook-golden.png | G1 | — | n/a |
| overlook-midday.png | U1 | 4 | Foreground has continuous grass coverage with realistic thinning in distance; some bare ground patches visible but appropriate for semi-arid terrain. |
| overlook-midday.png | U2 | 4 | Grass tuft texture is human-scale with appropriate detail; no obvious smearing or visible tiling grid. |
| overlook-midday.png | U3 | 2 | Road and field boundaries are straight and geometric; transitions lack the noise-broken irregular appearance required. |
| overlook-midday.png | U4 | 4 | All visible objects (trees, fence structure, buildings) appear grounded; no floating or sinking elements. |
| overlook-midday.png | U5 | 4 | Midday lighting is appropriate with subtle directional shadows; no blown highlights or crushed blacks. |
| overlook-midday.png | U6 | 4 | Distant objects retain readable silhouettes; distant trees maintain shape, though far background begins to blur slightly. |
| overlook-midday.png | O1 | 5 | Vista is the clear subject with strong foreground, middle distance, and background composition. |
| overlook-midday.png | O2 | 5 | Atmospheric haze increases toward horizon; distant landscape notably more muted than foreground. |
| overlook-midday.png | G1 | 2 | Road edges are clean straight lines rather than ragged and noise-broken as required. |
| ranch-golden.png | U1 | 4 | Grass cover is present and continuous in the near field, thinning at distance, but some bare gravel patches are visible close to camera around buildings. |
| ranch-golden.png | U2 | 4 | Grass tufts and ground detail scale appear appropriate to human eye height; no obvious repeating grid visible. |
| ranch-golden.png | U3 | 2 | Road-to-grass transitions are clean geometric boundaries, not noise-broken and irregular as required. |
| ranch-golden.png | U4 | 4 | Main house walls and fence posts meet the ground properly; no visible floating or sinking. |
| ranch-golden.png | U5 | 3 | Shadows are directional and golden-hour warmth is present, but shadows are crushed to near-black with lost detail. |
| ranch-golden.png | U6 | 4 | Distant crosses and fences maintain readable silhouettes without obvious LOD popping or card flatness. |
| ranch-golden.png | R1 | 4 | Main house shows clear L-plan with lower ell on right side and two-story massing on left. |
| ranch-golden.png | R2 | 4 | Hip roof visible with overhangs extending beyond walls on all sides; proportions appear correct. |
| ranch-golden.png | R3 | 4 | Front posts/pillars support the roof structure correctly. |
| ranch-golden.png | R4 | — | No chimneys visible from this angle; would need rear or side view to assess. |
| ranch-golden.png | R5 | — | Front door not visible at this distance and camera angle; would need closer or frontal view. |
| ranch-golden.png | R6 | 2 | Visible fences have cross-bracing, not three-rail design; barn structures visible but gable orientation unclear from this view. |
| ranch-golden.png | G1 | 2 | Road edges are clean straight boundaries against grass, not ragged and noise-broken; no visible wheel-track differential. |
| ranch-midday.png | U1 | 4 | Grass cover reads as continuous in near field, thinning with distance; minor bare patches acceptable for terrain variation |
| ranch-midday.png | U2 | 4 | Ground detail appears human-scale; no obvious repeating tile grid or smeared wash |
| ranch-midday.png | U3 | 3 | Some transitions between grass and dirt are irregular, but hard-edged boundaries visible in places, particularly around the building shadows |
| ranch-midday.png | U4 | 4 | All structures meet ground properly; no visible gaps or floating elements |
| ranch-midday.png | U5 | 4 | Shadows present and directional from high sun position; appropriate midday lighting with no blown highlights or crushed blacks |
| ranch-midday.png | U6 | 4 | Distant gravestones and horizon buildings remain identifiable by shape rather than smearing |
| ranch-midday.png | R1 | 4 | Two-story main block with lower ell visible; L-plan massing present |
| ranch-midday.png | R2 | 4 | Hip roof with even overhang on visible sides; roof plan extends properly over walls |
| ranch-midday.png | R3 | 4 | Porch posts visible supporting roof structure |
| ranch-midday.png | R4 | 4 | Chimney extends continuously from wall through roof ridge |
| ranch-midday.png | R5 | — | Main building in deep shadow; door not clearly visible at this camera angle |
| ranch-midday.png | R6 | 3 | Barn visible on left but gable orientation and fence rail count not clearly discernible from this angle |
| ranch-midday.png | G1 | 4 | Road edges are ragged and noise-broken; center track is visibly darker and smoother than loose margins |
| silverCreek-golden.png | U1 | 1 | Extensive bare reddish dirt in near and mid-field with no grass cover where biome should be grassed |
| silverCreek-golden.png | U2 | 2 | Texture is uniformly simple and low-resolution without visible human-scale detail variation |
| silverCreek-golden.png | U3 | 2 | Material boundaries between ground areas appear relatively clean and straight rather than noise-broken |
| silverCreek-golden.png | U4 | 4 |  |
| silverCreek-golden.png | U5 | 4 |  |
| silverCreek-golden.png | U6 | 3 | Distant structures are identifiable but simplified in silhouette detail |
| silverCreek-golden.png | S1 | 2 | Buildings scattered with varied orientations; tan building on left faces different direction than others, no coherent street corridor |
| silverCreek-golden.png | S2 | 1 | False fronts not clearly defined or prominent; buildings read as simple boxes without proper facade planes |
| silverCreek-golden.png | S3 | 1 | No steeple visible over building entries; central structures lack church-like character |
| silverCreek-golden.png | S4 | 1 | No raised boardwalk structure visible; buildings sit directly on ground level |
| silverCreek-golden.png | S5 | 4 |  |
| silverCreek-golden.png | G1 | 3 | Road boundaries present but relatively clean and straight; wheel-track differentiation (smoother center vs loose margins) not clearly visible |
| silverCreek-midday.png | U1 | 2 | Near field is dominated by bare dirt/gravel with minimal grass coverage; grass only becomes visible in the middle distance. |
| silverCreek-midday.png | U2 | 4 |  |
| silverCreek-midday.png | U3 | 2 | Road boundaries against surrounding ground are relatively clean and straight, not noise-broken as required. |
| silverCreek-midday.png | U4 | 4 |  |
| silverCreek-midday.png | U5 | 4 |  |
| silverCreek-midday.png | U6 | 4 |  |
| silverCreek-midday.png | S1 | 3 | Buildings are roughly aligned but the layout reads more as a scattered arrangement than a clear legible street corridor. |
| silverCreek-midday.png | S2 | 2 | False fronts are not visibly prominent; buildings read as simple boxes without clear facade elements hiding roofs. |
| silverCreek-midday.png | S3 | — | No church or steeple structure visible in frame. |
| silverCreek-midday.png | S4 | 3 | Raised boardwalk structure visible on the left but only partially in frame, making full assessment of its extent and design difficult. |
| silverCreek-midday.png | S5 | 4 |  |
| silverCreek-midday.png | G1 | 3 | Road center is visibly darker/more packed, but edges are not sufficiently ragged and retain somewhat defined boundaries. |
| timberCamp-golden.png | U1 | 2 | Near field is mostly worked dirt with patchy grass; grass cover is not continuous as required. |
| timberCamp-golden.png | U2 | 4 |  |
| timberCamp-golden.png | U3 | 4 |  |
| timberCamp-golden.png | U4 | 4 |  |
| timberCamp-golden.png | U5 | 5 |  |
| timberCamp-golden.png | U6 | 4 |  |
| timberCamp-golden.png | T1 | 5 |  |
| timberCamp-golden.png | T2 | 2 | Buildings are geometric blocks with no visible pitched roofs or door openings. |
| timberCamp-golden.png | G1 | 4 |  |
| timberCamp-midday.png | U1 | 3 | Central cleared area is wide bare dirt; surrounding grass is scattered clumps rather than continuous cover. |
| timberCamp-midday.png | U2 | 4 |  |
| timberCamp-midday.png | U3 | 4 |  |
| timberCamp-midday.png | U4 | 4 |  |
| timberCamp-midday.png | U5 | 4 |  |
| timberCamp-midday.png | U6 | 4 |  |
| timberCamp-midday.png | T1 | 4 |  |
| timberCamp-midday.png | T2 | 1 | Buildings are featureless brown boxes with no visible pitched roofs, doors, or architectural detail. |
| timberCamp-midday.png | G1 | 2 | Left-side path lacks wheel-track definition; no visible darker center or loose ragged margins characteristic of wagon wear. |
| tribal-golden.png | U1 | 2 | Foreground is predominantly bare reddish-brown earth with scattered discrete green bushes; vegetation does not read as continuous ground cover. |
| tribal-golden.png | U2 | 2 | Vegetation appears as uniform blocky cubic shapes arranged in a visible repetitive pattern; scale reads gamified rather than organic. |
| tribal-golden.png | U3 | 1 | Multiple straight horizontal bands of material transition visible across the scene—dark purple-brown stripes run cleanly through the terrain with no noise-breaking or irregularity. |
| tribal-golden.png | U4 | 5 |  |
| tribal-golden.png | U5 | 4 |  |
| tribal-golden.png | U6 | 3 | Distant trees and horizon vegetation are somewhat soft/blurry but remain identifiable as distant landscape elements. |
| tribal-golden.png | N1 | 4 |  |
| tribal-golden.png | N2 | 4 |  |
| tribal-golden.png | G1 | 2 | Dark horizontal stripe reads as a road but has unnaturally straight, clean edges with no ragged transitions against surrounding ground. |
| tribal-midday.png | U1 | 1 | Near field is predominantly bare brown/tan dirt with scattered sparse patches, opposite of requirement for continuous grass cover thinning with distance. |
| tribal-midday.png | U2 | 2 | Ground detail appears as individual texture blocks (grass/shrub patches) rather than continuous human-scale detail; visible repetitive tiling grid of vegetation elements. |
| tribal-midday.png | U3 | 2 | Horizontal band of brown dirt with relatively clean, linear boundary against green areas above and below; transitions are too crisp rather than noise-broken. |
| tribal-midday.png | U4 | 4 |  |
| tribal-midday.png | U5 | 4 |  |
| tribal-midday.png | U6 | 4 |  |
| tribal-midday.png | N1 | 3 | Tipis show good rotation variation but minimal scale variation; all tipis appear similar in size. |
| tribal-midday.png | N2 | 4 |  |
| tribal-midday.png | G1 | — | n/a |
| westernRange-golden.png | U1 | 4 | Grass coverage is dense and reads as continuous in the near/mid field with appropriate thinning toward horizon; some discrete brown dirt gaps between vegetation tufts visible but not wide expanses. |
| westernRange-golden.png | U2 | 4 | Texture scale appropriate to viewpoint; no obvious smearing or repeating tiling grid visible. |
| westernRange-golden.png | U3 | 4 | Vegetation transitions are natural and noise-broken; no straight material boundary lines evident. |
| westernRange-golden.png | U4 | 5 | All visible objects—windmill, tree, utility pole, vegetation—properly grounded with no floating or sinking. |
| westernRange-golden.png | U5 | 5 | Golden hour lighting fully expressed: warm tan sky, directional shadows on windmill/tree/pole, appropriate shadow length for low sun angle, no blown highlights or crushed blacks. |
| westernRange-golden.png | U6 | 4 | Distant objects maintain readable silhouettes—windmill, tree, and utility pole are clearly identifiable by shape. |
| westernRange-golden.png | W1 | 5 | Landscape clearly reads as grassland with vegetation extending to horizon. |
| westernRange-golden.png | W2 | 4 | Cattle scattered across landscape show reasonable orientation variation, though small size makes precise direction assessment difficult. |
| westernRange-golden.png | W3 | — | No fences visible in frame. |
| westernRange-golden.png | G1 | — | n/a |
| westernRange-midday.png | U1 | 2 | Grass rendered as discrete patches leaving visible expanses of bare brown soil throughout near field, not continuous cover. |
| westernRange-midday.png | U2 | 1 | Grass rendered as large geometric square/rectangular patches; not believable as human-scale detail, reads as tiled voxels rather than natural grass. |
| westernRange-midday.png | U3 | 4 |  |
| westernRange-midday.png | U4 | 4 |  |
| westernRange-midday.png | U5 | 4 |  |
| westernRange-midday.png | U6 | 4 |  |
| westernRange-midday.png | W1 | 4 |  |
| westernRange-midday.png | W2 | — | No cattle visible in frame. |
| westernRange-midday.png | W3 | — | No fences visible in frame. |
| westernRange-midday.png | G1 | — | No gravel road visible in frame. |

## Regressions

- **ironValley-golden.png I2: 4 → 1** — Brown rectangular shapes do not distinctly read as rust/iron versus timber; materials are undifferentiated
- **lakeMercy-golden.png U2: 4 → 1** — Water surface displays a highly regular, visible repeating tiling grid pattern rather than believable human-scale texture variation.
- **northernPines-midday.png U2: 4 → 1** — Grass is rendered as a visible repeating grid of small green rectangular instances, creating obvious tiling rather than continuous texture scale.
- **northernPines-midday.png U3: 4 → 1** — Road edges are clean, straight lines with sharp boundaries against grass; transitions are not noise-broken or irregular at all.
- **northernPines-midday.png G1: 4 → 1** — Road edges are clean and linear, not ragged or noise-broken; wheel-track center is darker but edge definition is too sharp and regular.
- **tribal-golden.png U3: 4 → 1** — Multiple straight horizontal bands of material transition visible across the scene—dark purple-brown stripes run cleanly through the terrain with no noise-breaking or irregularity.
- **westernRange-midday.png U2: 4 → 1** — Grass rendered as large geometric square/rectangular patches; not believable as human-scale detail, reads as tiled voxels rather than natural grass.
- **badlands-midday.png D1: 3 → 1** — Badlands formations show no visible horizontal layering or stratification, reading as uniform color blocks.
- **lakeMercy-golden.png L2: 3 → 1** — Water surface shows a single highly regular repeating normal pattern, not two distinct scales of surface motion.
- **huntingCabin-golden.png U1: 2 → 1** — Near field shows sparse scattered grass tufts on reddish-brown bare dirt with wide ungrassed expanses, not continuous coverage
- **ironValley-golden.png U1: 2 → 1** — Ground is predominantly bare reddish-brown earth with minimal grass coverage
- **lakeMercy-midday.png U3: 2 → 1** — Shore-to-water boundary is a clean, straight line with no noise-broken irregular transition.
- **mission-golden.png U1: 2 → 1** — Ground is bare reddish-brown dirt throughout; no grass cover visible in near field where biome should be grassed.
- **silverCreek-golden.png S2: 2 → 1** — False fronts not clearly defined or prominent; buildings read as simple boxes without proper facade planes
- **timberCamp-midday.png T2: 2 → 1** — Buildings are featureless brown boxes with no visible pitched roofs, doors, or architectural detail.
- **tribal-midday.png U1: 2 → 1** — Near field is predominantly bare brown/tan dirt with scattered sparse patches, opposite of requirement for continuous grass cover thinning with distance.
- **ironValley-golden.png U5: 5 → 2** — Lighting is warm but shadows are not visibly directional or prominent despite golden-hour setting with sun near horizon
- **badlands-golden.png U1: 4 → 2** — Ground reads as bare reddish earth throughout; no visible grass cover in the near field.
- **badlands-midday.png U6: 4 → 2** — Distant badlands formations read as a blurred, undefined horizon rather than identifiable striated shapes.
- **badlands-midday.png D2: 4 → 2** — Rock material does not show slope-driven variation; formations appear uniformly colored regardless of slope angle.
- **burn-midday.png U3: 4 → 2** — Visible straight linear boundary between the dark charred ground and lighter grass areas rather than noise-broken irregular transitions.
- **cemetery-golden.png U1: 4 → 2** — Ground is predominantly bare dirt with scattered green texture patches; does not read as continuous grass cover in the near field.
- **elPaso-midday.png E1: 4 → 2** — Adobe buildings are nearly uniform in height; cluster reads as repeated boxes rather than organically varied settlement.
- **huntingCabin-midday.png U2: 4 → 2** — Individual vegetation models are distinctly visible as oversized objects arranged in a regular pattern; lack of continuous ground-level texture detail at 1.62m eye height.
- **lakeMercy-golden.png U3: 4 → 2** — Water-to-shore and shore-to-terrain boundaries are relatively straight and clean-edged, not noise-broken or irregular.
- **lakeMercy-golden.png L1: 4 → 2** — Water color is mostly uniform dark throughout; lacks the required pale-to-saturated depth gradient.
- **lakeMercy-midday.png U2: 4 → 2** — Water surface shows a visible, repeating tiling grid pattern across the entire surface.
- **lakeMercy-midday.png L2: 4 → 2** — Water surface shows one uniform scale of repeating ripple texture, not two distinct scales of normal detail.
- **mission-midday.png U3: 4 → 2** — Visible straight horizontal band in middle ground reads as a distinct material seam
- **northernPines-golden.png U3: 4 → 2** — Material boundaries between road and grass are clean straight lines rather than ragged and noise-broken.
- **northernPines-golden.png U6: 4 → 2** — Distant trees are too small to read as distinct conical silhouettes; many appear as unclear small shapes.
- **northernPines-golden.png G1: 4 → 2** — Road edges are clean and straight rather than ragged and noise-broken; wheel-track center/loose margin differentiation is not clearly visible.
- **overlook-golden.png U2: 4 → 2** — Vegetation appears as distinct, regularly-spaced geometric shapes rather than natural cover, making the scale feel artificial and grid-like.
- **ranch-golden.png R6: 4 → 2** — Visible fences have cross-bracing, not three-rail design; barn structures visible but gable orientation unclear from this view.
- **silverCreek-golden.png U2: 4 → 2** — Texture is uniformly simple and low-resolution without visible human-scale detail variation
- **silverCreek-golden.png U3: 4 → 2** — Material boundaries between ground areas appear relatively clean and straight rather than noise-broken
- **silverCreek-midday.png U3: 4 → 2** — Road boundaries against surrounding ground are relatively clean and straight, not noise-broken as required.
- **tribal-golden.png U2: 4 → 2** — Vegetation appears as uniform blocky cubic shapes arranged in a visible repetitive pattern; scale reads gamified rather than organic.
- **tribal-golden.png G1: 4 → 2** — Dark horizontal stripe reads as a road but has unnaturally straight, clean edges with no ragged transitions against surrounding ground.
- **badlands-golden.png D1: 3 → 2** — No obvious layered or striated rock patterns visible; terrain reads as rolling earth rather than exposed strata.
- **badlands-golden.png D2: 3 → 2** — Terrain coloring is fairly uniform regardless of slope; no clear slope-driven rock dominance.
- **burn-golden.png U3: 3 → 2** — Transition between burnt area and grassed distance reads as a clean, relatively straight boundary along the horizon rather than noise-broken.
- **cemetery-golden.png U2: 3 → 2** — Green vegetation elements form a visible repeating rectangular quad pattern, not organic variation.
- **huntingCabin-golden.png U3: 3 → 2** — Road and material transitions are relatively clean and straight rather than noise-broken and irregular
- **huntingCabin-golden.png G1: 3 → 2** — Road edges are relatively straight and clean against grass; no visible wheel-track pattern with smoother center
- **ironValley-golden.png U2: 3 → 2** — Ground texture appears smeared and lacks human-scale detail; pattern is monotonous
- **ironValley-golden.png I1: 3 → 2** — Brown rectangles and white cones are present but their forms don't clearly read as identifiable mining headframes, mill, or tailings structures
- **ranch-golden.png G1: 3 → 2** — Road edges are clean straight boundaries against grass, not ragged and noise-broken; no visible wheel-track differential.
- **timberCamp-golden.png U1: 3 → 2** — Near field is mostly worked dirt with patchy grass; grass cover is not continuous as required.
- **timberCamp-midday.png G1: 3 → 2** — Left-side path lacks wheel-track definition; no visible darker center or loose ragged margins characteristic of wagon wear.
- **ranch-golden.png U5: 5 → 3** — Shadows are directional and golden-hour warmth is present, but shadows are crushed to near-black with lost detail.
- **elPaso-golden.png U2: 4 → 3** — Texture detail is visible but appears repetitive and somewhat uniform rather than organic human-scale variation.
- **huntingCabin-midday.png U6: 4 → 3** — Distant mountains, poles, and trees are recognizable by silhouette but read as flat geometric shapes and cards rather than volumetric forms.
- **mission-midday.png U6: 4 → 3** — Distant crosses appear simplified and flat rather than reading as clear silhouettes
- **ranch-midday.png R6: 4 → 3** — Barn visible on left but gable orientation and fence rail count not clearly discernible from this angle
- **silverCreek-golden.png U6: 4 → 3** — Distant structures are identifiable but simplified in silhouette detail
- **tribal-golden.png U6: 4 → 3** — Distant trees and horizon vegetation are somewhat soft/blurry but remain identifiable as distant landscape elements.
- **cemetery-golden.png U4: 5 → 4** — 
- **fortGrant-golden.png F1: 5 → 4** — 
- **lakeMercy-golden.png U4: 5 → 4** — Boat sits correctly at the water plane; all visible objects meet the ground properly.
- **lakeMercy-midday.png L1: 5 → 4** — Water shows depth gradient from pale sandy tone at shore to saturated blue at distance.
- **mission-golden.png U4: 5 → 4** — Building base sits on ground; no visible gaps, floating, or sinking.
- **mission-golden.png U5: 5 → 4** — Golden-hour lighting is present with warm sky and visible shadow variation on terrain and building; no blown highlights or crushed blacks.
- **northernPines-golden.png U5: 5 → 4** — 
- **northernPines-midday.png U1: 5 → 4** — Grass cover is continuous in the field and thins with distance, but a straight road cuts through dividing it into sections.
- **northernPines-midday.png U4: 5 → 4** — Objects appear properly grounded with no obvious gaps or floating; fence posts and trees meet the ground correctly.
- **northernPines-midday.png P2: 5 → 4** — Foliage density occludes background appropriately; canopies do not show see-through gaps to the horizon.
- **silverCreek-golden.png U4: 5 → 4** — 
- **timberCamp-golden.png U4: 5 → 4** — 
- **tribal-golden.png U5: 5 → 4** — 
- **westernRange-golden.png U6: 5 → 4** — Distant objects maintain readable silhouettes—windmill, tree, and utility pole are clearly identifiable by shape.

## Five worst criteria

1. **badlands-midday.png U1 (1)** — Near field is predominantly bare dirt and gravel with virtually no grass cover; ground reads as exposed earth rather than grassed.
1. **badlands-midday.png D1 (1)** — Badlands formations show no visible horizontal layering or stratification, reading as uniform color blocks.
1. **burn-golden.png U1 (1)** — Near field is bare scorched earth with no grass cover; wide expanses of untextured burnt ground where biome should be grassed.
1. **elPaso-golden.png U1 (1)** — No visible grass cover; ground is bare reddish-brown earth throughout the near field.
1. **elPaso-midday.png U1 (1)** — Ground is bare dirt/earth throughout the entire frame with no visible grass cover, despite what should be grassland biome for a settlement.

## Could not assess

- badlands-golden.png G1 — n/a
- badlands-midday.png G1 — n/a - no road visible in frame
- burn-golden.png G1 — No distinct road visible in frame; cannot assess edge characteristics.
- burn-midday.png G1 — n/a
- cemetery-golden.png G1 — n/a
- cemetery-midday.png G1 — n/a
- elPaso-golden.png G1 — n/a
- elPaso-midday.png G1 — n/a
- fortGrant-golden.png G1 — n/a
- fortGrant-midday.png G1 — n/a
- ironValley-golden.png U3 — Insufficient material variation visible; need closer view of grass-to-dirt or rock-to-gravel boundaries to assess noise-breaking
- ironValley-golden.png G1 — n/a
- lakeMercy-golden.png L4 — n/a - no dock structure visible in frame
- lakeMercy-golden.png G1 — n/a - no gravel road visible in frame
- lakeMercy-midday.png G1 — n/a
- mission-golden.png G1 — n/a - no distinct road visible in frame.
- mission-midday.png G1 — n/a
- overlook-golden.png G1 — n/a
- ranch-golden.png R4 — No chimneys visible from this angle; would need rear or side view to assess.
- ranch-golden.png R5 — Front door not visible at this distance and camera angle; would need closer or frontal view.
- ranch-midday.png R5 — Main building in deep shadow; door not clearly visible at this camera angle
- silverCreek-midday.png S3 — No church or steeple structure visible in frame.
- tribal-midday.png G1 — n/a
- westernRange-golden.png W3 — No fences visible in frame.
- westernRange-golden.png G1 — n/a
- westernRange-midday.png W2 — No cattle visible in frame.
- westernRange-midday.png W3 — No fences visible in frame.
- westernRange-midday.png G1 — No gravel road visible in frame.

## Verdict

- Rubric coverage: **97%** (minimum 80% — criteria the grader declined to judge count against this; genuine n/a does not)
- This pass clean (all scored ≥4, none ≤2, coverage met): **no**
- Previous pass clean: **no**

CONTINUE
