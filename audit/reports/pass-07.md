# Audit pass 07

**Grader model: `haiku`** (provider: claude, temperature 0)

Captures: 32 · Generated: 2026-08-16T00:51:12.100Z
Capture backend: `webgpu` · adapter: WebGPUBackend · antialias: true

## Scores

| Image | Criterion | Score | Note |
|---|---|---|---|
| badlands-golden.png | U1 | 4 | Ground is covered with continuous terrain texture that thins naturally with distance; no bare untextured dirt patches. |
| badlands-golden.png | U2 | 4 | Texture detail reads at human scale with natural erosion patterns; no visible repeating tile grid or smeared low-frequency wash. |
| badlands-golden.png | U3 | 4 | Transitions between terrain areas are irregular; slight straightness where foreground meets background slope but not egregious. |
| badlands-golden.png | U4 | 5 | All objects (trees, red element) sit properly on ground with no floating, sinking, or gaps. |
| badlands-golden.png | U5 | 4 | Golden hour lighting present with warm peachy tones and directional shadows; shadows could be slightly longer for sun truly near horizon. |
| badlands-golden.png | U6 | 4 | Distant trees and terrain features read as identifiable shapes; not collapsed into flat cards or smeared. |
| badlands-golden.png | D1 | 3 | Subtle color banding visible in distant rock formations suggesting layers, but stratification is not pronounced or dramatic. |
| badlands-golden.png | D2 | 3 | Slope variation exists between foreground and background terrain, but rock material is not strongly emphasized on steeper slopes. |
| badlands-golden.png | D3 | 4 | Vegetation is sparse and scattered, consistent with arid badlands biome. |
| badlands-golden.png | G1 | — | n/a |
| badlands-midday.png | U1 | 1 | Ground is predominantly bare brown dirt with minimal grass cover; the near field shows untextured soil rather than continuous grass. |
| badlands-midday.png | U2 | 4 | Ground texture has reasonable detail and scale without obvious tiling or low-frequency wash. |
| badlands-midday.png | U3 | 4 | Material transitions read as organic with no visible straight boundaries between dirt and rock. |
| badlands-midday.png | U4 | 4 | All objects including distant trees and foreground rocks rest properly on ground with no visible gaps or floating. |
| badlands-midday.png | U5 | 3 | Shadows are minimal and not sufficiently pronounced; lighting reads flat despite high sun angle, with insufficient directional shadow definition. |
| badlands-midday.png | U6 | 4 | Distant badlands ridge and scattered trees read clearly by silhouette without smearing or popping. |
| badlands-midday.png | D1 | 3 | Distant badlands formation shows some tonal variation suggesting strata, but layering is subtle and could be more pronounced. |
| badlands-midday.png | D2 | 4 | Background badlands formation shows tonal variation consistent with slope-driven rock coloring. |
| badlands-midday.png | D3 | 5 | Sparse vegetation clearly evident with scattered trees and significant empty space consistent with arid badlands. |
| badlands-midday.png | G1 | — | n/a—no road visible in this frame |
| burn-golden.png | U1 | 1 | Burn area contains only bare charred soil with no grass cover in the near field. |
| burn-golden.png | U2 | 3 | Ground texture shows color variation but appears somewhat coarse and lacks fine detail for close human-scale inspection. |
| burn-golden.png | U3 | 3 | Material transitions between soil tones are gradual but lack visible noise-breaking irregularity; transitions could be more jagged. |
| burn-golden.png | U4 | 4 | Standing trunks and charred debris rest properly on the ground plane without detectable gaps or sinking. |
| burn-golden.png | U5 | 4 | Golden hour lighting is present with warm tones and directional shadows cast by low sun on the horizon. |
| burn-golden.png | U6 | 4 | Distant trees are readable by silhouette shape against the sky; no visible flatness or popping. |
| burn-golden.png | B1 | 5 |  |
| burn-golden.png | B2 | 2 | Possible atmospheric haze visible in mid-distance but no distinct smoke plume clearly anchored to a ground source. |
| burn-golden.png | G1 | — | n/a - no road visible in this frame. |
| burn-midday.png | U1 | 2 | Near field is predominantly bare tan/brown ground with sparse scattered grass, not continuous cover. |
| burn-midday.png | U2 | 4 |  |
| burn-midday.png | U3 | 4 |  |
| burn-midday.png | U4 | 4 |  |
| burn-midday.png | U5 | 4 |  |
| burn-midday.png | U6 | 4 |  |
| burn-midday.png | B1 | 5 |  |
| burn-midday.png | B2 | 4 |  |
| burn-midday.png | G1 | — | n/a |
| cemetery-golden.png | U1 | 4 | Continuous grass and vegetation cover throughout, though sparse and somewhat dotted in appearance. |
| cemetery-golden.png | U2 | 3 | The pattern of vegetation specks across the ground appears too uniform and regular, suggesting possible tiling rather than organic grass distribution. |
| cemetery-golden.png | U3 | 4 | Material transitions between grassy areas and darker vegetation patches appear reasonably organic without obvious straight seams. |
| cemetery-golden.png | U4 | 5 | All objects—fence, headstones, and distant trees—are properly grounded with no gaps or floating elements. |
| cemetery-golden.png | U5 | 4 | Warm golden-hour lighting is present throughout with visible directional shadows, though shadows could be longer and more pronounced given the stated sun-near-horizon position. |
| cemetery-golden.png | U6 | 4 | Distant trees and terrain are identifiable by shape with reasonable silhouette definition; distant crosses and vegetation read as distinct elements. |
| cemetery-golden.png | C1 | 4 | Headstones show clear variation in size and irregular spacing across the cemetery plot; rotation variation is present though harder to discern from this overhead angle. |
| cemetery-golden.png | G1 | — | n/a |
| cemetery-midday.png | U1 | 4 | Grass cover is continuous in near and mid-field with scattered stones on top, thinning toward distant ridge; no bare dirt expanses. |
| cemetery-midday.png | U2 | 3 | Dark spots show a somewhat regular recurrent pattern suggesting tiling rather than natural scattered variation. |
| cemetery-midday.png | U3 | 4 | Material transitions are gradual and noise-broken; no sharp straight boundaries between distinct surface types visible. |
| cemetery-midday.png | U4 | 5 | Headstones, fence, and scattered stones all sit flush with ground; no gaps, floating, or half-buried objects. |
| cemetery-midday.png | U5 | 4 | Lighting is appropriately neutral and bright for high midday sun; shadows present on fence and objects but relatively short and subtle, which is correct for the sun angle. |
| cemetery-midday.png | U6 | 4 | Distant trees are clearly identifiable as silhouettes by conical shape; ridge reads clearly; no smearing or collapsing into flat cards. |
| cemetery-midday.png | C1 | 4 | Headstones vary in height and spacing; not evenly-spaced or in a perfectly straight line, showing natural cemetery arrangement variation. |
| cemetery-midday.png | G1 | — | Road not clearly visible in this wide distant view; cannot assess edge characteristics. |
| elPaso-golden.png | U1 | 1 | Ground is predominantly bare dirt/exposed terrain with minimal visible grass cover in near field; should read as continuous grassed ground thinning with distance. |
| elPaso-golden.png | U2 | 4 |  |
| elPaso-golden.png | U3 | 2 | Some transitions between ground materials appear relatively clean or straight rather than consistently noise-broken and irregular. |
| elPaso-golden.png | U4 | 4 |  |
| elPaso-golden.png | U5 | 4 |  |
| elPaso-golden.png | U6 | 3 | Distant trees and landscape features are simplified and somewhat card-like, but remain identifiable by silhouette. |
| elPaso-golden.png | E1 | 4 |  |
| elPaso-golden.png | G1 | — | n/a |
| elPaso-midday.png | U1 | 1 | Ground is almost entirely bare brown dirt; no visible grass cover in near field despite this being the primary biome. |
| elPaso-midday.png | U2 | 4 |  |
| elPaso-midday.png | U3 | 2 | Visible linear path/road through the settlement with relatively clean, straight edges rather than noise-broken transitions. |
| elPaso-midday.png | U4 | 5 |  |
| elPaso-midday.png | U5 | 4 |  |
| elPaso-midday.png | U6 | 4 |  |
| elPaso-midday.png | E1 | 4 |  |
| elPaso-midday.png | G1 | 2 | Road path is visible with darker center, but edges are too linear and clean rather than ragged and noise-broken against grass. |
| fortGrant-golden.png | U1 | 2 | Ground is predominantly bare reddish dirt with scattered darker patches; not continuous grass cover typical of grassed biome |
| fortGrant-golden.png | U2 | 4 |  |
| fortGrant-golden.png | U3 | 3 | Visible demarcation between darker foreground clay and lighter reddish distance ground shows some material seaming |
| fortGrant-golden.png | U4 | 4 |  |
| fortGrant-golden.png | U5 | 4 |  |
| fortGrant-golden.png | U6 | 4 |  |
| fortGrant-golden.png | F1 | 5 |  |
| fortGrant-golden.png | F2 | 5 |  |
| fortGrant-golden.png | G1 | — | n/a |
| fortGrant-midday.png | U1 | 2 | Ground is predominantly bare dirt and sand; vegetation is sparse scattered specs, not continuous grass cover in the near field. |
| fortGrant-midday.png | U2 | 4 | Texture scale reads as human-scale, no obvious tiling grid or smeared wash. |
| fortGrant-midday.png | U3 | 2 | Visible straight boundaries between different ground materials (reddish area in foreground vs. lighter dirt areas) rather than noise-broken irregular transitions. |
| fortGrant-midday.png | U4 | 4 | Fort walls and interior structures appear properly grounded with no visible gaps or floating elements. |
| fortGrant-midday.png | U5 | 4 | Shadows are present, directional, and appropriately short for high sun position; lighting reads as midday with no blown highlights or crushed blacks. |
| fortGrant-midday.png | U6 | 4 | Distant trees and hills read as identifiable silhouettes by shape, not smeared or collapsed. |
| fortGrant-midday.png | F1 | 4 | Four-wall rectangular enclosure visible with gate opening on near side. |
| fortGrant-midday.png | F2 | 4 | Interior contains multiple structures including tan/beige buildings and other constructions. |
| fortGrant-midday.png | G1 | 2 | Ground treatment visible in approach but lacks characteristic wheel-track center and ragged noise-broken edges expected of gravel road. |
| huntingCabin-golden.png | U1 | 2 | Wide expanses of bare tan/brown earth with only scattered small dark vegetation spots; no continuous grass cover in near field. |
| huntingCabin-golden.png | U2 | 4 |  |
| huntingCabin-golden.png | U3 | 3 | Road edges are relatively defined lines rather than noise-broken irregular transitions; the boundary reads too clean against surrounding terrain. |
| huntingCabin-golden.png | U4 | 4 |  |
| huntingCabin-golden.png | U5 | 4 |  |
| huntingCabin-golden.png | U6 | 4 |  |
| huntingCabin-golden.png | H1 | 3 | Pitched roof and chimney are clear, but door is not identifiable from this angle and distance. |
| huntingCabin-golden.png | G1 | 3 | Wheel-track center is darker, but edges lack sufficient ragged/noise-broken quality; transitions read too defined. |
| huntingCabin-midday.png | U1 | 4 | Grass cover is continuous and visible throughout, thinning with distance as required; some bare brown dirt patches in the near field around the cabin are acceptable but prevent a perfect score. |
| huntingCabin-midday.png | U2 | 4 | Texture detail is human-scale with visible individual grass tufts and rocks; no obvious repeating tile pattern or smeared wash, though some texture uniformity visible at distance. |
| huntingCabin-midday.png | U3 | 3 | Road edges show some clean, linear boundaries against grass rather than fully noise-broken transitions; left and right edges of the dirt road have straight sections. |
| huntingCabin-midday.png | U4 | 5 |  |
| huntingCabin-midday.png | U5 | 4 | Shadows are short and directional, appropriate for high sun midday position; lighting is well-balanced with no blown highlights or crushed blacks, though midday could have slightly more contrast. |
| huntingCabin-midday.png | U6 | 4 | Distant trees read as distinct silhouettes and individual shapes rather than flat cards or smeared, though some appear small. |
| huntingCabin-midday.png | H1 | 5 |  |
| huntingCabin-midday.png | G1 | 3 | Road shows visible wheel-track centerline and margin variation, but edges lack sufficient raggedness and noise-breaking; several straight boundary sections visible against grass. |
| ironValley-golden.png | U1 | 2 | Foreground is bare dirt with no visible grass cover; the ground appears uniformly dark and untextured. |
| ironValley-golden.png | U2 | 3 | Noticeable low-frequency wash/gradient where ground progressively lightens with distance, creating a smeared effect. |
| ironValley-golden.png | U3 | 4 |  |
| ironValley-golden.png | U4 | 4 |  |
| ironValley-golden.png | U5 | 5 |  |
| ironValley-golden.png | U6 | 4 |  |
| ironValley-golden.png | I1 | 3 | Brown structures and distant vertical elements are present but not distinctly identifiable as specific mine equipment (headframes, stamp mill, tailings). |
| ironValley-golden.png | I2 | 4 |  |
| ironValley-golden.png | G1 | — | n/a |
| ironValley-midday.png | U1 | 1 | Foreground and midfield are predominantly bare untextured dirt with minimal grass cover. |
| ironValley-midday.png | U2 | 3 | Ground texture is relatively uniform and flat rather than exhibiting natural human-scale variation. |
| ironValley-midday.png | U3 | 2 | Clear diagonal linear boundary visible running across terrain, creating a straight material seam. |
| ironValley-midday.png | U4 | 4 | Objects are properly grounded with no visible gaps or floating issues. |
| ironValley-midday.png | U5 | 4 | Midday lighting reads correctly with appropriate shadow direction and length; no blown highlights or crushed blacks. |
| ironValley-midday.png | U6 | 3 | Distant objects on ridge are visible but quite small and indistinct in detail. |
| ironValley-midday.png | I1 | 2 | Visible structures are generic shapes; headframe, stamp mill, and tailings are not clearly identifiable as distinct industrial elements. |
| ironValley-midday.png | I2 | 2 | Rust and iron materials are not distinctly readable; weathering and color do not clearly differentiate metal from other materials. |
| ironValley-midday.png | G1 | 1 | Visible linear boundary is too clean and straight; lacks ragged edges and no wheel-track wear pattern visible. |
| lakeMercy-golden.png | U1 | 1 | No grass visible in near field; only water and bare sand beach. |
| lakeMercy-golden.png | U2 | 4 |  |
| lakeMercy-golden.png | U3 | 4 |  |
| lakeMercy-golden.png | U4 | 5 |  |
| lakeMercy-golden.png | U5 | 4 |  |
| lakeMercy-golden.png | U6 | 4 |  |
| lakeMercy-golden.png | L1 | 4 |  |
| lakeMercy-golden.png | L2 | 3 | Surface shows wave motion but primarily one dominant directional pattern, not clearly two distinct scales. |
| lakeMercy-golden.png | L3 | 1 | No visible foam texture at water/sand interface. |
| lakeMercy-golden.png | L4 | 5 |  |
| lakeMercy-golden.png | G1 | — | n/a |
| lakeMercy-midday.png | U1 | 2 | Wide expanses of bare tan/beige ground dominate the near and middle field with minimal grass cover visible. |
| lakeMercy-midday.png | U2 | 4 |  |
| lakeMercy-midday.png | U3 | 2 | The shore-water boundary reads as a clean, straight horizontal line with no noise-breaking or irregularity. |
| lakeMercy-midday.png | U4 | 4 |  |
| lakeMercy-midday.png | U5 | 3 | Sky and water highlights appear blown out; overall exposure is high for midday sun. |
| lakeMercy-midday.png | U6 | 4 |  |
| lakeMercy-midday.png | L1 | 5 |  |
| lakeMercy-midday.png | L2 | 4 |  |
| lakeMercy-midday.png | L3 | 3 | A pale line is visible at the waterline but does not read distinctly as foam with clear surface definition. |
| lakeMercy-midday.png | L4 | — | n/a |
| lakeMercy-midday.png | G1 | — | n/a |
| mission-golden.png | U1 | 2 | Ground appears to be bare reddish earth without grass cover in the near field. |
| mission-golden.png | U2 | 4 |  |
| mission-golden.png | U3 | 4 |  |
| mission-golden.png | U4 | 5 |  |
| mission-golden.png | U5 | 5 |  |
| mission-golden.png | U6 | 4 |  |
| mission-golden.png | M1 | 5 |  |
| mission-golden.png | M2 | 4 |  |
| mission-golden.png | G1 | — | n/a |
| mission-midday.png | U1 | 1 | Ground is entirely bare brown dirt with no grass cover visible, wide expanses of untextured soil dominate the near field. |
| mission-midday.png | U2 | 4 |  |
| mission-midday.png | U3 | 4 |  |
| mission-midday.png | U4 | 4 |  |
| mission-midday.png | U5 | 4 | Lighting is consistent with high sun, but ground-plane shadows could be more pronounced to emphasize midday directional light. |
| mission-midday.png | U6 | 4 |  |
| mission-midday.png | M1 | 4 |  |
| mission-midday.png | M2 | 4 |  |
| mission-midday.png | G1 | — | n/a - no gravel road visible in this frame |
| northernPines-golden.png | U1 | 2 | Ground in near field is primarily exposed dirt and gravel with only scattered small tufts of green vegetation, not continuous grass cover. |
| northernPines-golden.png | U2 | 4 |  |
| northernPines-golden.png | U3 | 4 |  |
| northernPines-golden.png | U4 | 4 |  |
| northernPines-golden.png | U5 | 5 |  |
| northernPines-golden.png | U6 | 4 |  |
| northernPines-golden.png | P1 | 4 |  |
| northernPines-golden.png | P2 | 4 |  |
| northernPines-golden.png | P3 | 4 |  |
| northernPines-golden.png | P4 | 3 | Landscape reads as sparse scattered woodland rather than dense forest stand. |
| northernPines-golden.png | P5 | 4 |  |
| northernPines-golden.png | G1 | 4 |  |
| northernPines-midday.png | U1 | 5 |  |
| northernPines-midday.png | U2 | 4 | Texture detail is good but some subtle low-frequency wash visible in very near field |
| northernPines-midday.png | U3 | 4 | Most transitions are noise-broken but some road edges are fairly clean and straight in places |
| northernPines-midday.png | U4 | 5 |  |
| northernPines-midday.png | U5 | 4 | Lighting is directional and appropriate for high sun, but midday contrast could be slightly more dramatic |
| northernPines-midday.png | U6 | 4 | Distant trees are identifiable by shape but are quite small and could read more crisply |
| northernPines-midday.png | P1 | 4 | Conical shapes with wider bases are present but could show more dramatic tiering in canopy structure |
| northernPines-midday.png | P2 | 5 |  |
| northernPines-midday.png | P3 | 4 | Bark texture is visible on trunks but fairly subtle and could show more relief detail |
| northernPines-midday.png | P4 | 4 | Reads as forest but stand density is somewhat sparse with considerable open space between trees |
| northernPines-midday.png | P5 | 4 | Tree heights appear reasonable but difficult to assess fully without building references in frame |
| northernPines-midday.png | G1 | 4 | Road center is clearly darker and smoother than ragged margins with visible wheel tracks, but some edges are fairly straight in places |
| overlook-golden.png | U1 | 2 | Wide expanses of untextured brown dirt in the foreground with only scattered green vegetation dots; ground cover is not continuous. |
| overlook-golden.png | U2 | 4 |  |
| overlook-golden.png | U3 | 3 | Transition between the darker reddish road and lighter ground shows some defined edges rather than fully noise-broken boundaries. |
| overlook-golden.png | U4 | 4 |  |
| overlook-golden.png | U5 | 4 |  |
| overlook-golden.png | U6 | 4 |  |
| overlook-golden.png | O1 | 4 |  |
| overlook-golden.png | O2 | 4 |  |
| overlook-golden.png | G1 | 3 | Road edges show some texture variation but are not fully ragged and noise-broken; center track contrast is visible but edges could be more irregular. |
| overlook-midday.png | U1 | 2 | Near field shows sparse individual grass tufts scattered on bare brown ground rather than continuous cover; density increases toward middle distance, opposite of requirement. |
| overlook-midday.png | U2 | 2 | Grass rendered as individual instanced models with regular repeating spacing pattern; creates visible pseudo-grid tiling rather than natural continuous variation at believable scale. |
| overlook-midday.png | U3 | 2 | Clean, straight boundary visible where dark brown ramp begins against lighter foreground, rather than noise-broken irregular transition. |
| overlook-midday.png | U4 | 4 | Fence structure and terrain features properly meet ground; no visible gaps, floating, or sinking. |
| overlook-midday.png | U5 | 4 | Directional shadows present and correct for high sun; exposure well-balanced with no blown highlights or crushed blacks. |
| overlook-midday.png | U6 | 4 | Distant trees and landscape features maintain readable silhouettes and do not collapse to flat cards. |
| overlook-midday.png | O1 | 5 | Strong vista composition with clear foreground framing, readable middle distance featuring fence/wagon, and distinct far landscape. |
| overlook-midday.png | O2 | 5 | Clear aerial perspective: near ground relatively clear, middle distance transitions to greenish tones, far distance and horizon progressively hazier. |
| overlook-midday.png | G1 | — | n/a |
| ranch-golden.png | U1 | 2 | Near field is dominated by bare sand/dirt with scattered greenish patches; no continuous grass cover, wide expanses of untextured ground visible around and between buildings. |
| ranch-golden.png | U2 | 2 | Ground texture is uniformly washed and lacks human-scale detail; surface reads as an undifferentiated sandy plane with scattered specks rather than visible ground variation at eye height. |
| ranch-golden.png | U3 | 2 | Road edges are clean and organized boundaries against surrounding ground; material transitions are relatively straight and defined rather than noise-broken and irregular. |
| ranch-golden.png | U4 | 4 | All structures appear properly grounded; minor imperfections but no obvious gaps, floating elements, or sinking. |
| ranch-golden.png | U5 | 5 | Golden hour lighting fully realized: sun near horizon, long directional shadows, warm orange/brown tones, no blown highlights or crushed blacks. |
| ranch-golden.png | U6 | 3 | Distant trees and landscape are identifiable by silhouette shape but appear low-poly and blocky; readable but not fully resolved. |
| ranch-golden.png | R1 | 4 | Clear L-plan massing with two-story main block and lower kitchen ell visible on the right side. |
| ranch-golden.png | R2 | 4 | Hip roof with visible even overhang on multiple sides; roof plan encompasses walls properly. |
| ranch-golden.png | R3 | 4 | Porch posts visible supporting roof structure. |
| ranch-golden.png | R4 | 4 | Chimney visible rising continuously from wall to above ridge line. |
| ranch-golden.png | R5 | 4 | Door/opening scale reads appropriately against 1.62 m eye height. |
| ranch-golden.png | R6 | 4 | Barn with gable running along long axis; fences visible with three rails; no windmill visible in this frame. |
| ranch-golden.png | G1 | 3 | Road has visible center wheel-track darker than margins, but edges are relatively clean and organized rather than ragged and noise-broken. |
| ranch-midday.png | U1 | 2 | Grass is patchy rather than continuous cover in the near field; significant expanses of bare brown dirt visible around buildings where biome should be grassed. |
| ranch-midday.png | U2 | 4 |  |
| ranch-midday.png | U3 | 3 | Some material transitions between dirt and grass are relatively clean/straight; others are more irregular. Not consistently noise-broken throughout. |
| ranch-midday.png | U4 | 4 |  |
| ranch-midday.png | U5 | 4 |  |
| ranch-midday.png | U6 | 3 | Distant trees and objects are identifiable by silhouette but very small and somewhat flattened in appearance. |
| ranch-midday.png | R1 | 2 | Main building reads as a simple rectangular box; L-plan massing with lower kitchen ell is not clearly evident from this three-quarter view. |
| ranch-midday.png | R2 | 3 | Roof structure present but hip roof with even overhang on all four sides cannot be confirmed from this angle. |
| ranch-midday.png | R3 | — | Porch elements visible but viewing angle and backlighting make it unclear whether posts support a roof or merely exist as separate forms. |
| ranch-midday.png | R4 | 3 | Vertical structure on roof appears present but continuity from wall to above ridge cannot be verified from this angle. |
| ranch-midday.png | R5 | — | Doors visible on main building but too distant to assess scale against 1.62 m eye height; closer frontal view needed. |
| ranch-midday.png | R6 | 4 |  |
| ranch-midday.png | G1 | 4 |  |
| silverCreek-golden.png | U1 | 1 | Ground in near and mid field is bare brown/reddish dirt with no grass cover visible; required continuous grassy ground is entirely absent. |
| silverCreek-golden.png | U2 | 4 |  |
| silverCreek-golden.png | U3 | 4 |  |
| silverCreek-golden.png | U4 | 5 |  |
| silverCreek-golden.png | U5 | 4 |  |
| silverCreek-golden.png | U6 | 4 |  |
| silverCreek-golden.png | S1 | 2 | Buildings face multiple angles and don't align along a coherent street corridor; left building angles differently than center and right structures. |
| silverCreek-golden.png | S2 | 2 | False fronts visible but don't span full building width (dark walls visible on sides) and don't hide roofs effectively (roof/structure visible above the tan facades). |
| silverCreek-golden.png | S3 | 0 | No church or steeple visible in frame. |
| silverCreek-golden.png | S4 | 0 | No raised boardwalk visible along storefronts. |
| silverCreek-golden.png | S5 | 4 |  |
| silverCreek-golden.png | G1 | — | n/a |
| silverCreek-midday.png | U1 | 2 | Near field is predominantly bare gravel/dirt; grass cover is not continuous in the near field as required. |
| silverCreek-midday.png | U2 | 4 | Ground texture appears human-scale and detailed without visible tiling grids. |
| silverCreek-midday.png | U3 | 4 | Material transitions appear noise-broken and irregular. |
| silverCreek-midday.png | U4 | 4 | All buildings sit properly on the ground without obvious gaps or floating elements. |
| silverCreek-midday.png | U5 | 4 | Shadows are directional and present; lighting is consistent with midday sun position. |
| silverCreek-midday.png | U6 | 4 | Distant trees and objects maintain readable silhouettes rather than appearing flat or smeared. |
| silverCreek-midday.png | S1 | 2 | Buildings are scattered at various angles with no alignment to a common street direction. |
| silverCreek-midday.png | S2 | 2 | Building roofs are visible above facades, indicating false fronts are incomplete or not implemented consistently. |
| silverCreek-midday.png | S3 | — | No church structure visible in this frame; cannot assess steeple placement. |
| silverCreek-midday.png | S4 | 0 | No raised boardwalk visible; buildings sit directly on ground. |
| silverCreek-midday.png | S5 | 3 | Some variation in building colors and heights, but shapes are basic boxes lacking distinctive architectural detail. |
| silverCreek-midday.png | G1 | — | n/a - no distinct road with wheel tracks or ragged edges visible in this frame. |
| timberCamp-golden.png | U1 | 3 | Near field shows significant expanses of bare tan/brown dirt with only scattered sparse dark vegetation dots; lacks continuous grass cover typical of a grassed biome. |
| timberCamp-golden.png | U2 | 4 |  |
| timberCamp-golden.png | U3 | 4 |  |
| timberCamp-golden.png | U4 | 5 |  |
| timberCamp-golden.png | U5 | 4 |  |
| timberCamp-golden.png | U6 | 4 |  |
| timberCamp-golden.png | T1 | 4 |  |
| timberCamp-golden.png | T2 | 2 | Buildings read as simple rectangular boxes without visible pitched roofs or door openings. |
| timberCamp-golden.png | G1 | 3 | Darker worked area visible in foreground with some center/edge differentiation, but edges are not sufficiently ragged and noise-broken against the adjacent ground. |
| timberCamp-midday.png | U1 | 3 | Wide expanse of bare brown dirt in center work area; grass visible beyond but not continuous in near field. |
| timberCamp-midday.png | U2 | 4 |  |
| timberCamp-midday.png | U3 | 4 |  |
| timberCamp-midday.png | U4 | 4 |  |
| timberCamp-midday.png | U5 | 4 |  |
| timberCamp-midday.png | U6 | 4 |  |
| timberCamp-midday.png | T1 | 4 |  |
| timberCamp-midday.png | T2 | 2 | Buildings are flat-roofed boxes without pitched roofs or visible door details. |
| timberCamp-midday.png | G1 | 3 | Road exists and center is darker/worn, but edges are not clearly ragged or noise-broken against grass. |
| tribal-golden.png | U1 | 2 | Near field is predominantly bare reddish-brown soil with scattered vegetation; grass does not read as continuous cover where it should be densest. |
| tribal-golden.png | U2 | 4 |  |
| tribal-golden.png | U3 | 4 |  |
| tribal-golden.png | U4 | 4 |  |
| tribal-golden.png | U5 | 5 |  |
| tribal-golden.png | U6 | 4 |  |
| tribal-golden.png | N1 | 4 |  |
| tribal-golden.png | N2 | 4 |  |
| tribal-golden.png | G1 | 4 |  |
| tribal-midday.png | U1 | 2 | Near field is mostly bare dirt with scattered dark specs rather than continuous grass cover |
| tribal-midday.png | U2 | 2 | Dark vegetation spots form a regular, visible grid pattern across the ground |
| tribal-midday.png | U3 | 1 | Clear straight horizontal boundary runs through center between grass and brown dirt materials |
| tribal-midday.png | U4 | 4 | Tipis and posts sit properly on ground with no visible gaps or floating |
| tribal-midday.png | U5 | 4 | Shadows are directional and appropriate for high-sun midday, no blown highlights or crushed blacks |
| tribal-midday.png | U6 | 4 | Distant trees and landscape elements read as recognizable shapes, not smeared or flat |
| tribal-midday.png | N1 | 3 | Tipis show rotation variation but scale remains relatively uniform |
| tribal-midday.png | N2 | 3 | Tipis arranged in linear alignment rather than organic irregular placement |
| tribal-midday.png | G1 | 2 | Road edges are too clean and straight, lacking ragged and noise-broken transitions |
| westernRange-golden.png | U1 | 1 | Ground is predominantly bare reddish-brown dirt with scattered speckles, not continuous grass cover in the near field. |
| westernRange-golden.png | U2 | 3 | Texture is present but minimal, with small speckles on an otherwise uniform wash; lacks strong human-scale detail variation. |
| westernRange-golden.png | U3 | 4 | Single material type throughout visible ground makes transitions hard to assess, but no obvious straight seams visible. |
| westernRange-golden.png | U4 | 5 |  |
| westernRange-golden.png | U5 | 5 |  |
| westernRange-golden.png | U6 | 5 |  |
| westernRange-golden.png | W1 | 1 | Landscape reads as bare dirt or desert, not grassland to the horizon. |
| westernRange-golden.png | W2 | — | n/a |
| westernRange-golden.png | W3 | — | n/a |
| westernRange-golden.png | G1 | — | n/a |
| westernRange-midday.png | U1 | 2 | Ground is predominantly bare brown dirt with sparse scattered grass spots, not continuous grass cover in the near field. |
| westernRange-midday.png | U2 | 4 |  |
| westernRange-midday.png | U3 | 4 |  |
| westernRange-midday.png | U4 | 4 |  |
| westernRange-midday.png | U5 | 4 |  |
| westernRange-midday.png | U6 | 4 |  |
| westernRange-midday.png | W1 | 2 | Landscape is sparse and arid with brown dirt as dominant ground, does not read as grassland. |
| westernRange-midday.png | W2 | — | n/a |
| westernRange-midday.png | W3 | — | n/a |
| westernRange-midday.png | G1 | — | n/a |

## Regressions

- **silverCreek-midday.png S4: 1 → 0** — No raised boardwalk visible; buildings sit directly on ground.
- **tribal-midday.png U3: 4 → 1** — Clear straight horizontal boundary runs through center between grass and brown dirt materials
- **lakeMercy-golden.png U1: 3 → 1** — No grass visible in near field; only water and bare sand beach.
- **badlands-midday.png U1: 2 → 1** — Ground is predominantly bare brown dirt with minimal grass cover; the near field shows untextured soil rather than continuous grass.
- **elPaso-golden.png U1: 2 → 1** — Ground is predominantly bare dirt/exposed terrain with minimal visible grass cover in near field; should read as continuous grassed ground thinning with distance.
- **elPaso-midday.png U1: 2 → 1** — Ground is almost entirely bare brown dirt; no visible grass cover in near field despite this being the primary biome.
- **ironValley-midday.png G1: 2 → 1** — Visible linear boundary is too clean and straight; lacks ragged edges and no wheel-track wear pattern visible.
- **mission-midday.png U1: 2 → 1** — Ground is entirely bare brown dirt with no grass cover visible, wide expanses of untextured soil dominate the near field.
- **westernRange-golden.png U1: 2 → 1** — Ground is predominantly bare reddish-brown dirt with scattered speckles, not continuous grass cover in the near field.
- **burn-golden.png B2: 4 → 2** — Possible atmospheric haze visible in mid-distance but no distinct smoke plume clearly anchored to a ground source.
- **elPaso-golden.png U3: 4 → 2** — Some transitions between ground materials appear relatively clean or straight rather than consistently noise-broken and irregular.
- **fortGrant-golden.png U1: 4 → 2** — Ground is predominantly bare reddish dirt with scattered darker patches; not continuous grass cover typical of grassed biome
- **fortGrant-midday.png U3: 4 → 2** — Visible straight boundaries between different ground materials (reddish area in foreground vs. lighter dirt areas) rather than noise-broken irregular transitions.
- **overlook-midday.png U1: 4 → 2** — Near field shows sparse individual grass tufts scattered on bare brown ground rather than continuous cover; density increases toward middle distance, opposite of requirement.
- **overlook-midday.png U2: 4 → 2** — Grass rendered as individual instanced models with regular repeating spacing pattern; creates visible pseudo-grid tiling rather than natural continuous variation at believable scale.
- **ranch-golden.png U2: 4 → 2** — Ground texture is uniformly washed and lacks human-scale detail; surface reads as an undifferentiated sandy plane with scattered specks rather than visible ground variation at eye height.
- **ranch-golden.png U3: 4 → 2** — Road edges are clean and organized boundaries against surrounding ground; material transitions are relatively straight and defined rather than noise-broken and irregular.
- **tribal-midday.png U2: 4 → 2** — Dark vegetation spots form a regular, visible grid pattern across the ground
- **burn-midday.png U1: 3 → 2** — Near field is predominantly bare tan/brown ground with sparse scattered grass, not continuous cover.
- **ironValley-midday.png I1: 3 → 2** — Visible structures are generic shapes; headframe, stamp mill, and tailings are not clearly identifiable as distinct industrial elements.
- **ironValley-midday.png I2: 3 → 2** — Rust and iron materials are not distinctly readable; weathering and color do not clearly differentiate metal from other materials.
- **overlook-golden.png U1: 3 → 2** — Wide expanses of untextured brown dirt in the foreground with only scattered green vegetation dots; ground cover is not continuous.
- **overlook-midday.png U3: 3 → 2** — Clean, straight boundary visible where dark brown ramp begins against lighter foreground, rather than noise-broken irregular transition.
- **silverCreek-golden.png S2: 3 → 2** — False fronts visible but don't span full building width (dark walls visible on sides) and don't hide roofs effectively (roof/structure visible above the tan facades).
- **tribal-midday.png U1: 3 → 2** — Near field is mostly bare dirt with scattered dark specs rather than continuous grass cover
- **tribal-midday.png G1: 3 → 2** — Road edges are too clean and straight, lacking ragged and noise-broken transitions
- **burn-golden.png U3: 5 → 3** — Material transitions between soil tones are gradual but lack visible noise-breaking irregularity; transitions could be more jagged.
- **tribal-midday.png N1: 5 → 3** — Tipis show rotation variation but scale remains relatively uniform
- **badlands-midday.png U5: 4 → 3** — Shadows are minimal and not sufficiently pronounced; lighting reads flat despite high sun angle, with insufficient directional shadow definition.
- **badlands-midday.png D1: 4 → 3** — Distant badlands formation shows some tonal variation suggesting strata, but layering is subtle and could be more pronounced.
- **burn-golden.png U2: 4 → 3** — Ground texture shows color variation but appears somewhat coarse and lacks fine detail for close human-scale inspection.
- **cemetery-golden.png U2: 4 → 3** — The pattern of vegetation specks across the ground appears too uniform and regular, suggesting possible tiling rather than organic grass distribution.
- **cemetery-midday.png U2: 4 → 3** — Dark spots show a somewhat regular recurrent pattern suggesting tiling rather than natural scattered variation.
- **elPaso-golden.png U6: 4 → 3** — Distant trees and landscape features are simplified and somewhat card-like, but remain identifiable by silhouette.
- **fortGrant-golden.png U3: 4 → 3** — Visible demarcation between darker foreground clay and lighter reddish distance ground shows some material seaming
- **huntingCabin-midday.png U3: 4 → 3** — Road edges show some clean, linear boundaries against grass rather than fully noise-broken transitions; left and right edges of the dirt road have straight sections.
- **huntingCabin-midday.png G1: 4 → 3** — Road shows visible wheel-track centerline and margin variation, but edges lack sufficient raggedness and noise-breaking; several straight boundary sections visible against grass.
- **ironValley-midday.png U2: 4 → 3** — Ground texture is relatively uniform and flat rather than exhibiting natural human-scale variation.
- **lakeMercy-midday.png U5: 4 → 3** — Sky and water highlights appear blown out; overall exposure is high for midday sun.
- **overlook-golden.png U3: 4 → 3** — Transition between the darker reddish road and lighter ground shows some defined edges rather than fully noise-broken boundaries.
- **overlook-golden.png G1: 4 → 3** — Road edges show some texture variation but are not fully ragged and noise-broken; center track contrast is visible but edges could be more irregular.
- **ranch-golden.png U6: 4 → 3** — Distant trees and landscape are identifiable by silhouette shape but appear low-poly and blocky; readable but not fully resolved.
- **ranch-midday.png U3: 4 → 3** — Some material transitions between dirt and grass are relatively clean/straight; others are more irregular. Not consistently noise-broken throughout.
- **ranch-midday.png U6: 4 → 3** — Distant trees and objects are identifiable by silhouette but very small and somewhat flattened in appearance.
- **ranch-midday.png R2: 4 → 3** — Roof structure present but hip roof with even overhang on all four sides cannot be confirmed from this angle.
- **ranch-midday.png R4: 4 → 3** — Vertical structure on roof appears present but continuity from wall to above ridge cannot be verified from this angle.
- **silverCreek-midday.png S5: 4 → 3** — Some variation in building colors and heights, but shapes are basic boxes lacking distinctive architectural detail.
- **timberCamp-midday.png U1: 4 → 3** — Wide expanse of bare brown dirt in center work area; grass visible beyond but not continuous in near field.
- **tribal-midday.png N2: 4 → 3** — Tipis arranged in linear alignment rather than organic irregular placement
- **westernRange-golden.png U2: 4 → 3** — Texture is present but minimal, with small speckles on an otherwise uniform wash; lacks strong human-scale detail variation.
- **badlands-golden.png D3: 5 → 4** — Vegetation is sparse and scattered, consistent with arid badlands biome.
- **badlands-midday.png U4: 5 → 4** — All objects including distant trees and foreground rocks rest properly on ground with no visible gaps or floating.
- **burn-golden.png U6: 5 → 4** — Distant trees are readable by silhouette shape against the sky; no visible flatness or popping.
- **cemetery-golden.png C1: 5 → 4** — Headstones show clear variation in size and irregular spacing across the cemetery plot; rotation variation is present though harder to discern from this overhead angle.
- **cemetery-midday.png C1: 5 → 4** — Headstones vary in height and spacing; not evenly-spaced or in a perfectly straight line, showing natural cemetery arrangement variation.
- **elPaso-golden.png U4: 5 → 4** — 
- **elPaso-golden.png U5: 5 → 4** — 
- **fortGrant-golden.png U4: 5 → 4** — 
- **fortGrant-golden.png U5: 5 → 4** — 
- **fortGrant-midday.png F2: 5 → 4** — Interior contains multiple structures including tan/beige buildings and other constructions.
- **huntingCabin-golden.png U4: 5 → 4** — 
- **mission-midday.png U4: 5 → 4** — 
- **northernPines-midday.png U5: 5 → 4** — Lighting is directional and appropriate for high sun, but midday contrast could be slightly more dramatic
- **northernPines-midday.png U6: 5 → 4** — Distant trees are identifiable by shape but are quite small and could read more crisply
- **northernPines-midday.png P4: 5 → 4** — Reads as forest but stand density is somewhat sparse with considerable open space between trees
- **northernPines-midday.png P5: 5 → 4** — Tree heights appear reasonable but difficult to assess fully without building references in frame
- **overlook-golden.png U4: 5 → 4** — 
- **overlook-golden.png U5: 5 → 4** — 
- **overlook-golden.png O1: 5 → 4** — 
- **overlook-midday.png U4: 5 → 4** — Fence structure and terrain features properly meet ground; no visible gaps, floating, or sinking.
- **ranch-golden.png U4: 5 → 4** — All structures appear properly grounded; minor imperfections but no obvious gaps, floating elements, or sinking.
- **ranch-midday.png U4: 5 → 4** — 
- **timberCamp-golden.png T1: 5 → 4** — 
- **timberCamp-midday.png U4: 5 → 4** — 
- **tribal-golden.png U4: 5 → 4** — 
- **tribal-midday.png U4: 5 → 4** — Tipis and posts sit properly on ground with no visible gaps or floating

## Five worst criteria

1. **silverCreek-golden.png S3 (0)** — No church or steeple visible in frame.
1. **silverCreek-golden.png S4 (0)** — No raised boardwalk visible along storefronts.
1. **silverCreek-midday.png S4 (0)** — No raised boardwalk visible; buildings sit directly on ground.
1. **badlands-midday.png U1 (1)** — Ground is predominantly bare brown dirt with minimal grass cover; the near field shows untextured soil rather than continuous grass.
1. **burn-golden.png U1 (1)** — Burn area contains only bare charred soil with no grass cover in the near field.

## Could not assess

- badlands-golden.png G1 — n/a
- badlands-midday.png G1 — n/a—no road visible in this frame
- burn-golden.png G1 — n/a - no road visible in this frame.
- burn-midday.png G1 — n/a
- cemetery-golden.png G1 — n/a
- cemetery-midday.png G1 — Road not clearly visible in this wide distant view; cannot assess edge characteristics.
- elPaso-golden.png G1 — n/a
- fortGrant-golden.png G1 — n/a
- ironValley-golden.png G1 — n/a
- lakeMercy-golden.png G1 — n/a
- lakeMercy-midday.png L4 — n/a
- lakeMercy-midday.png G1 — n/a
- mission-golden.png G1 — n/a
- mission-midday.png G1 — n/a - no gravel road visible in this frame
- overlook-midday.png G1 — n/a
- ranch-midday.png R3 — Porch elements visible but viewing angle and backlighting make it unclear whether posts support a roof or merely exist as separate forms.
- ranch-midday.png R5 — Doors visible on main building but too distant to assess scale against 1.62 m eye height; closer frontal view needed.
- silverCreek-golden.png G1 — n/a
- silverCreek-midday.png S3 — No church structure visible in this frame; cannot assess steeple placement.
- silverCreek-midday.png G1 — n/a - no distinct road with wheel tracks or ragged edges visible in this frame.
- westernRange-golden.png W2 — n/a
- westernRange-golden.png W3 — n/a
- westernRange-golden.png G1 — n/a
- westernRange-midday.png W2 — n/a
- westernRange-midday.png W3 — n/a
- westernRange-midday.png G1 — n/a

## Verdict

- Rubric coverage: **99%** (minimum 80% — criteria the grader declined to judge count against this; genuine n/a does not)
- This pass clean (all scored ≥4, none ≤2, coverage met): **no**
- Previous pass clean: **no**

CONTINUE
